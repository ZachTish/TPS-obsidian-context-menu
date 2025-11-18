import { TFile, Notice, Menu, Platform } from 'obsidian';
import type TPSGlobalContextMenuPlugin from './main';
import {
  FileEntry,
  FrontmatterData,
  ContextEventData,
  ShowMenuOptions,
  BuildPanelOptions,
  FolderOption,
  DateRowResult,
  EndRowResult,
  ParsedRecurrence,
} from './types';
import { STATUSES, PRIORITIES, RECURRENCE_OPTIONS } from './constants';

/**
 * Manages the context menu display and interactions
 */
export class MenuController {
  plugin: TPSGlobalContextMenuPlugin;
  activeMenuEl: HTMLElement | null = null;
  boundOutsideHandler: (e: Event) => void;
  lastContext: ContextEventData | null = null;
  activeRecurrenceModal: HTMLElement | null = null;
  activeRecurrenceAnchor: HTMLElement | null = null;
  boundRecurrenceReposition: (() => void) | null = null;
  lastFiles: TFile[] | null = null;

  constructor(plugin: TPSGlobalContextMenuPlugin) {
    this.plugin = plugin;
    this.boundOutsideHandler = this.handleOutsideInteraction.bind(this);
  }

  /**
   * Clean up and detach the menu controller
   */
  detach(): void {
    this.hideMenu();
  }

