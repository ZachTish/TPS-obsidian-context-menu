import { MarkdownView, MarkdownViewMode, TFile } from 'obsidian';
import type TPSGlobalContextMenuPlugin from './main';
import { MenuInstances } from './types';

// Get the LIVE mode constant if available
const LIVE_PREVIEW_MODE = MarkdownViewMode ? (MarkdownViewMode as any).LIVE : null;

/**
 * Manages persistent menus in reading and live preview modes
 */
export class PersistentMenuManager {
  plugin: TPSGlobalContextMenuPlugin;
  menus: Map<MarkdownView, MenuInstances> = new Map();

  constructor(plugin: TPSGlobalContextMenuPlugin) {
    this.plugin = plugin;
  }

  /**
   * Ensure menus exist for all active markdown views
   */
  ensureMenus(): void {
    if (!this.plugin?.app?.workspace) return;

    const activeViews = new Set<MarkdownView>();

    this.plugin.app.workspace.getLeavesOfType('markdown').forEach((leaf) => {
      const view = leaf.view as MarkdownView;
      if (!view || !view.file) return;

      activeViews.add(view);
      this.ensureReadingMenu(view);
      this.ensureLiveMenu(view);
    });

    // Clean up menus for views that no longer exist
    for (const view of Array.from(this.menus.keys())) {
      if (!activeViews.has(view)) {
        this.cleanup(view);
      }
    }
  }

  /**
   * Ensure reading mode menu exists
   */
  ensureReadingMenu(view: MarkdownView): void {
    const container =
      (view as any).previewMode?.containerEl ??
      view.contentEl?.querySelector('.markdown-preview-view');

    if (!container) {
      this.removeReadingMenu(view);
      return;
    }

    const instances = this.menus.get(view) || {};

    // If menu already exists and is attached, do nothing
    if (instances.reading && container.contains(instances.reading)) {
      return;
    }

    this.removeReadingMenu(view);

    const menu = this.createPersistentMenu(view, 'reading');
    if (menu) {
      container.prepend(menu);
      instances.reading = menu;
      this.menus.set(view, instances);
    }
  }

  /**
   * Ensure live preview menu exists
   */
  ensureLiveMenu(view: MarkdownView): void {
    const sourceContainer = (view as any).sourceMode?.containerEl?.querySelector(
      '.markdown-source-view'
    );
    const mode =
      typeof view.getMode === 'function' ? view.getMode() : null;

    // Only show in live preview mode
    if (
      !sourceContainer ||
      !(LIVE_PREVIEW_MODE === null || mode === LIVE_PREVIEW_MODE) ||
      !sourceContainer.classList?.contains('is-live-preview')
    ) {
      this.removeLiveMenu(view);
      return;
    }

    const instances = this.menus.get(view) || {};

    // If menu already exists and is attached, do nothing
    if (instances.live && sourceContainer.contains(instances.live)) {
      return;
    }

    this.removeLiveMenu(view);

    const menu = this.createPersistentMenu(view, 'live');
    if (menu) {
      sourceContainer.appendChild(menu);
      instances.live = menu;
      this.menus.set(view, instances);
    }
  }

  /**
   * Create a persistent menu element
   */
  createPersistentMenu(
    view: MarkdownView,
    mode: 'reading' | 'live'
  ): HTMLElement | null {
    const file = view.file;
    if (!file) return null;

    const menuEl = document.createElement('div');
    menuEl.className = `tps-global-context-menu tps-global-context-menu--persistent tps-global-context-menu--${mode}`;
    menuEl.setAttribute('role', 'presentation');

    const header = this.plugin.createMenuHeader(file);
    menuEl.appendChild(header);

    const panel = this.plugin.buildSpecialPanel(file, {
      recurrenceRoot: menuEl,
      closeAfterRecurrence: false,
    });

    if (!panel) return null;

    menuEl.appendChild(panel);
    return menuEl;
  }

  /**
   * Remove reading menu from view
   */
  removeReadingMenu(view: MarkdownView): void {
    const instances = this.menus.get(view);
    if (!instances?.reading) return;

    instances.reading.remove();
    instances.reading = null;

    if (!instances.live) {
      this.menus.delete(view);
      return;
    }

    this.menus.set(view, instances);
  }

  /**
   * Remove live menu from view
   */
  removeLiveMenu(view: MarkdownView): void {
    const instances = this.menus.get(view);
    if (!instances?.live) return;

    instances.live.remove();
    instances.live = null;

    if (!instances.reading) {
      this.menus.delete(view);
      return;
    }

    this.menus.set(view, instances);
  }

  /**
   * Clean up all menus for a view
   */
  cleanup(view: MarkdownView): void {
    const instances = this.menus.get(view);
    if (!instances) return;

    instances.reading?.remove();
    instances.live?.remove();
    this.menus.delete(view);
  }

  /**
   * Detach all menus
   */
  detach(): void {
    for (const view of Array.from(this.menus.keys())) {
      this.cleanup(view);
    }
  }
}
