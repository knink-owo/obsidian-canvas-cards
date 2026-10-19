import { Modal } from 'obsidian';
import type { App } from 'obsidian';
import type CanvasCards from '../main';
import type { IndexedCard } from '../canvas/card-index';
import { t } from '../i18n';

const SEARCH_DEBOUNCE_MS = 180;

/** A small picker that searches every canvas card body and jumps to the card. */
export class CardSearchModal extends Modal {
	private readonly plugin: CanvasCards;
	private query = '';
	private activeQuery = '';
	private results: IndexedCard[] = [];
	private selected = 0;
	private searchToken = 0;
	private timer: number | null = null;
	private inputEl!: HTMLInputElement;
	private listEl!: HTMLElement;
	private statusEl!: HTMLElement;

	constructor(app: App, plugin: CanvasCards) {
		super(app);
		this.plugin = plugin;
	}

	onOpen(): void {
		this.modalEl.addClass('canvas-cards-search-modal');
		this.contentEl.empty();
		this.contentEl.addClass('canvas-cards-search-content');

		this.inputEl = this.contentEl.createEl('input', {
			cls: 'canvas-cards-search-input',
			attr: {
				type: 'search',
				placeholder: t('searchPlaceholder'),
				'aria-label': t('searchPlaceholder'),
			},
		});
		this.statusEl = this.contentEl.createDiv('canvas-cards-search-status');
		this.listEl = this.contentEl.createDiv('canvas-cards-search-results');

		this.inputEl.addEventListener('input', () => this.scheduleSearch());
		this.inputEl.addEventListener('keydown', (evt: KeyboardEvent) => this.onKeyDown(evt));

		window.setTimeout(() => this.inputEl.focus(), 0);
		void this.runSearch('');
	}

	onClose(): void {
		// Invalidate in-flight searches so late results cannot touch a closed dialog.
		this.searchToken += 1;
		if (this.timer !== null) window.clearTimeout(this.timer);
		this.timer = null;
		this.contentEl.empty();
		this.modalEl.removeClass('canvas-cards-search-modal');
	}

	private scheduleSearch(): void {
		this.query = this.inputEl.value;
		if (this.timer !== null) window.clearTimeout(this.timer);
		this.timer = window.setTimeout(() => {
			this.timer = null;
			void this.runSearch(this.query);
		}, SEARCH_DEBOUNCE_MS);
	}

	private async runSearch(query: string): Promise<void> {
		const token = (this.searchToken += 1);
		this.statusEl.setText(t('searching'));
		try {
			const results = await this.plugin.cardIndex.search(query, 60);
			if (token !== this.searchToken) return;
			this.activeQuery = query;
			this.results = results;
			this.selected = 0;
			this.renderResults();
		} catch {
			if (token !== this.searchToken) return;
			this.statusEl.setText(t('searchFailed'));
		}
	}

	private renderResults(): void {
		this.listEl.empty();
		if (this.results.length === 0) {
			this.statusEl.setText(t('searchNoResults'));
			this.listEl.createDiv({ cls: 'canvas-cards-search-empty', text: t('searchNoResults') });
			return;
		}
		this.statusEl.setText(t('searchResultCount').replace('{count}', String(this.results.length)));
		this.results.forEach((card, index) => {
			const row = this.listEl.createDiv('canvas-cards-search-result');
			if (index === this.selected) row.addClass('is-selected');
			row.createDiv({
				cls: 'canvas-cards-search-result-title',
				text: card.title.trim() || t('untitledCard'),
			});
			row.createDiv({
				cls: 'canvas-cards-search-result-meta',
				text: card.file.basename,
			});
			const snippet = this.snippet(card);
			if (snippet) row.createDiv({ cls: 'canvas-cards-search-result-snippet', text: snippet });
			row.addEventListener('click', () => this.openResult(card));
			row.addEventListener('mouseenter', () => {
				this.selected = index;
				this.highlightSelected();
			});
		});
		this.highlightSelected();
	}

	private snippet(card: IndexedCard): string {
		const flat = card.body.replace(/\s+/g, ' ').trim();
		if (!flat) return '';
		const needle = this.activeQuery.trim().toLowerCase();
		if (!needle) return flat.slice(0, 120);
		const index = flat.toLowerCase().indexOf(needle);
		if (index === -1) return flat.slice(0, 120);
		const start = Math.max(0, index - 40);
		const end = Math.min(flat.length, index + needle.length + 60);
		return `${start > 0 ? '…' : ''}${flat.slice(start, index)}${flat.slice(index, index + needle.length)}${flat.slice(index + needle.length, end)}${end < flat.length ? '…' : ''}`;
	}

	private highlightSelected(): void {
		const rows = this.listEl.querySelectorAll('.canvas-cards-search-result');
		rows.forEach((row, index) => row.classList.toggle('is-selected', index === this.selected));
		const current = rows[this.selected];
		if (current instanceof HTMLElement) current.scrollIntoView({ block: 'nearest' });
	}

	private onKeyDown(evt: KeyboardEvent): void {
		if (evt.key === 'ArrowDown') {
			evt.preventDefault();
			if (this.results.length > 0) {
				this.selected = (this.selected + 1) % this.results.length;
				this.highlightSelected();
			}
		} else if (evt.key === 'ArrowUp') {
			evt.preventDefault();
			if (this.results.length > 0) {
				this.selected = (this.selected - 1 + this.results.length) % this.results.length;
				this.highlightSelected();
			}
		} else if (evt.key === 'Enter') {
			evt.preventDefault();
			const card = this.results[this.selected];
			if (card) this.openResult(card);
		}
	}

	private openResult(card: IndexedCard): void {
		this.close();
		void this.plugin.revealCard(card.file, card.nodeId);
	}
}