  /**
   * Show the context menu for the given files
   */
  showForFiles({ files, event, sourceEl }: ShowMenuOptions): void {
    this.hideMenu();

    const fileList = Array.isArray(files) ? files.filter(Boolean) : [];
    if (!fileList.length) return;

    this.lastFiles = fileList;

    const menuEl = document.createElement('div');
    menuEl.className = 'tps-global-context-menu';
    menuEl.setAttribute('role', 'menu');
    menuEl.tabIndex = -1;

    this.closeRecurrenceModal();

    const header =
      fileList.length > 1
        ? this.plugin.createMultiMenuHeader(fileList)
        : this.plugin.createMenuHeader(fileList[0]);
    menuEl.appendChild(header);

    const panel = this.buildSpecialPanel(fileList, {
      recurrenceRoot: menuEl,
      closeAfterRecurrence: true,
    });

    if (!panel) {
      new Notice('TPS Global Context Menu: No sections available.');
      return;
    }

    menuEl.appendChild(panel);

    const toggleWrapper = document.createElement('div');
    toggleWrapper.className = 'tps-gcm-panel-toggle';
    const toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.textContent = 'File options';
    toggleBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.openNativeOptions();
    });
    toggleWrapper.appendChild(toggleBtn);
    menuEl.appendChild(toggleWrapper);

    document.body.appendChild(menuEl);
    this.activeMenuEl = menuEl;

    this.positionMenu(menuEl, event);

    document.addEventListener('mousedown', this.boundOutsideHandler, true);
    document.addEventListener('touchstart', this.boundOutsideHandler, true);
    document.addEventListener('contextmenu', this.boundOutsideHandler, true);

    this.lastContext = {
      target: sourceEl,
      clientX: event.clientX,
      clientY: event.clientY,
      screenX: event.screenX,
      screenY: event.screenY,
      ctrlKey: event.ctrlKey,
      shiftKey: event.shiftKey,
      altKey: event.altKey,
      metaKey: event.metaKey,
      button: event.button,
    };
  }

  /**
   * Close the recurrence modal if open
   */
  closeRecurrenceModal(): void {
    if (this.activeRecurrenceModal) {
      this.activeRecurrenceModal.remove();
      this.activeRecurrenceModal = null;
    }

    if (this.boundRecurrenceReposition) {
      window.removeEventListener('resize', this.boundRecurrenceReposition, true);
      window.removeEventListener('scroll', this.boundRecurrenceReposition, true);
      this.boundRecurrenceReposition = null;
    }

    this.activeRecurrenceAnchor = null;
  }

  /**
   * Create a simple header for single file
   */
  createMenuHeader(file: TFile): HTMLElement {
    const header = document.createElement('div');
    header.className = 'tps-global-context-header';
    header.textContent = file.basename;
    return header;
  }

  /**
   * Build the special panel with all controls
   */
  buildSpecialPanel(
    files: TFile | TFile[],
    options: BuildPanelOptions = {}
  ): HTMLElement | null {
    const entries = this.createFileEntries(files);
    if (!entries.length) return null;

    const firstFm = entries[0].frontmatter;
    const panel = document.createElement('div');
    panel.className = 'tps-gcm-panel';

    // Multi-file banner
    if (entries.length > 1) {
      const banner = document.createElement('div');
      banner.className = 'tps-gcm-multi-banner';
      banner.textContent = `${entries.length} files selected`;
      panel.appendChild(banner);
    }

    // Title row (single file only)
    if (entries.length === 1) {
      const titleRow = this.createTitleRow(entries);
      if (titleRow) panel.appendChild(titleRow);
    }

    // Status row
    const statusRow = this.createSelectRow(
      'Status',
      STATUSES as unknown as string[],
      firstFm.status || STATUSES[0],
      async (value) => {
        await this.applyToEntries(entries, async (file, fm) => {
          const oldStatus = fm.status || 'open';
          await this.updateFrontmatterValue(file, 'status', value);
          fm.status = value;

          if (value === 'blocked') {
            await this.setRecurrenceFields(file, fm, '');
          }

          if ((value === 'complete' || value === 'wont-do') && oldStatus !== value) {
            await this.handleRecurrenceCompletion(file, fm);
          }
        });
      }
    );
    panel.appendChild(statusRow);

    // Priority row
    const priorityRow = this.createSelectRow(
      'Priority',
      PRIORITIES as unknown as string[],
      firstFm.priority || firstFm.prio || 'normal',
      async (value) => {
        await this.applyToEntries(entries, async (file, fm) => {
          await this.updateFrontmatterValue(file, 'priority', value);
          fm.priority = value;
        });
      }
    );
    panel.appendChild(priorityRow);

    // Type row
    const typeRow = this.createTypeRow(entries);
    panel.appendChild(typeRow);

    // Scheduled row
    const { row: scheduledRow, input: scheduledInput } = this.createDateRow(
      'Scheduled',
      firstFm.scheduled,
      async (value, input) => {
        await this.applyToEntries(entries, async (file, fm) => {
          await this.updateFrontmatterValue(file, 'scheduled', value);
          if (value) {
            fm.scheduled = value;
          } else {
            delete fm.scheduled;
          }

          const endISO = this.computeEndISO(fm);
          await this.updateFrontmatterValue(file, 'sheduledEnd', endISO || null);
          if (endISO) {
            fm.sheduledEnd = endISO;
          } else {
            delete fm.sheduledEnd;
          }
        });

        if (!value && input) {
          input.value = '';
        }
      }
    );
    panel.appendChild(scheduledRow);

    // End row
    const endRowResult = this.createEndRow(entries);
    panel.appendChild(endRowResult.row);
    if (scheduledInput) {
      scheduledInput.addEventListener('change', () => endRowResult.refresh());
    }

    // Tags row
    const tagsRow = this.createTagsRow(entries);
    panel.appendChild(tagsRow);

    // Recurrence row
    const recurrenceRow = this.createRecurrenceRow(entries, {
      recurrenceRoot: options.recurrenceRoot,
      closeAfterRecurrence: options.closeAfterRecurrence,
    });
    panel.appendChild(recurrenceRow);

    // Actions row
    const actionsRow = this.createActionsRow(entries);
    panel.appendChild(actionsRow);

    return panel;
  }

  /**
   * Create file entries with frontmatter
   */
  createFileEntries(files: TFile | TFile[]): FileEntry[] {
    return this.normalizeFileList(files).map((file) => ({
      file,
      frontmatter: this.getFrontmatter(file),
    }));
  }

  /**
   * Normalize file list to array of unique files
   */
  normalizeFileList(files: TFile | TFile[]): TFile[] {
    const fileList = Array.isArray(files) ? files : [files];
    const seen = new Set<string>();
    const result: TFile[] = [];

    fileList.forEach((file) => {
      if (!file || !(file instanceof TFile)) return;
      if (seen.has(file.path)) return;
      seen.add(file.path);
      result.push(file);
    });

    return result;
  }

  /**
   * Apply an async function to all entries
   */
  async applyToEntries(
    entries: FileEntry[],
    fn: (file: TFile, fm: FrontmatterData) => Promise<void>
  ): Promise<void> {
    for (const entry of entries) {
      await fn(entry.file, entry.frontmatter);
    }
  }

  /**
   * Create a select dropdown row
   */
  createSelectRow(
    label: string,
    options: string[],
    currentValue: string,
    onChange: (value: string, select: HTMLSelectElement) => void
  ): HTMLElement {
    const row = document.createElement('div');
    row.className = 'tps-gcm-row';

    const labelEl = document.createElement('label');
    labelEl.textContent = label;

    const select = document.createElement('select');
    const optionList = [...options];

    // Add current value if not in options
    if (currentValue && !optionList.includes(currentValue)) {
      optionList.unshift(currentValue);
    }

    optionList.forEach((opt) => {
      const optEl = document.createElement('option');
      optEl.value = opt;
      optEl.textContent = opt
        .replace(/-/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());
      select.appendChild(optEl);
    });

    if (currentValue && optionList.includes(currentValue)) {
      select.value = currentValue;
    }

    select.addEventListener('change', () => onChange(select.value, select));

    row.appendChild(labelEl);
    row.appendChild(select);
    return row;
  }

  /**
   * Create title input row (single file only)
   */
  createTitleRow(entries: FileEntry[]): HTMLElement | null {
    const first = entries[0];
    if (!first || !first.file) {
      const row = document.createElement('div');
      row.className = 'tps-gcm-row';
      row.textContent = 'No file selected.';
      return row;
    }

    const file = first.file;
    const fm = first.frontmatter || {};

    const row = document.createElement('div');
    row.className = 'tps-gcm-row';

    const label = document.createElement('label');
    label.textContent = 'Title';

    const input = document.createElement('input');
    input.type = 'text';

    const initialTitle =
      typeof fm.title === 'string' && fm.title.trim()
        ? fm.title.trim()
        : file.basename;
    input.value = initialTitle;

    const sanitizeFileName = (val: any, fallback: string): string => {
      const str = (val || '').toString().trim();
      if (!str) return fallback;
      return str
        .replace(/[\\/:*?"<>|]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim() || fallback;
    };

    input.addEventListener('change', async () => {
      const newTitle = (input.value || '').toString().trim();
      if (!newTitle) {
        input.value = initialTitle;
        new Notice('Title cannot be empty.');
        return;
      }

      try {
        await this.applyToEntries(entries, async (f, fmData) => {
          await this.updateFrontmatterValue(f, 'title', newTitle);
          fmData.title = newTitle;

          if (f === file) {
            const ext = f.extension ? `.${f.extension}` : '';
            const parentPath = f.parent?.path || '';
            const sanitized = sanitizeFileName(newTitle, f.basename);
            const newPath = parentPath
              ? `${parentPath}/${sanitized}${ext}`
              : `${sanitized}${ext}`;

            if (newPath !== f.path) {
              const vault = this.plugin.app.vault;
              if (vault.getAbstractFileByPath(newPath)) {
                new Notice('A note with that title already exists in this folder.');
                return;
              }
              await vault.rename(f, newPath);
            }
          }
        });
      } catch (err) {
        console.error('TPS Global Context Menu: Failed to update title/rename file', err);
        new Notice('Unable to update note title.');
      }
    });

    row.appendChild(label);
    row.appendChild(input);
    return row;
  }

  /**
   * Create a date input row
   */
  createDateRow(
    label: string,
    value: string | undefined,
    onChange: (value: string | null, input: HTMLInputElement | null) => void
  ): DateRowResult {
    const row = document.createElement('div');
    row.className = 'tps-gcm-row';

    const labelEl = document.createElement('label');
    labelEl.textContent = label;

    const input = document.createElement('input');
    input.type = 'datetime-local';
    input.value = this.formatDateForInput(value);

    input.addEventListener('change', () => {
      const normalized = this.normalizeInputDate(input.value);
      onChange(normalized, input);
    });

    row.appendChild(labelEl);
    row.appendChild(input);

    return { row, input };
  }

  /**
   * Create tags management row
   */
  createTagsRow(entries: FileEntry[]): HTMLElement {
    const firstFm = entries[0]?.frontmatter || {};

    const row = document.createElement('div');
    row.className = 'tps-gcm-row';

    const label = document.createElement('label');
    label.textContent = 'Tags';

    const tagsContainer = document.createElement('div');
    tagsContainer.className = 'tps-gcm-tags';

    const refreshTags = () => {
      tagsContainer.innerHTML = '';
      const tags = this.extractTags(firstFm);
      firstFm.tags = tags;

      if (!tags.length) {
        const noTags = document.createElement('div');
        noTags.className = 'tps-gcm-tag';
        noTags.textContent = 'No tags';
        tagsContainer.appendChild(noTags);
        return;
      }

      tags.forEach((tag) => {
        const tagEl = document.createElement('span');
        tagEl.className = 'tps-gcm-tag';
        tagEl.textContent = `#${tag}`;

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.textContent = 'x';
        removeBtn.addEventListener('click', async (e) => {
          e.preventDefault();
          await this.applyToEntries(entries, async (file, fm) => {
            await this.removeTagFromFile(file, tag);
            const updatedTags = this.extractTags(fm).filter((t) => t !== tag);
            fm.tags = updatedTags;
          });
          refreshTags();
        });

        tagEl.appendChild(removeBtn);
        tagsContainer.appendChild(tagEl);
      });
    };

    refreshTags();

    // Add tag row
    const addRow = document.createElement('div');
    addRow.className = 'tps-gcm-add-row';

    const inputWrapper = document.createElement('div');
    inputWrapper.className = 'tps-gcm-input-wrapper';

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Add tag';

    const dropdown = document.createElement('div');
    dropdown.className = 'tps-gcm-dropdown';
    dropdown.style.display = 'none';

    inputWrapper.appendChild(input);
    inputWrapper.appendChild(dropdown);

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.textContent = 'Add';

    const hideDropdown = () => {
      dropdown.style.display = 'none';
    };

    const showSuggestions = (query: string) => {
      const lowerQuery = (query || '').toLowerCase();
      const currentTags = new Set(this.extractTags(firstFm));
      const allTags = this.getAllKnownTags()
        .filter((t) => !currentTags.has(t))
        .filter((t) => !lowerQuery || t.toLowerCase().includes(lowerQuery))
        .slice(0, 8);

      dropdown.innerHTML = '';
      if (!allTags.length) {
        hideDropdown();
        return;
      }

      allTags.forEach((tag) => {
        const item = document.createElement('div');
        item.className = 'tps-gcm-dropdown-item';
        item.textContent = `#${tag}`;
        item.addEventListener('mousedown', (e) => e.preventDefault());
        item.addEventListener('click', async (e) => {
          e.preventDefault();
          input.value = tag;
          await addTag();
        });
        dropdown.appendChild(item);
      });

      dropdown.style.display = 'block';
    };

    const addTag = async () => {
      const tagValue = input.value.trim();
      if (!tagValue) return;

      let added = '';
      await this.applyToEntries(entries, async (file, fm) => {
        const result = await this.addTagToFile(file, tagValue);
        if (result && !added) added = result;
        if (result) {
          const tags = this.extractTags(fm);
          if (!tags.includes(result)) tags.push(result);
          fm.tags = tags;
        }
      });

      if (added) refreshTags();
      input.value = '';
      hideDropdown();
    };

    addBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      await addTag();
    });

    input.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        await addTag();
      }
    });

    input.addEventListener('input', () => {
      showSuggestions(input.value);
    });

    input.addEventListener('focus', () => {
      showSuggestions(input.value);
    });

    input.addEventListener('blur', () => {
      setTimeout(hideDropdown, 120);
    });

    addRow.appendChild(inputWrapper);
    addRow.appendChild(addBtn);

    row.appendChild(label);
    row.appendChild(tagsContainer);
    row.appendChild(addRow);

    return row;
  }

  /**
   * Get recurrence value from frontmatter
   */
  getRecurrenceValue(fm: FrontmatterData | undefined): string {
    if (!fm) return '';
    const val = fm.recurrenceRule || fm.recurrence;
    return typeof val === 'string' ? val : '';
  }

  /**
   * Set recurrence fields in frontmatter
   */
  async setRecurrenceFields(
    file: TFile,
    fm: FrontmatterData,
    value: string
  ): Promise<void> {
    const trimmed = typeof value === 'string' ? value.trim() : '';

    await this.plugin.app.fileManager.processFrontMatter(file, (frontmatter) => {
      if (trimmed) {
        frontmatter.recurrenceRule = trimmed;
      } else {
        delete frontmatter.recurrenceRule;
      }
      delete frontmatter.recurrence;
    });

    if (trimmed) {
      fm.recurrenceRule = trimmed;
      delete fm.recurrence;
    } else {
      delete fm.recurrenceRule;
      delete fm.recurrence;
    }
  }

  /**
   * Create recurrence row
   */
  createRecurrenceRow(
    entries: FileEntry[],
    options: BuildPanelOptions = {}
  ): HTMLElement {
    const row = document.createElement('div');
    row.className = 'tps-gcm-row';

    const label = document.createElement('label');
    label.textContent = 'Recurrence';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tps-gcm-input-button';

    const hasRecurrence = entries.some((e) =>
      this.getRecurrenceValue(e.frontmatter)
    );
    btn.textContent = hasRecurrence ? 'Edit recurrence' : 'Add recurrence';

    const closeAfter = options.closeAfterRecurrence ?? true;

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.openRecurrenceModal(
        entries,
        options.recurrenceRoot ?? null,
        closeAfter
      );
    });

    row.appendChild(label);
    row.appendChild(btn);
    return row;
  }

  /**
   * Create type (folder) row
   */
  createTypeRow(entries: FileEntry[]): HTMLElement {
    const firstFile = entries[0]?.file;
    if (!firstFile) {
      const row = document.createElement('div');
      row.className = 'tps-gcm-row';
      row.textContent = 'No files selected.';
      return row;
    }

    const row = document.createElement('div');
    row.className = 'tps-gcm-row';

    const label = document.createElement('label');
    label.textContent = 'Type';

    const wrapper = document.createElement('div');
    wrapper.className = 'tps-gcm-input-wrapper';

    const initialPath =
      firstFile.parent?.path?.replace(/\\/g, '/') || '';

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Folder path';
    input.value = initialPath;

    const dropdown = document.createElement('div');
    dropdown.className = 'tps-gcm-dropdown';
    dropdown.style.display = 'none';

    wrapper.appendChild(input);
    wrapper.appendChild(dropdown);

    const folderOptions = this.getFolderOptions();

    // Add initial path if not in list
    if (initialPath && !folderOptions.some((o) => o.path === initialPath)) {
      folderOptions.unshift({
        path: initialPath,
        display: initialPath.split('/').pop() || initialPath,
      });
    }

    const hideDropdown = () => {
      dropdown.style.display = 'none';
    };

    const moveFiles = async (targetPath: string | undefined) => {
      const pathToUse = typeof targetPath === 'string' ? targetPath : input.value;
      await this.applyToEntries(entries, async (file) => {
        await this.moveFileToFolder(file, pathToUse);
      });

      const normalized = (pathToUse || '')
        .replace(/\\/g, '/')
        .replace(/^\/+|\/+$/g, '');
      input.value = normalized;

      // Add to options if new
      if (normalized && !folderOptions.some((o) => o.path === normalized)) {
        folderOptions.unshift({
          path: normalized,
          display: normalized.split('/').pop() || normalized,
        });
      }

      hideDropdown();
    };

    const showSuggestions = (query: string) => {
      const lowerQuery = (query || '').toLowerCase();
      const filtered = folderOptions
        .filter((o) => !lowerQuery || o.path.toLowerCase().includes(lowerQuery))
        .slice(0, 10);

      dropdown.innerHTML = '';
      if (!filtered.length) {
        hideDropdown();
        return;
      }

      filtered.forEach((opt) => {
        const item = document.createElement('div');
        item.className = 'tps-gcm-dropdown-item';
        item.textContent = opt.display || opt.path || 'Vault';
        item.addEventListener('mousedown', (e) => e.preventDefault());
        item.addEventListener('click', async (e) => {
          e.preventDefault();
          input.value = opt.path;
          await moveFiles(opt.path);
        });
        dropdown.appendChild(item);
      });

      dropdown.style.display = 'block';
    };

    input.addEventListener('input', () => showSuggestions(input.value));
    input.addEventListener('focus', () => {
      showSuggestions(input.value);
      input.select();
    });
    input.addEventListener('mousedown', (e) => {
      if (document.activeElement !== input) {
        e.preventDefault();
        input.focus();
        input.select();
      }
    });
    input.addEventListener('blur', () => {
      setTimeout(hideDropdown, 120);
    });
    input.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        await moveFiles(input.value);
      }
    });

    row.appendChild(label);
    row.appendChild(wrapper);
    return row;
  }

  /**
   * Create end date/time row
   */
  createEndRow(entries: FileEntry[]): EndRowResult {
    const firstFm = entries[0]?.frontmatter || {};

    const row = document.createElement('div');
    row.className = 'tps-gcm-row';

    const label = document.createElement('label');
    label.textContent = 'End';

    const input = document.createElement('input');
    input.type = 'datetime-local';

    const refresh = () => {
      const endISO = this.computeEndISO(firstFm);
      input.value = this.formatDateForInput(endISO);
      input.disabled = !firstFm.scheduled;
    };

    refresh();

    input.addEventListener('change', async () => {
      if (!firstFm.scheduled) {
        input.value = '';
        new Notice('Set a Scheduled time before adjusting End.');
        return;
      }

      const newEndISO = this.normalizeInputDate(input.value);
      if (!newEndISO) return;

      const scheduledDate = new Date(firstFm.scheduled);
      if (isNaN(scheduledDate.getTime())) return;

      const endDate = new Date(newEndISO);
      if (isNaN(endDate.getTime())) return;

      const diffMs = endDate.getTime() - scheduledDate.getTime();
      const minutes = Math.max(0, Math.round(diffMs / 60000));

      await this.applyToEntries(entries, async (file, fm) => {
        if (!fm.scheduled) return;
        await this.updateFrontmatterValue(file, 'timeEstimate', minutes);
        fm.timeEstimate = minutes;
        await this.updateFrontmatterValue(file, 'sheduledEnd', newEndISO);
        fm.sheduledEnd = newEndISO;
      });

      firstFm.timeEstimate = minutes;
      firstFm.sheduledEnd = newEndISO;
      refresh();
    });

    row.appendChild(label);
    row.appendChild(input);

    return { row, input, refresh };
  }

  /**
   * Create actions row (open, delete)
   */
  createActionsRow(entries: FileEntry[]): HTMLElement {
    const row = document.createElement('div');
    row.className = 'tps-gcm-row';

    const label = document.createElement('label');
    label.textContent = 'Actions';

    const actionsRow = document.createElement('div');
    actionsRow.className = 'tps-gcm-actions-row';

    const count = entries.length;
    const files = entries.map((e) => e.file).filter(Boolean);

    // Open button
    const openBtn = document.createElement('button');
    openBtn.type = 'button';
    openBtn.textContent = count === 1 ? 'Open note' : `Open ${count} notes`;
    openBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (!files.length) return;

      const workspace = this.plugin.app.workspace;
      if (!workspace) return;

      const firstLeaf = workspace.getLeaf(false) || workspace.getLeaf(true);
      if (firstLeaf) {
        await firstLeaf.openFile(files[0]);
        for (let i = 1; i < files.length; i += 1) {
          const f = files[i];
          if (!f) continue;
          await workspace.getLeaf(true).openFile(f);
        }
        this.hideMenu();
      }
    });

    // Delete button
    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'tps-gcm-actions-delete';
    deleteBtn.textContent = count === 1 ? 'Delete note' : `Delete ${count} notes`;
    deleteBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (!files.length) return;

      const displayName =
        files.length === 1 && files[0]?.basename
          ? `"${files[0].basename}"`
          : `${files.length} notes`;

      const confirmMsg = `Delete ${displayName}? This will move the file${
        files.length > 1 ? 's' : ''
      } to the system trash (if enabled).`;

      if (!window.confirm(confirmMsg)) return;

      console.log('[TPS GCM] delete confirmed', {
        files: files.map((f) => f?.path),
        ts: Date.now(),
      });

      const vault = this.plugin.app.vault;
      for (const file of files) {
        try {
          await vault.trash(file, true);
        } catch (err) {
          console.error('TPS Global Context Menu: Failed to delete file', err);
          new Notice(`Unable to delete ${file.name}`);
        }
      }

      // Blur and trigger event
      try {
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
      } catch (err) {
        console.warn('TPS GCM: failed to blur after delete', err);
      }

      try {
        this.plugin.app.workspace.trigger('tps-gcm-delete-complete');
      } catch (err) {
        console.warn('TPS GCM: failed to trigger delete-complete', err);
      }

      this.hideMenu();
    });

    actionsRow.appendChild(openBtn);
    actionsRow.appendChild(deleteBtn);

    row.appendChild(label);
    row.appendChild(actionsRow);

    return row;
  }

  /**
   * Compute end ISO from scheduled + timeEstimate
   */
  computeEndISO(fm: FrontmatterData): string {
    const scheduled = fm.scheduled;
    const timeEstimate = Number(fm.timeEstimate);

    if (!scheduled) return '';

    const scheduledDate = new Date(scheduled);
    if (isNaN(scheduledDate.getTime())) return '';
    if (!timeEstimate || isNaN(timeEstimate)) return '';

    const endDate = new Date(scheduledDate.getTime() + timeEstimate * 60000);
    return endDate.toISOString();
  }

  /**
   * Build toolbar for live preview mode
   */
  buildLiveToolbar(file: TFile): HTMLElement | null {
    const entries = this.createFileEntries([file]);
    if (!entries.length) return null;

    const fm = entries[0].frontmatter || {};

    const toolbar = document.createElement('div');
    toolbar.className = 'tps-gcm-toolbar';

    const leftSide = document.createElement('div');

    const statusRow = this.createSelectRow(
      'Status',
      STATUSES as unknown as string[],
      fm.status || STATUSES[0],
      async (value) => {
        await this.applyToEntries(entries, async (f, fmData) => {
          const oldStatus = fmData.status || 'open';
          await this.updateFrontmatterValue(f, 'status', value);
          fmData.status = value;

          if (value === 'blocked') {
            await this.setRecurrenceFields(f, fmData, '');
          }

          if ((value === 'complete' || value === 'wont-do') && oldStatus !== value) {
            await this.handleRecurrenceCompletion(f, fmData);
          }
        });
      }
    );

    const priorityRow = this.createSelectRow(
      'Priority',
      PRIORITIES as unknown as string[],
      fm.priority || fm.prio || 'normal',
      async (value) => {
        await this.applyToEntries(entries, async (f, fmData) => {
          await this.updateFrontmatterValue(f, 'priority', value);
          fmData.priority = value;
        });
      }
    );

    leftSide.appendChild(statusRow);
    leftSide.appendChild(priorityRow);

    const rightSide = document.createElement('div');
    const actionsRow = this.createActionsRow(entries);
    rightSide.appendChild(actionsRow);

    toolbar.appendChild(leftSide);
    toolbar.appendChild(rightSide);

    return toolbar;
  }

  /**
   * Get folder options for type dropdown
   */
  getFolderOptions(): FolderOption[] {
    const vault = this.plugin.app.vault;
    const allFiles =
      typeof vault.getAllLoadedFiles === 'function'
        ? vault.getAllLoadedFiles()
        : [];

    const paths = new Set<string>(['']);

    allFiles.forEach((af) => {
      if (af instanceof Platform.isMobile ? af : af) {
        // TFolder check
        if ('children' in af) {
          const path = (af.path || '').replace(/\\/g, '/');
          paths.add(path);
        }
      }
    });

    return Array.from(paths)
      .sort((a, b) => a.localeCompare(b))
      .map((p) => ({
        path: p,
        display: p ? p.split('/').pop() || p : 'Vault',
      }));
  }

  /**
   * Move file to folder
   */
  async moveFileToFolder(file: TFile, folderPath: string): Promise<void> {
    try {
      const normalized = (folderPath || '')
        .replace(/\\/g, '/')
        .trim()
        .replace(/^\/+|\/+$/g, '');

      const vault = this.plugin.app.vault;

      // Create folder if needed
      if (normalized && !vault.getAbstractFileByPath(normalized)) {
        await vault.createFolder(normalized);
      }

      const newPath = normalized ? `${normalized}/${file.name}` : file.name;
      if (newPath === file.path) return;

      await vault.rename(file, newPath);
    } catch (err) {
      console.error('TPS Global Context Menu: Failed to move file', err);
      new Notice('Unable to move file to the selected type.');
    }
  }

  /**
   * Get frontmatter for a file
   */
  getFrontmatter(file: TFile): FrontmatterData {
    const cache = this.plugin.app.metadataCache.getFileCache(file);
    return Object.assign({}, cache?.frontmatter || {});
  }

  /**
   * Update a frontmatter value
   */
  async updateFrontmatterValue(
    file: TFile,
    key: string,
    value: any
  ): Promise<void> {
    await this.plugin.app.fileManager.processFrontMatter(file, (fm) => {
      if (value == null || value === '') {
        delete fm[key];
      } else {
        fm[key] = value;
      }
    });
  }

  /**
   * Format date for datetime-local input
   */
  formatDateForInput(value: string | undefined): string {
    if (!value) return '';
    const date = new Date(value);
    if (isNaN(date.getTime())) return '';

    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
      date.getDate()
    )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  /**
   * Normalize input date to ISO string
   */
  normalizeInputDate(value: string): string | null {
    if (!value) return null;
    const date = new Date(value);
    return isNaN(date.getTime()) ? null : date.toISOString();
  }

  /**
   * Extract tags from frontmatter
   */
  extractTags(fm: FrontmatterData | undefined): string[] {
    if (!fm) return [];

    const result: string[] = [];

    if (Array.isArray(fm.tags)) {
      fm.tags.forEach((t) => {
        if (typeof t === 'string') {
          result.push(this.normalizeTag(t));
        }
      });
    } else if (typeof fm.tags === 'string') {
      result.push(this.normalizeTag(fm.tags));
    }

    return result.filter(Boolean);
  }

  /**
   * Normalize a tag string
   */
  normalizeTag(tag: any): string {
    if (!tag || typeof tag !== 'string') return '';
    return tag.replace(/^[#\-\s]+/, '').trim();
  }

  /**
   * Add tag to file
   */
  async addTagToFile(file: TFile, tag: string): Promise<string | null> {
    const normalized = this.normalizeTag(tag);
    if (!normalized) return null;

    await this.plugin.app.fileManager.processFrontMatter(file, (fm) => {
      if (!fm.tags) {
        fm.tags = [];
      }

      if (typeof fm.tags === 'string') {
        fm.tags = [fm.tags];
      }

      if (!Array.isArray(fm.tags)) {
        fm.tags = [];
      }

      fm.tags = fm.tags.map((t: any) => this.normalizeTag(t)).filter(Boolean);

      if (!fm.tags.includes(normalized)) {
        fm.tags.push(normalized);
      }
    });

    return normalized;
  }

  /**
   * Remove tag from file
   */
  async removeTagFromFile(file: TFile, tag: string): Promise<void> {
    await this.plugin.app.fileManager.processFrontMatter(file, (fm) => {
      if (!fm.tags) return;

      if (Array.isArray(fm.tags)) {
        fm.tags = fm.tags
          .map((t: any) => this.normalizeTag(t))
          .filter((t: string) => t && t !== tag);
        if (!fm.tags.length) delete fm.tags;
      } else if (this.normalizeTag(fm.tags) === tag) {
        delete fm.tags;
      }
    });
  }

  /**
   * Get all known tags from vault
   */
  getAllKnownTags(): string[] {
    const cache = this.plugin.app.metadataCache;
    const tagsMap =
      typeof cache.getTags === 'function' ? cache.getTags() : {};

    return Object.keys(tagsMap || {})
      .map((t) => this.normalizeTag(t))
      .filter(Boolean)
      .filter((t, i, arr) => arr.indexOf(t) === i)
      .sort((a, b) => a.localeCompare(b));
  }

  /**
   * Position the menu relative to mouse event
   */
  positionMenu(menuEl: HTMLElement, event: MouseEvent): void {
    const { innerWidth, innerHeight } = window;
    const rect = menuEl.getBoundingClientRect();
    const padding = 12;

    let x = event.clientX;
    let y = event.clientY;

    // Keep within viewport
    if (x + rect.width + padding > innerWidth) {
      x = innerWidth - rect.width - padding;
    }
    if (y + rect.height + padding > innerHeight) {
      y = innerHeight - rect.height - padding;
    }

    x = Math.max(padding, x);
    y = Math.max(padding, y);

    // Avoid persistent reading menu
    try {
      const target = event.target instanceof HTMLElement ? event.target : null;
      const previewView = target?.closest('.markdown-preview-view');
      const persistentMenu =
        previewView?.querySelector('.tps-global-context-menu--reading') ||
        document.querySelector('.tps-global-context-menu--reading');

      if (persistentMenu) {
        const persistentRect = persistentMenu.getBoundingClientRect();
        if (persistentRect && persistentRect.height > 0) {
          const minY = persistentRect.bottom + padding;
          const maxY = innerHeight - rect.height - padding;
          y = Math.min(Math.max(minY, padding), maxY);
        }
      }
    } catch (err) {
      // Ignore positioning errors
    }

    menuEl.style.left = `${x}px`;
    menuEl.style.top = `${y}px`;
  }

  /**
   * Hide the active menu
   */
  hideMenu(): void {
    this.closeRecurrenceModal();

    if (this.activeMenuEl) {
      this.activeMenuEl.remove();
      this.activeMenuEl = null;
    }

    document.removeEventListener('mousedown', this.boundOutsideHandler, true);
    document.removeEventListener('touchstart', this.boundOutsideHandler, true);
    document.removeEventListener('contextmenu', this.boundOutsideHandler, true);

    this.lastContext = null;
    this.lastFiles = null;
  }

  /**
   * Handle clicks outside the menu
   */
  handleOutsideInteraction(event: Event): void {
    if (!this.activeMenuEl) return;
    if (event.type === 'blur' || event.type === 'scroll') return;

    const target = event.target instanceof Node ? event.target : null;

    // Prevent context menu inside our menu
    if (event.type === 'contextmenu' && target && this.activeMenuEl.contains(target)) {
      event.preventDefault();
      return;
    }

    if (!target || !this.activeMenuEl.contains(target)) {
      this.hideMenu();
    }
  }

  /**
   * Open native file options menu
   */
  openNativeOptions(): void {
    const firstFile = Array.isArray(this.lastFiles) ? this.lastFiles[0] : null;
    const ctx = this.lastContext;

    this.hideMenu();
    this.plugin.ignoreNextContext = true;

    setTimeout(() => {
      if (firstFile) {
        const menu = new Menu(this.plugin.app);
        this.plugin.app.workspace.trigger('file-menu', menu, firstFile);

        if (ctx) {
          menu.showAtPosition({
            x: ctx.clientX ?? 0,
            y: ctx.clientY ?? 0,
          });
        } else {
          menu.showAtMouseEvent(
            new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
          );
        }
      }

      setTimeout(() => {
        this.plugin.ignoreNextContext = false;
      }, 0);
    }, 0);
  }

  /**
   * Open recurrence modal
   */
  openRecurrenceModal(
    entries: FileEntry | FileEntry[],
    anchorEl: HTMLElement | null = null,
    closeAfter = true
  ): void {
    const entriesList = Array.isArray(entries)
      ? entries
      : [{ file: entries, frontmatter: this.getFrontmatter(entries) }];

    if (!entriesList.length) return;

    this.closeRecurrenceModal();

    const modal = document.createElement('div');
    modal.className = 'tps-gcm-recurrence-modal';
    modal.addEventListener('mousedown', (e) => e.stopPropagation());
    modal.addEventListener('click', (e) => e.stopPropagation());

    const header = document.createElement('div');
    header.className = 'tps-gcm-recurrence-header';
    header.textContent = 'Set recurrence rule';
    modal.appendChild(header);

    // Quick options
    const optionsContainer = document.createElement('div');
    optionsContainer.className = 'tps-gcm-recurrence-options';

    RECURRENCE_OPTIONS.forEach((opt) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = opt.label;
      btn.addEventListener('click', async () => {
        await this.applyRecurrenceRuleToEntries(entriesList, opt.value, closeAfter);
      });
      optionsContainer.appendChild(btn);
    });

    modal.appendChild(optionsContainer);

    // Custom input
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'RRULE:FREQ=...';

    const entryWithRecurrence =
      entriesList.find((e) => this.getRecurrenceValue(e.frontmatter)) ||
      entriesList[0];
    input.value = this.getRecurrenceValue(entryWithRecurrence?.frontmatter);

    input.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        await this.applyRecurrenceRuleToEntries(
          entriesList,
          input.value,
          closeAfter
        );
      }
    });

    modal.appendChild(input);

    // Actions
    const actions = document.createElement('div');
    actions.className = 'tps-gcm-recurrence-actions';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.closeRecurrenceModal();
    });

    const setBtn = document.createElement('button');
    setBtn.type = 'button';
    setBtn.textContent = 'Set';
    setBtn.addEventListener('click', async () => {
      await this.applyRecurrenceRuleToEntries(
        entriesList,
        input.value,
        closeAfter
      );
    });

    actions.appendChild(cancelBtn);
    actions.appendChild(setBtn);
    modal.appendChild(actions);

    (anchorEl || document.body).appendChild(modal);

    this.activeRecurrenceModal = modal;
    this.activeRecurrenceAnchor = anchorEl || this.activeMenuEl || null;

    const reposition = () => this.positionRecurrenceModal();
    this.boundRecurrenceReposition = reposition;

    this.positionRecurrenceModal();

    window.addEventListener('resize', reposition, true);
    window.addEventListener('scroll', reposition, true);
  }

  /**
   * Position recurrence modal
   */
  positionRecurrenceModal(): void {
    if (!this.activeRecurrenceModal || typeof window === 'undefined') return;

    const modal = this.activeRecurrenceModal;

    // Reset position for measurement
    modal.style.visibility = 'hidden';
    modal.style.left = '0px';
    modal.style.top = '0px';

    const vw = window.innerWidth || document.documentElement?.clientWidth || 0;
    const vh = window.innerHeight || document.documentElement?.clientHeight || 0;
    const rect = modal.getBoundingClientRect();
    const anchorRect =
      this.activeRecurrenceAnchor?.getBoundingClientRect
        ? this.activeRecurrenceAnchor.getBoundingClientRect()
        : null;

    const padding = 16;

    let x = anchorRect
      ? anchorRect.left + anchorRect.width / 2 - rect.width / 2
      : (vw - rect.width) / 2;

    let y = anchorRect
      ? anchorRect.top + anchorRect.height / 2 - rect.height / 2
      : (vh - rect.height) / 2;

    x = Math.min(Math.max(padding, x), Math.max(padding, vw - rect.width - padding));
    y = Math.min(Math.max(padding, y), Math.max(padding, vh - rect.height - padding));

    modal.style.left = `${x}px`;
    modal.style.top = `${y}px`;
    modal.style.visibility = 'visible';
  }

  /**
   * Apply recurrence rule to entries
   */
  async applyRecurrenceRuleToEntries(
    entries: FileEntry[],
    value: string,
    closeMenu: boolean
  ): Promise<void> {
    const normalized = this.normalizeRecurrence(value);

    await this.applyToEntries(entries, async (file, fm) => {
      await this.setRecurrenceFields(file, fm, normalized);
    });

    this.closeRecurrenceModal();
    if (closeMenu) this.hideMenu();
  }

  /**
   * Normalize recurrence string
   */
  normalizeRecurrence(value: string): string {
    if (!value) return '';
    const trimmed = value.trim();
    if (!trimmed) return '';
    return /^RRULE:/i.test(trimmed) ? trimmed : `RRULE:${trimmed}`;
  }

  /**
   * Handle recurrence completion (create next occurrence)
   */
  async handleRecurrenceCompletion(
    file: TFile,
    fm: FrontmatterData
  ): Promise<void> {
    const recurrence = this.getRecurrenceValue(fm);
    if (!recurrence) return;

    const scheduled = fm.scheduled;
    if (!scheduled) return;

    const nextDate = this.computeNextOccurrence(recurrence, scheduled);
    if (!nextDate) return;

    const vault = this.plugin.app.vault;
    const parentPath = file.parent?.path || '';
    const newName = this.generateNextName(file.name, nextDate);
    const newPath = parentPath ? `${parentPath}/${newName}` : newName;

    if (vault.getAbstractFileByPath(newPath)) return;

    await vault.copy(file, newPath);

    const newFile = vault.getAbstractFileByPath(newPath);
    if (newFile && newFile instanceof TFile) {
      await this.updateFrontmatterValue(newFile, 'recurrenceRule', null);
      await this.updateFrontmatterValue(newFile, 'recurrence', null);
      await this.updateFrontmatterValue(newFile, 'status', 'open');

      const newScheduledISO = nextDate.toISOString();
      await this.updateFrontmatterValue(newFile, 'scheduled', newScheduledISO);

      const timeEstimate = Number(fm.timeEstimate);
      const endISO = this.computeEndISO({
        scheduled: newScheduledISO,
        timeEstimate,
      });
      await this.updateFrontmatterValue(newFile, 'sheduledEnd', endISO || null);

      await this.updateFrontmatterValue(newFile, 'title', newFile.basename);
    }
  }

  /**
   * Compute next occurrence date
   */
  computeNextOccurrence(rrule: string, scheduled: string): Date | null {
    try {
      const parsed = this.parseRecurrence(rrule);
      const baseDate = new Date(scheduled);

      if (isNaN(baseDate.getTime()) || !parsed.freq) return null;

      const maxIterations = 500;
      let candidate = new Date(baseDate.getTime());
      let iterations = 0;

      while (iterations < maxIterations) {
        candidate = this.incrementRecurrence(candidate, parsed);
        if (this.matchesRecurrence(candidate, baseDate, parsed)) {
          return candidate;
        }
        iterations += 1;
      }

      return null;
    } catch (err) {
      console.error('TPS Global Context Menu: Failed to compute recurrence', err);
      return null;
    }
  }

  /**
   * Parse recurrence rule
   */
  parseRecurrence(rrule: string): ParsedRecurrence {
    const body = rrule.replace(/^RRULE:/i, '').trim();
    const result: ParsedRecurrence = {
      freq: null,
      interval: 1,
      byDay: [],
    };

    if (!body) return result;

    body.split(';').forEach((part) => {
      const [key, val] = part.split('=');
      if (!key || !val) return;

      const k = key.trim().toUpperCase();
      const v = val.trim();

      if (k === 'FREQ') {
        result.freq = v.toUpperCase();
      } else if (k === 'INTERVAL') {
        const num = Number(v);
        if (!Number.isNaN(num) && num > 0) {
          result.interval = num;
        }
      } else if (k === 'BYDAY') {
        result.byDay = v
          .toUpperCase()
          .split(',')
          .map((d) => d.trim())
          .filter(Boolean);
      }
    });

    return result;
  }

  /**
   * Increment date by recurrence rule
   */
  incrementRecurrence(date: Date, parsed: ParsedRecurrence): Date {
    const next = new Date(date.getTime());
    const freq = parsed.freq || 'DAILY';

    if (freq === 'MONTHLY') {
      next.setMonth(next.getMonth() + 1);
    } else {
      next.setDate(next.getDate() + 1);
    }

    return next;
  }

  /**
   * Check if date matches recurrence rule
   */
  matchesRecurrence(
    candidate: Date,
    base: Date,
    parsed: ParsedRecurrence
  ): boolean {
    const freq = parsed.freq || 'DAILY';
    const interval = parsed.interval || 1;

    const daysDiff = Math.floor(
      (candidate.getTime() - base.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysDiff <= 0) return false;

    if (freq === 'DAILY') {
      return daysDiff % interval === 0;
    }

    if (freq === 'WEEKLY' && daysDiff > 0) {
      const weeksDiff = Math.floor(daysDiff / 7);
      if (weeksDiff % interval !== 0) return false;

      if (parsed.byDay.length) {
        const dayCode = this.getWeekdayCode(candidate.getDay());
        return parsed.byDay.includes(dayCode);
      }

      return true;
    }

    if (freq === 'MONTHLY') {
      const monthsDiff =
        (candidate.getFullYear() - base.getFullYear()) * 12 +
        (candidate.getMonth() - base.getMonth());

      if (monthsDiff <= 0) return false;
      if (monthsDiff % interval !== 0) return false;

      return candidate.getDate() === base.getDate();
    }

    return freq === 'DAILY';
  }

  /**
   * Get weekday code (SU, MO, etc)
   */
  getWeekdayCode(day: number): string {
    return ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'][day] || 'MO';
  }

  /**
   * Generate next file name with date
   */
  generateNextName(originalName: string, nextDate: Date): string {
    const dateStr = nextDate.toISOString().slice(0, 10);
    const extMatch = originalName.match(/(\.[^./\\]+)$/);
    const ext = extMatch ? extMatch[1] : '';
    const baseName = (extMatch
      ? originalName.slice(0, -ext.length)
      : originalName
    ).trim();

    // Try to replace existing date
    const replaced = baseName.replace(
      /(.*?)(\d{4}-\d{2}-\d{2})(?!.*\d{4}-\d{2}-\d{2})$/,
      (match, prefix) => `${prefix.trim()} ${dateStr}`
    );

    if (replaced !== baseName) {
      return `${replaced.trim()}${ext}`;
    }

    // Append date
    return `${baseName}${baseName ? ' ' : ''}${dateStr}${ext}`;
  }
}
