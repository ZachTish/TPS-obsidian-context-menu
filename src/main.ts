import { Plugin, TFile, TFolder, Platform } from 'obsidian';
import { TPSGlobalContextMenuSettings, BuildPanelOptions } from './types';
import { DEFAULT_SETTINGS, PLUGIN_STYLES } from './constants';
import { MenuController } from './menu-controller';
import { PersistentMenuManager } from './persistent-menu-manager';
import { TPSGlobalContextMenuSettingTab } from './settings-tab';

/**
 * Main plugin class for TPS Global Context Menu
 */
export default class TPSGlobalContextMenuPlugin extends Plugin {
  settings: TPSGlobalContextMenuSettings;
  menuController: MenuController;
  persistentMenuManager: PersistentMenuManager;
  styleEl: HTMLStyleElement | null = null;
  ignoreNextContext = false;
  keyboardVisible = false;

  async onload(): Promise<void> {
    this.ignoreNextContext = false;

    await this.loadSettings();

    this.menuController = new MenuController(this);
    this.persistentMenuManager = new PersistentMenuManager(this);

    this.injectStyles();

    this.keyboardVisible = false;

    // Register context menu handler
    const handler = this.handleContextMenuEvent.bind(this);
    document.addEventListener('contextmenu', handler, true);
    this.register(() => document.removeEventListener('contextmenu', handler, true));

    // Add settings tab
    this.addSettingTab(new TPSGlobalContextMenuSettingTab(this.app, this));

    // Register persistent menu updates
    const ensureMenus = this.persistentMenuManager.ensureMenus.bind(
      this.persistentMenuManager
    );

    this.registerEvent(this.app.workspace.on('layout-change', ensureMenus));
    this.registerEvent(this.app.workspace.on('active-leaf-change', ensureMenus));
    this.registerEvent(this.app.workspace.on('file-open', ensureMenus));
    this.registerEvent(this.app.vault.on('modify', ensureMenus));

    this.register(() => this.persistentMenuManager.detach());

    // Handle file deletions
    this.registerEvent(
      this.app.vault.on('delete', () => {
        console.log('[TPS GCM] vault delete detected; blurring and closing menu');

        try {
          if (document.activeElement instanceof HTMLElement) {
            document.activeElement.blur();
          }
        } catch (err) {
          console.warn('TPS GCM: blur after delete failed', err);
        }

        try {
          this.menuController?.hideMenu?.();
        } catch (err) {
          console.warn('TPS GCM: hideMenu after delete failed', err);
        }

        try {
          this.app.workspace.trigger('tps-gcm-delete-complete');
        } catch (err) {
          console.warn('TPS GCM: trigger delete-complete failed', err);
        }
      })
    );

    // Initial menu setup
    ensureMenus();

    // Mobile keyboard suppression
    if (this.settings.suppressMobileKeyboard && Platform?.isMobile) {
      this.register(() => this.menuController?.detach());
    }

    this.setupMobileKeyboardWatcher();
  }

