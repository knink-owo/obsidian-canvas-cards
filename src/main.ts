import { Menu, Notice, Plugin } from 'obsidian';
import type { EventRef, TFile, WorkspaceLeaf } from 'obsidian';
import { CanvasBinding } from './canvas/binding';
import type { CardHit } from './canvas/binding';
import { createCardData, isCardNode, readCard, writeCard } from './canvas/card';
import { CardIndex } from './canvas/card-index';
import { exportCardToNote } from './canvas/export';
import type { CanvasLike, CanvasNodeLike, CanvasViewLike } from './canvas/internals';
import { getCanvasNodes, getCanvasView, getNodeData, isTextNode } from './canvas/internals';
import { t } from './i18n';
import {
	DEFAULT_SETTINGS,
	CanvasCardsSettingTab,
} from './settings';
import type { CanvasCardsSettings } from './settings';
import { CardModal } from './ui/card-modal';
import type { CardModalOptions } from './ui/card-modal';
import { CardSearchModal } from './ui/card-search-modal';

const DEFAULT_CARD_SIZE = { width: 300, height: 96 };
const CLICK_DRAG_TOLERANCE = 5;
/** Elements that should keep their native click behaviour inside a card. */
const NATIVE_INTERACTIVE_SELECTOR =
	'a, button, input, textarea, select, .cm-editor, .interactive-child, .canvas-cards-ignore';

interface CanvasContext {
	leaf: WorkspaceLeaf;
	canvas: CanvasLike;
	view: CanvasViewLike;
}

type RawWorkspaceOn = (
	name: string,
	callback: (...args: unknown[]) => void,
) => EventRef;

/**
 * Canvas Cards
 *
 * Cards are ordinary Canvas text nodes whose body lives in a custom node
 * field. The node looks like a clickable title; clicking it opens a dialog
 * with the Markdown body.
 */
export default class CanvasCards extends Plugin {
	settings!: CanvasCardsSettings;

	private readonly bindings = new Map<WorkspaceLeaf, CanvasBinding>();
	private readonly openModals = new Set<CardModal>();
	private pointerStart: { x: number; y: number } | null = null;
	private unloading = false;
	/** Vault-wide card index used by search (built from plain `.canvas` JSON). */
	cardIndex!: CardIndex;

	async onload(): Promise<void> {
		await this.loadSettings();
		this.cardIndex = new CardIndex(this.app);
		this.addSettingTab(new CanvasCardsSettingTab(this.app, this));

		this.app.workspace.onLayoutReady(() => {
			if (!this.unloading) this.syncBindings();
		});
		this.registerEvent(this.app.workspace.on('layout-change', () => this.syncBindings()));
		this.registerEvent(this.app.workspace.on('active-leaf-change', () => this.syncBindings()));

		this.registerDomEvent(document, 'pointerdown', this.handlePointerDown, { capture: true });
		this.registerDomEvent(document, 'click', this.handleClick, { capture: true });
		this.registerDomEvent(document, 'dblclick', this.handleDoubleClick, { capture: true });

		this.registerCardMenu();
		this.registerCommands();
	}

	onunload(): void {
		this.unloading = true;
		for (const modal of Array.from(this.openModals)) {
			try {
				modal.close();
			} catch (error) {
				console.error('Canvas Cards: failed to close an open dialog', error);
			}
		}
		this.openModals.clear();
		for (const binding of this.bindings.values()) binding.destroy();
		this.bindings.clear();
	}

