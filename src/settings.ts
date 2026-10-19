import { App, PluginSettingTab } from 'obsidian';
import type { SettingDefinitionItem } from 'obsidian';
import type CanvasCards from './main';
import { t } from './i18n';

export type CardAppearance = 'minimal' | 'button';
export type CardTrigger = 'click' | 'icon';

export interface CanvasCardsSettings {
	/** How a card looks on the canvas when the dialog is closed. */
	appearance: CardAppearance;
	/** What opens the dialog: clicking the card body, or the corner button only. */
	trigger: CardTrigger;
	/** Show the first image embed of the body as the card cover. */
	showThumbnails: boolean;
	/** Show the save-status line in the card dialog. */
	showStatus: boolean;
}

export const DEFAULT_SETTINGS: CanvasCardsSettings = {
	appearance: 'minimal',
	trigger: 'click',
	showThumbnails: true,
	showStatus: true,
};

/**
 * Declarative settings (Obsidian 1.13.0+).
 *
 * Obsidian renders the tab from `getSettingDefinitions()`, binds every control
 * to `this.plugin.settings[key]` and persists changes itself.
 */
export class CanvasCardsSettingTab extends PluginSettingTab {
	plugin: CanvasCards;

	constructor(app: App, plugin: CanvasCards) {
		super(app, plugin);
		this.plugin = plugin;
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		return [
			{
				name: t('settingsAppearance'),
				desc: t('settingsAppearanceDesc'),
				control: {
					type: 'dropdown',
					key: 'appearance',
					options: {
						minimal: t('appearanceMinimal'),
						button: t('appearanceButton'),
					},
				},
			},
			{
				name: t('settingsTrigger'),
				desc: t('settingsTriggerDesc'),
				control: {
					type: 'dropdown',
					key: 'trigger',
					options: {
						click: t('triggerClick'),
						icon: t('triggerIcon'),
					},
				},
			},
			{
				name: t('settingsShowThumbnails'),
				desc: t('settingsShowThumbnailsDesc'),
				control: {
					type: 'toggle',
					key: 'showThumbnails',
				},
			},
			{
				name: t('settingsShowStatus'),
				desc: t('settingsShowStatusDesc'),
				control: {
					type: 'toggle',
					key: 'showStatus',
				},
			},
		];
	}

	override setControlValue(key: string, value: unknown): void | Promise<void> {
		const result = super.setControlValue(key, value);
		// Re-apply card classes right away so the appearance switch is visible.
		this.plugin.applyAppearance();
		return result;
	}
}
