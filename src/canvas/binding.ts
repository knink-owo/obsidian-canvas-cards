import { setIcon } from 'obsidian';
import type { WorkspaceLeaf } from 'obsidian';
import type CanvasCards from '../main';
import { isCardNode, readCard } from './card';
import type { CanvasLike, CanvasNodeLike, CanvasViewLike } from './internals';
import { findNodeByElement, getCanvasNodes, getCanvasView, getNodeData } from './internals';
import { resolveThumbnail } from './thumbnail';
import { t } from '../i18n';

export interface CardHit {
	node: CanvasNodeLike;
	canvas: CanvasLike;
	binding: CanvasBinding;
}

const CARD_CLASS = 'canvas-cards-card';
const BUTTON_CLASS = 'canvas-cards-card-button';
const CORNER_CLASS = 'canvas-cards-corner';
const ICON_TRIGGER_CLASS = 'canvas-cards-icon-trigger';
const THUMB_CLASS = 'canvas-cards-has-thumb';
const THUMB_VAR = '--canvas-cards-thumb';

/**
 * Ties one Canvas leaf to the plugin: watches the canvas wrapper for DOM
 * churn, then keeps the `canvas-cards-card` class in sync with each node's
 * payload. The only injected DOM is the small corner button; no Canvas
 * prototype is patched, so zooming, panning, dragging and view rebuilds keep
 * working.
 */
export class CanvasBinding {
	readonly leaf: WorkspaceLeaf;
	canvas: CanvasLike | null = null;
	view: CanvasViewLike | null = null;

	private readonly plugin: CanvasCards;
	private wrapperEl: HTMLElement | null = null;
	private observer: MutationObserver | null = null;
	private frame: number | null = null;
	private readonly nodesByEl = new Map<HTMLElement, CanvasNodeLike>();
	private readonly classedEls = new Set<HTMLElement>();
	private readonly cornerButtons = new Set<HTMLButtonElement>();
	private readonly thumbCache = new Map<string, string | null>();

	constructor(plugin: CanvasCards, leaf: WorkspaceLeaf) {
		this.plugin = plugin;
		this.leaf = leaf;
		this.refresh();
	}

	get filePath(): string {
		return this.view?.file?.path ?? '';
	}

	/** Re-reads the view/canvas (view instances survive but canvases can be re-rendered). */
	refresh(): void {
		const view = getCanvasView(this.leaf);
		const canvas = view?.canvas ?? null;
		this.view = view;
		this.canvas = canvas;
		if (!canvas) {
			this.detachObserver();
			return;
		}
		const wrapper = canvas.wrapperEl ?? null;
		if (wrapper !== this.wrapperEl) {
			this.detachObserver();
			this.wrapperEl = wrapper;
			if (wrapper) {
				this.observer = new MutationObserver(() => this.scheduleApply());
				this.observer.observe(wrapper, { childList: true, subtree: true });
			}
		}
		this.apply();
	}

	/** Resolves the Canvas node that owns a DOM element (cached, then linear scan). */
	resolveNode(el: Element | null): CanvasNodeLike | null {
		if (!el) return null;
		const htmlEl = el as HTMLElement;
		const cached = this.nodesByEl.get(htmlEl);
		if (cached) return cached;
		const node = findNodeByElement(this.canvas, el);
		if (node) this.nodesByEl.set(htmlEl, node);
		return node;
	}

	/** Applies the card classes to every node of this canvas. Cheap and idempotent. */
	apply(): void {
		const canvas = this.canvas;
		if (!canvas) return;
		const buttonLook = this.plugin.settings.appearance === 'button';
		const iconTrigger = this.plugin.settings.trigger === 'icon';
		for (const node of getCanvasNodes(canvas)) {
			const el = node.nodeEl;
			if (!el) continue;
			const card = isCardNode(node);
			this.nodesByEl.set(el, node);
			el.classList.toggle(CARD_CLASS, card);
			el.classList.toggle(BUTTON_CLASS, card && buttonLook);
			el.classList.toggle(ICON_TRIGGER_CLASS, card && iconTrigger);
			if (card) {
				this.classedEls.add(el);
				this.ensureCorner(el);
				this.applyThumbnail(el, node);
			} else {
				this.classedEls.delete(el);
				this.removeCorner(el);
				this.clearThumbnail(el);
			}
		}
		for (const [el] of this.nodesByEl) {
			if (!el.isConnected) this.nodesByEl.delete(el);
		}
		for (const button of this.cornerButtons) {
			if (!button.isConnected) this.cornerButtons.delete(button);
		}
	}

	private ensureCorner(el: HTMLElement): void {
		let button = el.querySelector<HTMLButtonElement>(`.${CORNER_CLASS}`);
		if (!button) {
			button = el.createEl('button', {
				cls: `${CORNER_CLASS} interactive-child`,
				attr: { type: 'button', 'aria-label': t('openCard') },
			});
			setIcon(button, 'id-card');
		}
		this.cornerButtons.add(button);
	}

	private removeCorner(el: HTMLElement): void {
		const button = el.querySelector<HTMLButtonElement>(`.${CORNER_CLASS}`);
		if (!button) return;
		button.remove();
		this.cornerButtons.delete(button);
	}

	/** Shows the first image embed of the body as the card cover. */
	private applyThumbnail(el: HTMLElement, node: CanvasNodeLike): void {
		if (!this.plugin.settings.showThumbnails) {
			this.clearThumbnail(el);
			return;
		}
		const card = readCard(node);
		const data = getNodeData(node);
		if (!card || !data) {
			this.clearThumbnail(el);
			return;
		}
		const cacheKey = `${data.id}:${card.updated}`;
		let url: string | null;
		if (this.thumbCache.has(cacheKey)) {
			url = this.thumbCache.get(cacheKey) ?? null;
		} else {
			url = resolveThumbnail(this.plugin.app, card.body, this.filePath)?.url ?? null;
			this.thumbCache.set(cacheKey, url);
		}
		if (!url) {
			this.clearThumbnail(el);
			return;
		}
		el.addClass(THUMB_CLASS);
		el.style.setProperty(THUMB_VAR, `url("${url.replace(/"/g, '%22')}")`);
	}

	private clearThumbnail(el: HTMLElement): void {
		el.removeClass(THUMB_CLASS);
		el.style.removeProperty(THUMB_VAR);
	}

	destroy(): void {
		this.detachObserver();
		for (const el of this.classedEls) {
			el.classList.remove(CARD_CLASS, BUTTON_CLASS, ICON_TRIGGER_CLASS);
			this.clearThumbnail(el);
		}
		for (const button of this.cornerButtons) button.remove();
		this.cornerButtons.clear();
		this.classedEls.clear();
		this.nodesByEl.clear();
		this.thumbCache.clear();
		this.canvas = null;
		this.view = null;
	}

	private scheduleApply(): void {
		if (this.frame !== null) return;
		this.frame = window.requestAnimationFrame(() => {
			this.frame = null;
			this.apply();
		});
	}

	private detachObserver(): void {
		this.observer?.disconnect();
		this.observer = null;
		if (this.frame !== null) {
			window.cancelAnimationFrame(this.frame);
			this.frame = null;
		}
		this.wrapperEl = null;
	}
}
