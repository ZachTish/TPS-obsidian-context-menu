import { TPSGlobalContextMenuSettings } from './types';

/**
 * Default plugin settings
 */
export const DEFAULT_SETTINGS: TPSGlobalContextMenuSettings = {
  enableInLivePreview: true,
  enableInPreview: true,
  enableInSidePanels: true,
  suppressMobileKeyboard: true,
};

/**
 * Available task statuses
 */
export const STATUSES = ['open', 'working', 'blocked', 'wont-do', 'complete'] as const;

/**
 * Available priority levels
 */
export const PRIORITIES = ['high', 'medium', 'normal', 'low'] as const;

/**
 * Recurrence rule quick options
 */
export const RECURRENCE_OPTIONS = [
  { label: 'Daily', value: 'RRULE:FREQ=DAILY' },
  { label: 'Weekdays', value: 'RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR' },
  { label: 'Weekly', value: 'RRULE:FREQ=WEEKLY' },
  { label: 'Monthly', value: 'RRULE:FREQ=MONTHLY' },
] as const;

/**
 * CSS styles for the plugin
 */
export const PLUGIN_STYLES = `
      .tps-global-context-menu {
        position: fixed;
        min-width: 220px;
        background-color: var(--background-secondary);
        color: var(--text-normal);
        border: 1px solid var(--background-modifier-border);
        border-radius: 8px;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25);
        z-index: 9999;
        padding: 6px 0;
        font-size: 14px;
        backdrop-filter: blur(6px);
        animation: tps-context-fade 120ms ease-out;
      }
      @keyframes tps-context-fade {
        from { opacity: 0; transform: translateY(4px) scale(0.98); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }
      .tps-global-context-item {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        width: 100%;
        border: none;
        background: transparent;
        padding: 6px 14px;
        text-align: left;
        cursor: pointer;
        color: inherit;
      }
      .tps-global-context-item:hover,
      .tps-global-context-item:focus {
        background-color: var(--background-modifier-hover);
        outline: none;
      }
      .tps-global-context-item-label {
        font-weight: 500;
      }
      .tps-global-context-item-desc {
        font-size: 12px;
        color: var(--text-muted);
      }
      .tps-global-context-header {
        padding: 4px 14px 8px;
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: var(--text-faint);
      }
      .tps-gcm-panel {
        padding: 8px 14px 12px;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .tps-gcm-multi-banner {
        font-size: 12px;
        color: var(--text-muted);
        background: var(--background-modifier-hover);
        padding: 4px 8px;
        border-radius: 6px;
      }
      .tps-gcm-row {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .tps-gcm-row label {
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        color: var(--text-muted);
      }
      .tps-gcm-input-wrapper {
        position: relative;
        width: 100%;
        display: flex;
        flex-direction: column;
      }
      .tps-gcm-row select,
      .tps-gcm-row input[type="text"],
      .tps-gcm-row input[type="datetime-local"],
      .tps-gcm-row input[type="date"] {
        width: 100%;
        border-radius: 6px;
        border: 1px solid var(--background-modifier-border);
        background: var(--background-primary);
        color: var(--text-normal);
        padding: 4px 8px;
      }
      .tps-global-context-menu--persistent {
        margin-bottom: 12px;
      }
      /* Reading view: full-size panel at the top of the note body.
         It scrolls away with the content (no sticky behavior). */
      .tps-global-context-menu--reading {
        position: static;
        top: auto;
        z-index: auto;
      }
      /* Live preview: compact toolbar that hugs the bottom of the editor and
         stays visible while scrolling. */
      .tps-global-context-menu--live {
        position: sticky;
        bottom: 0;
        z-index: 3;
        padding: 4px 8px;
      }
      .tps-gcm-toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }
      .tps-gcm-toolbar .tps-gcm-row {
        margin: 0;
        padding: 0;
      }
      .tps-gcm-toolbar .tps-gcm-row > label {
        display: none;
      }
      .tps-gcm-toolbar select,
      .tps-gcm-toolbar input,
      .tps-gcm-toolbar .tps-gcm-actions-row button {
        font-size: 11px;
        padding: 2px 6px;
      }
      .tps-gcm-toolbar .tps-gcm-actions-row {
        gap: 4px;
      }
      .tps-global-context-menu--persistent.tps-global-context-menu--reading {
        position: static !important;
        top: auto !important;
        bottom: auto !important;
        left: auto !important;
        right: auto !important;
        transform: none !important;
      }
      .tps-context-hidden-for-keyboard .tps-global-context-menu {
        opacity: 0;
        pointer-events: none;
      }
      .tps-gcm-tags {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }
      .tps-gcm-tag {
        background: var(--background-modifier-hover);
        border-radius: 999px;
        padding: 2px 8px;
        font-size: 12px;
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .tps-gcm-tag button {
        border: none;
        background: transparent;
        color: var(--text-muted);
        cursor: pointer;
        font-size: 11px;
        padding: 0;
      }
      .tps-gcm-panel--hidden {
        display: none;
      }
      .tps-gcm-panel-toggle {
        display: flex;
        justify-content: flex-end;
        padding: 6px 14px 10px;
      }
      .tps-gcm-panel-toggle button {
        font-size: 12px;
        border: none;
        cursor: pointer;
        color: var(--interactive-accent);
        background: transparent;
      }
      .tps-gcm-add-row {
        display: flex;
        gap: 6px;
      }
      .tps-gcm-add-row .tps-gcm-input-wrapper {
        flex: 1;
      }
      .tps-gcm-add-row button {
        border-radius: 6px;
        border: 1px solid var(--background-modifier-border);
        background: var(--background-modifier-hover);
        padding: 4px 8px;
        cursor: pointer;
        white-space: nowrap;
      }
      .tps-gcm-dropdown {
        position: absolute;
        top: calc(100% + 4px);
        left: 0;
        right: 0;
        border: 1px solid var(--background-modifier-border);
        border-radius: 6px;
        background: var(--background-primary);
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
        max-height: 200px;
        overflow-y: auto;
        z-index: 10000;
      }
      .tps-gcm-dropdown-item {
        padding: 6px 10px;
        cursor: pointer;
      }
      .tps-gcm-dropdown-item:hover {
        background: var(--background-modifier-hover);
      }
      .tps-gcm-input-button {
        width: 100%;
        border-radius: 6px;
        border: 1px solid var(--background-modifier-border);
        background: var(--background-primary);
        color: var(--text-normal);
        padding: 6px 8px;
        text-align: left;
        cursor: pointer;
      }
      .tps-gcm-recurrence-modal {
        position: fixed;
        top: 0;
        left: 0;
        transform: none;
        width: min(320px, calc(100vw - 32px));
        background: var(--background-secondary);
        border: 1px solid var(--background-modifier-border);
        border-radius: 10px;
        box-shadow: 0 20px 40px rgba(0, 0, 0, 0.35);
        padding: 14px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        z-index: 10001;
        max-height: calc(100vh - 32px);
        overflow-y: auto;
      }
      .tps-gcm-recurrence-options {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }
      .tps-gcm-recurrence-options button {
        flex: 1 1 40%;
        border-radius: 6px;
        border: 1px solid var(--background-modifier-border);
        background: var(--background-primary);
        color: var(--text-normal);
        padding: 6px;
        cursor: pointer;
        font-size: 12px;
      }
      .tps-gcm-recurrence-header {
        font-size: 11px;
        text-transform: uppercase;
        color: var(--text-muted);
        letter-spacing: 0.1em;
      }
      .tps-gcm-recurrence-actions {
        display: flex;
        gap: 6px;
        justify-content: flex-end;
      }
      .tps-gcm-recurrence-actions button {
        border-radius: 6px;
        border: 1px solid var(--background-modifier-border);
        background: var(--background-modifier-hover);
        color: var(--text-normal);
        padding: 6px 12px;
        cursor: pointer;
      }
      .tps-gcm-actions-row {
        display: flex;
        justify-content: space-between;
        gap: 6px;
        margin-top: 4px;
      }
      .tps-gcm-actions-row button {
        flex: 1;
        border-radius: 6px;
        border: 1px solid var(--background-modifier-border);
        background: var(--background-modifier-hover);
        color: var(--text-normal);
        padding: 6px 8px;
        cursor: pointer;
      }
      .tps-gcm-actions-row button.tps-gcm-actions-delete {
        color: var(--text-accent);
      }
    `;