  onunload(): void {
    this.menuController?.detach();
    this.removeStyles();
    this.persistentMenuManager?.detach();
    document.body?.classList?.remove('tps-context-hidden-for-keyboard');
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  /**
   * Inject plugin styles into the document
   */
  injectStyles(): void {
    if (this.styleEl) return;

    const style = document.createElement('style');
    style.id = 'tps-global-context-style';
    style.textContent = PLUGIN_STYLES;

    document.head.appendChild(style);
    this.styleEl = style;
  }

  /**
   * Create header element for single file
   */
  createMenuHeader(file: TFile): HTMLElement {
    const header = document.createElement('div');
    header.className = 'tps-global-context-header';
    header.textContent = file.basename;
    return header;
  }

  /**
   * Create header element for multiple files
   */
  createMultiMenuHeader(files: TFile[]): HTMLElement {
    const header = document.createElement('div');
    header.className = 'tps-global-context-header';
    header.textContent = `${files.length} files selected`;
    return header;
  }

  /**
   * Build special panel (delegates to MenuController)
   */
  buildSpecialPanel(
    files: TFile | TFile[],
    options: BuildPanelOptions = {}
  ): HTMLElement | null {
    if (!this.menuController) return null;
    return this.menuController.buildSpecialPanel(files, options);
  }

  /**
   * Setup mobile keyboard watcher to hide menu when keyboard appears
   */
  setupMobileKeyboardWatcher(): void {
    if (
      !this.settings.suppressMobileKeyboard ||
      !Platform?.isMobile ||
      typeof window === 'undefined'
    ) {
      return;
    }

    const viewport = window.visualViewport;
    if (!viewport) return;

    let initialHeight = viewport.height;
    const threshold = 120;

    const checkKeyboard = () => {
      // Update initial height if viewport grows
      if (!initialHeight || viewport.height > initialHeight) {
        initialHeight = viewport.height;
      }

      const isKeyboardVisible =
        (initialHeight || viewport.height) - viewport.height > threshold;

      if (isKeyboardVisible !== this.keyboardVisible) {
        this.keyboardVisible = isKeyboardVisible;

        if (isKeyboardVisible) {
          document.body?.classList?.add('tps-context-hidden-for-keyboard');
          this.menuController?.hideMenu();
        } else {
          document.body?.classList?.remove('tps-context-hidden-for-keyboard');
        }
      }
    };

    viewport.addEventListener('resize', checkKeyboard);
    this.register(() => viewport.removeEventListener('resize', checkKeyboard));

    checkKeyboard();
  }

  /**
   * Remove injected styles
   */
  removeStyles(): void {
    if (this.styleEl) {
      this.styleEl.remove();
      this.styleEl = null;
    }
  }

  /**
   * Handle context menu events
   */
  handleContextMenuEvent(event: MouseEvent): void {
    if (this.ignoreNextContext) {
      this.ignoreNextContext = false;
      return;
    }

    if (!this.menuController || event.defaultPrevented) return;

    const linkedEl = this.findLinkedElementFromEvent(event);
    if (!linkedEl || !this.shouldHandleElement(linkedEl)) return;

    const files = this.resolveFilesFromElement(linkedEl);
    if (!files.length) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();

    this.menuController.showForFiles({
      files,
      event,
      sourceEl: linkedEl,
    });
  }

  /**
   * Check if we should handle this element
   */
  shouldHandleElement(el: HTMLElement): boolean {
    // Skip fold indicators and muted elements
    if (el.closest('.cm-fold-indicator')) return false;
    if (el.closest('.is-muted')) return false;

    // Skip side panels if disabled
    if (!this.settings.enableInSidePanels) {
      if (
        el.closest(
          '.workspace-leaf-resize-handle, .side-dock-collapsible-section, .nav-files-container'
        )
      ) {
        return false;
      }
    }

    return true;
  }

  /**
   * Resolve files from element (handles multi-selection)
   */
  resolveFilesFromElement(el: HTMLElement): TFile[] {
    const singleFile = this.resolveSingleFileFromElement(el);
    if (!singleFile) return [];

    const multiSelection = this.collectExplorerSelection(el, singleFile);
    return multiSelection.length ? multiSelection : [singleFile];
  }

  /**
   * Resolve a single file from element
   */
  resolveSingleFileFromElement(el: HTMLElement): TFile | null {
    const { vault, metadataCache } = this.app;

    // Try data attributes
    const pathContainer = el.closest('[data-path], [data-filepath], [data-note]');
    let path =
      pathContainer?.getAttribute('data-path') ||
      pathContainer?.getAttribute('data-filepath') ||
      pathContainer?.getAttribute('data-note') ||
      el.getAttribute('data-path') ||
      el.getAttribute('data-filepath') ||
      el.getAttribute('data-note');

    if (path) {
      path = path.replace(/\\/g, '/').replace(/^\/+/, '');
      const file = vault.getAbstractFileByPath(path);
      if (file && file instanceof TFile) return file;
    }

    // Try href attributes for internal links
    const href =
      el.getAttribute('data-href') ||
      el.getAttribute('href') ||
      el.dataset?.href;

    if (!href) return null;

    const activeFile = this.app.workspace.getActiveFile();
    return metadataCache.getFirstLinkpathDest(href, activeFile?.path ?? '');
  }

  /**
   * Collect multi-selection from file explorer
   */
  collectExplorerSelection(el: HTMLElement, fallbackFile: TFile): TFile[] {
    const fileItem = el.closest?.(
      '.nav-file, .tree-item-self'
    ) as HTMLElement | null;
    if (!fileItem) return [];

    const container = fileItem.closest?.(
      '.nav-files-container, .tree-container, .tree-view'
    ) as HTMLElement | null;
    if (!container) return [];

    const selectedEls = Array.from(
      container.querySelectorAll(
        '.nav-file.is-selected, .tree-item-self.is-selected, .tree-row.is-selected'
      )
    );

    if (!selectedEls.length) return [];

    const result: TFile[] = [];
    const seen = new Set<string>();

    const addFile = (file: TFile | null) => {
      if (!file || !(file instanceof TFile)) return;
      if (seen.has(file.path)) return;
      seen.add(file.path);
      result.push(file);
    };

    const { vault } = this.app;

    selectedEls.forEach((selEl) => {
      const dataPath =
        (selEl as HTMLElement).dataset?.path ||
        (selEl as HTMLElement).getAttribute?.('data-path');

      if (!dataPath) return;

      const normalized = dataPath.replace(/\\/g, '/').replace(/^\/+/, '');
      const file = vault.getAbstractFileByPath(normalized);
      addFile(file as TFile);
    });

    // Ensure fallback file is included
    addFile(fallbackFile);

    return result;
  }

  /**
   * Find linked element from event path
   */
  findLinkedElementFromEvent(event: MouseEvent): HTMLElement | null {
    // Try composed path first
    const path = event.composedPath?.();
    if (path) {
      for (const item of path) {
        if (!(item instanceof HTMLElement)) continue;
        const linked = this.findLinkedElement(item);
        if (linked) return linked;
      }
    }

    // Fallback to target
    const target =
      event.target instanceof HTMLElement
        ? event.target
        : ((event.target as any)?.parentElement ?? null);

    return target ? this.findLinkedElement(target) : null;
  }

  /**
   * Find linked element by traversing up the DOM
   */
  findLinkedElement(el: HTMLElement): HTMLElement | null {
    // Check if element itself is a note link
    let current: HTMLElement | null = el;
    while (current) {
      if (this.isNoteLink(current)) return current;
      current = current.parentElement;
    }

    // Check for data attributes
    const dataEl = el.closest?.(
      '[data-path], [data-filepath], [data-note]'
    ) as HTMLElement | null;
    if (dataEl) return dataEl;

    // Check for file tree items
    const treeEl = el.closest?.(
      '.nav-file-title, .nav-file-title-content, .nav-folder-title, .tree-row, .tree-item-self, .render-tree-row'
    ) as HTMLElement | null;

    if (treeEl?.dataset?.path) return treeEl;

    // Fallback to any data-path
    const anyDataPath = el.closest?.('[data-path]') as HTMLElement | null;
    return anyDataPath || null;
  }

  /**
   * Check if element is a note link
   */
  isNoteLink(el: HTMLElement): boolean {
    if (!(el instanceof HTMLElement)) return false;

    if (el.dataset && (el.dataset.href || el.dataset.path || el.dataset.note)) {
      return true;
    }

    if (el.classList.contains('internal-link')) return true;
    if (el.matches?.("a[href^='obsidian://open?file=']")) return true;
    if (el.classList.contains('data-link-text')) return true;

    return false;
  }
}
