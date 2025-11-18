import { App, PluginSettingTab, Setting } from 'obsidian';
import type TPSGlobalContextMenuPlugin from './main';

/**
 * Settings tab for the plugin
 */
export class TPSGlobalContextMenuSettingTab extends PluginSettingTab {
  plugin: TPSGlobalContextMenuPlugin;

  constructor(app: App, plugin: TPSGlobalContextMenuPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;

    containerEl.empty();

    containerEl.createEl('h2', { text: 'TPS Global Context Menu' });

    containerEl.createEl('p', {
      text: 'Define a single context menu that can be reused throughout the vault. Menu items accept JSON definitions to keep the configuration portable and extendable.',
    });

    new Setting(containerEl)
      .setName('Enable in Live Preview & Editor')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.enableInLivePreview)
          .onChange(async (value) => {
            this.plugin.settings.enableInLivePreview = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Enable in Reading View & Popovers')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.enableInPreview)
          .onChange(async (value) => {
            this.plugin.settings.enableInPreview = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Enable in side panels')
      .setDesc(
        'Toggle whether the menu should appear in explorer panes, backlinks, canvases, etc.'
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.enableInSidePanels)
          .onChange(async (value) => {
            this.plugin.settings.enableInSidePanels = value;
            await this.plugin.saveSettings();
          })
      );

    containerEl.createEl('p', {
      text: 'Note: this plugin focuses on the single shared context menu rendered in-line, so there is no separate file options panel.',
    });
  }
}