	async loadSettings(): Promise<void> {
		const loaded = (await this.loadData()) as Partial<CanvasCardsSettings> | null;
		this.settings = { ...DEFAULT_SETTINGS, ...(loaded ?? {}) };
		if (this.settings.appearance !== 'minimal' && this.settings.appearance !== 'button') {
			this.settings.appearance = DEFAULT_SETTINGS.appearance;
		}
		if (this.settings.trigger !== 'click' && this.settings.trigger !== 'icon') {
			this.settings.trigger = DEFAULT_SETTINGS.trigger;
		}
		if (typeof this.settings.showThumbnails !== 'boolean') {
			this.settings.showThumbnails = DEFAULT_SETTINGS.showThumbnails;
		}
		if (typeof this.settings.showStatus !== 'boolean') {
			this.settings.showStatus = DEFAULT_SETTINGS.showStatus;
		}
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	/** Re-applies the card look after a settings change. */
	applyAppearance(): void {
		for (const binding of this.bindings.values()) binding.apply();
	}

	// ---------------------------------------------------------------- bindings

	private syncBindings(): void {
		const leaves = new Set(this.app.workspace.getLeavesOfType('canvas'));
		for (const [leaf, binding] of Array.from(this.bindings.entries())) {
			const view = getCanvasView(leaf);
			if (!leaves.has(leaf) || !view) {
				binding.destroy();
				this.bindings.delete(leaf);
				continue;
			}
			binding.refresh();
		}
		for (const leaf of leaves) {
			if (this.bindings.has(leaf)) continue;
			if (!getCanvasView(leaf)) continue;
			this.bindings.set(leaf, new CanvasBinding(this, leaf));
		}
	}

	// ------------------------------------------------------------- hit testing

	private handlePointerDown = (evt: PointerEvent): void => {
		if (evt.button !== 0) {
			this.pointerStart = null;
			return;
		}
		this.pointerStart = { x: evt.clientX, y: evt.clientY };
	};

	private handleClick = (evt: MouseEvent): void => {
		if (evt.button !== 0 || evt.shiftKey || evt.metaKey || evt.ctrlKey || evt.altKey) return;
		const start = this.pointerStart;
		this.pointerStart = null;
		const target = evt.target;
		if (!(target instanceof Element)) return;
		const nodeEl = target.closest('.canvas-node');
		if (!nodeEl) return;
		const hit = this.resolveCardByElement(nodeEl);
		if (!hit || hit.node.isEditing) return;
		const onCorner = target.closest('.canvas-cards-corner') !== null;
		if (!onCorner) {
			// In icon-trigger mode the card keeps its native canvas behaviour;
			// only the corner button opens the dialog.
			if (this.settings.trigger === 'icon') return;
			if (this.isNativeInteractiveTarget(target)) return;
		}
		if (start && Math.hypot(evt.clientX - start.x, evt.clientY - start.y) > CLICK_DRAG_TOLERANCE) {
			return;
		}
		// Consume the click before Canvas turns it into a selection/edit gesture.
		evt.preventDefault();
		evt.stopPropagation();
		this.openCard(hit);
	};

	private handleDoubleClick = (evt: MouseEvent): void => {
		if (evt.button !== 0) return;
		const target = evt.target;
		if (!(target instanceof Element)) return;
		const nodeEl = target.closest('.canvas-node');
		if (!nodeEl) return;
		const hit = this.resolveCardByElement(nodeEl);
		if (!hit || hit.node.isEditing) return;
		// Renaming happens in the dialog's title field, not in the native editor.
		evt.preventDefault();
		evt.stopPropagation();
	};

	private isNativeInteractiveTarget(target: Element): boolean {
		return target.closest(NATIVE_INTERACTIVE_SELECTOR) !== null;
	}

	private resolveCardByElement(nodeEl: Element): CardHit | null {
		for (const binding of this.bindings.values()) {
			const canvas = binding.canvas;
			if (!canvas) continue;
			const node = binding.resolveNode(nodeEl);
			if (node && isCardNode(node)) return { node, canvas, binding };
		}
		return null;
	}

	private findHitForNode(node: CanvasNodeLike): CardHit | null {
		const id = getNodeData(node)?.id ?? node.id;
		for (const binding of this.bindings.values()) {
			const canvas = binding.canvas;
			if (!canvas) continue;
			if (id && canvas.nodes?.get(id) === node) return { node, canvas, binding };
		}
		for (const binding of this.bindings.values()) {
			if (!binding.canvas) continue;
			if (getCanvasNodes(binding.canvas).includes(node)) {
				return { node, canvas: binding.canvas, binding };
			}
		}
		return null;
	}

	// -------------------------------------------------------------- cards open

	private openCard(hit: CardHit): void {
		this.openCardForNode(hit.node, hit.canvas, hit.binding.leaf, false);
	}

	private openCardForNode(
		node: CanvasNodeLike,
		canvas: CanvasLike,
		leaf: WorkspaceLeaf,
		startInEdit: boolean,
	): void {
		const view = getCanvasView(leaf);
		const binding = this.bindings.get(leaf);
		binding?.apply();
		canvas.selectOnly?.(node);
		this.openCardModal({
			node,
			canvas,
			sourcePath: view?.file?.path ?? '',
			startInEdit,
		});
	}

	private openCardModal(options: Omit<CardModalOptions, 'plugin' | 'onClosed'>): void {
		const modal = new CardModal(this.app, {
			...options,
			plugin: this,
			onClosed: () => this.openModals.delete(modal),
		});
		this.openModals.add(modal);
		modal.open();
	}

	/**
	 * Opens a canvas file, locates a card by node id and shows it in the dialog.
	 * Used by the card-body search.
	 */
	async revealCard(file: TFile, nodeId: string): Promise<void> {
		let leaf = this.app.workspace
			.getLeavesOfType('canvas')
			.find((candidate) => getCanvasView(candidate)?.file?.path === file.path);
		if (!leaf) {
			leaf = this.app.workspace.getLeaf('tab');
			await leaf.openFile(file);
		} else {
			this.app.workspace.setActiveLeaf(leaf, { focus: true });
		}
		const deadline = Date.now() + 4000;
		let canvas: CanvasLike | null = null;
		let node: CanvasNodeLike | null = null;
		while (Date.now() < deadline) {
			canvas = getCanvasView(leaf)?.canvas ?? null;
			node = canvas?.nodes?.get(nodeId) ?? null;
			if (canvas && node) break;
			await new Promise((resolve) => window.setTimeout(resolve, 100));
		}
		if (!canvas || !node) {
			new Notice(t('noticeCardNotFound'));
			return;
		}
		this.syncBindings();
		canvas.selectOnly?.(node);
		canvas.zoomToSelection?.();
		this.openCardModal({
			node,
			canvas,
			sourcePath: file.path,
		});
	}

	/** Writes the selected cards to Markdown notes next to their canvas. */
	private async exportSelectedCards(context: CanvasContext): Promise<void> {
		const file = context.view.file;
		const cards = this.getSelectedCards(context.canvas);
		if (!file || cards.length === 0) {
			new Notice(t('noticeExportFailed'));
			return;
		}
		let count = 0;
		for (const card of cards) {
			const created = await exportCardToNote(this.app, file, card);
			if (created) count += 1;
		}
		new Notice(count > 0 ? `${t('noticeExported')} ${count}` : t('noticeExportFailed'));
	}

	private async exportOneCard(node: CanvasNodeLike, leaf: WorkspaceLeaf): Promise<void> {
		const file = getCanvasView(leaf)?.file;
		if (!file) {
			new Notice(t('noticeExportFailed'));
			return;
		}
		const created = await exportCardToNote(this.app, file, node);
		new Notice(created ? `${t('noticeExported')} 1` : t('noticeExportFailed'));
	}

	// ---------------------------------------------------------------- commands

	private getActiveCanvas(): CanvasContext | null {
		const activeLeaf = this.app.workspace.getMostRecentLeaf();
		const leaves = this.app.workspace.getLeavesOfType('canvas');
		const ordered = activeLeaf ? [activeLeaf, ...leaves.filter((leaf) => leaf !== activeLeaf)] : leaves;
		for (const leaf of ordered) {
			const view = getCanvasView(leaf);
			if (view && view.canvas) return { leaf, canvas: view.canvas, view };
		}
		return null;
	}

	private getSelection(canvas: CanvasLike): CanvasNodeLike[] {
		return Array.from(canvas.selection ?? []);
	}

	private getSelectedCards(canvas: CanvasLike): CanvasNodeLike[] {
		return this.getSelection(canvas).filter((node) => isCardNode(node));
	}

	private getSelectedTextNodes(canvas: CanvasLike): CanvasNodeLike[] {
		return this.getSelection(canvas).filter(
			(node) => isTextNode(node) && !isCardNode(node),
		);
	}

	private createCardAtCenter(context: CanvasContext): void {
		const canvas = context.canvas;
		const wrapper = canvas.wrapperEl;
		const size = DEFAULT_CARD_SIZE;
		let pos = { x: 0, y: 0 };
		if (wrapper && canvas.posFromClient) {
			const rect = wrapper.getBoundingClientRect();
			const center = canvas.posFromClient({
				x: rect.x + rect.width / 2,
				y: rect.y + rect.height / 2,
			});
			pos = {
				x: center.x - size.width / 2,
				y: center.y - size.height / 2,
			};
		}
		// Nudge away from nodes that already cover the viewport centre, so two
		// cards created in a row do not land exactly on top of each other.
		const nodes = getCanvasNodes(canvas);
		for (let attempt = 0; attempt < 8; attempt += 1) {
			const clash = nodes.some((node) => {
				const data = getNodeData(node);
				if (!data) return false;
				const cx = data.x + data.width / 2;
				const cy = data.y + data.height / 2;
				return cx >= pos.x && cx <= pos.x + size.width && cy >= pos.y && cy <= pos.y + size.height;
			});
			if (!clash) break;
			pos = { x: pos.x + 28, y: pos.y + 28 };
		}
		const node = canvas.createTextNode?.({
			pos,
			size,
			text: '',
			save: false,
			focus: false,
		});
		if (!node) {
			new Notice(t('noticeCreateFailed'));
			return;
		}
		writeCard(node, canvas, createCardData());
		if (node.nodeEl && !node.nodeEl.isConnected) {
			node.attach?.();
			node.render?.();
		}
		canvas.selectOnly?.(node);
		canvas.requestSave?.();
		this.syncBindings();
		this.openCardForNode(node, canvas, context.leaf, true);
	}

	private convertSelection(context: CanvasContext): void {
		let count = 0;
		for (const node of this.getSelectedTextNodes(context.canvas)) {
			// Keep an existing hidden body when a disabled card is turned back on.
			if (writeCard(node, context.canvas, { card: true })) count += 1;
		}
		this.syncBindings();
		new Notice(`${t('noticeConverted')} ${count}`);
	}

	private uncardSelection(context: CanvasContext): void {
		let count = 0;
		for (const node of this.getSelectedCards(context.canvas)) {
			if (writeCard(node, context.canvas, { card: false })) count += 1;
		}
		this.syncBindings();
		new Notice(`${t('noticeUncarded')} ${count}`);
	}

	private async copyCardBody(node: CanvasNodeLike): Promise<void> {
		const body = readCard(node)?.body ?? '';
		try {
			await navigator.clipboard.writeText(body);
			new Notice(t('noticeCopied'));
		} catch {
			new Notice(t('noticeCopyFailed'));
		}
	}

	private registerCommands(): void {
		this.addCommand({
			id: 'create-card',
			name: t('commandCreateCard'),
			checkCallback: (checking) => {
				const context = this.getActiveCanvas();
				if (checking) return context !== null;
				if (!context) return false;
				this.createCardAtCenter(context);
				return true;
			},
		});

		this.addCommand({
			id: 'convert-to-card',
			name: t('commandConvertToCard'),
			checkCallback: (checking) => {
				const context = this.getActiveCanvas();
				const nodes = context ? this.getSelectedTextNodes(context.canvas) : [];
				if (checking) return nodes.length > 0;
				if (!context || nodes.length === 0) {
					new Notice(t('noticeNeedSelection'));
					return false;
				}
				this.convertSelection(context);
				return true;
			},
		});

		this.addCommand({
			id: 'uncard',
			name: t('commandUncard'),
			checkCallback: (checking) => {
				const context = this.getActiveCanvas();
				const cards = context ? this.getSelectedCards(context.canvas) : [];
				if (checking) return cards.length > 0;
				if (!context || cards.length === 0) {
					new Notice(t('noticeNeedCard'));
					return false;
				}
				this.uncardSelection(context);
				return true;
			},
		});

		this.addCommand({
			id: 'edit-card-body',
			name: t('commandEditBody'),
			checkCallback: (checking) => {
				const context = this.getActiveCanvas();
				const cards = context ? this.getSelectedCards(context.canvas) : [];
				if (checking) return cards.length > 0;
				const card = cards[0];
				if (!context || !card) {
					new Notice(t('noticeNeedCard'));
					return false;
				}
				this.openCardForNode(card, context.canvas, context.leaf, true);
				return true;
			},
		});

		this.addCommand({
			id: 'copy-card-body',
			name: t('commandCopyBody'),
			checkCallback: (checking) => {
				const context = this.getActiveCanvas();
				const cards = context ? this.getSelectedCards(context.canvas) : [];
				if (checking) return cards.length > 0;
				const card = cards[0];
				if (!context || !card) {
					new Notice(t('noticeNeedCard'));
					return false;
				}
				void this.copyCardBody(card);
				return true;
			},
		});

		this.addCommand({
			id: 'search-cards',
			name: t('commandSearchCards'),
			callback: () => {
				new CardSearchModal(this.app, this).open();
			},
		});

		this.addCommand({
			id: 'export-card',
			name: t('commandExportCard'),
			checkCallback: (checking) => {
				const context = this.getActiveCanvas();
				const cards = context ? this.getSelectedCards(context.canvas) : [];
				if (checking) return cards.length > 0;
				if (!context || cards.length === 0) {
					new Notice(t('noticeNeedCard'));
					return false;
				}
				void this.exportSelectedCards(context);
				return true;
			},
		});
	}

	// ------------------------------------------------------------- node menu

	private registerCardMenu(): void {
		const workspaceOn = this.app.workspace.on.bind(this.app.workspace) as unknown as RawWorkspaceOn;
		this.registerEvent(
			workspaceOn('canvas:node-menu', (...args: unknown[]) => {
				const menu = args[0];
				const node = args[1];
				if (!(menu instanceof Menu) || !node) return;
				this.handleCanvasNodeMenu(menu, node);
			}),
		);
	}

	private handleCanvasNodeMenu(menu: Menu, node: CanvasNodeLike): void {
		const hit = this.findHitForNode(node);
		if (!hit) return;
		const card = isCardNode(node);
		// Do not leave a stray separator on nodes we have nothing to offer for.
		if (!card && !isTextNode(node)) return;
		menu.addSeparator();
		if (!card) {
			menu.addItem((item) =>
				item
					.setTitle(t('menuConvertToCard'))
					.setIcon('id-card')
					.onClick(() => {
						if (writeCard(node, hit.canvas, { card: true })) this.syncBindings();
					}),
			);
			return;
		}
		menu.addItem((item) =>
			item
				.setTitle(t('menuEditCard'))
				.setIcon('square-pen')
				.onClick(() => this.openCardForNode(node, hit.canvas, hit.binding.leaf, true)),
		);
		menu.addItem((item) =>
			item
				.setTitle(t('menuCopyBody'))
				.setIcon('copy')
				.onClick(() => void this.copyCardBody(node)),
		);
		menu.addItem((item) =>
			item
				.setTitle(t('menuExportCard'))
				.setIcon('file-down')
				.onClick(() => void this.exportOneCard(node, hit.binding.leaf)),
		);
		menu.addItem((item) =>
			item
				.setTitle(t('menuUncard'))
				.setIcon('id-card')
				.onClick(() => {
					if (writeCard(node, hit.canvas, { card: false })) this.syncBindings();
				}),
		);
	}
}
