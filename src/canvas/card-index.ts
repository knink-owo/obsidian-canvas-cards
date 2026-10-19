import type { App, TFile } from 'obsidian';
import type { CanvasNodeData } from './internals';
import { normalizeCardData, CARD_FIELD } from './card';

/** One card found in a `.canvas` file, indexed for search and export. */
export interface IndexedCard {
	file: TFile;
	nodeId: string;
	title: string;
	body: string;
}

interface CanvasFileJson {
	nodes?: CanvasNodeData[];
}

interface CacheEntry {
	mtime: number;
	size: number;
	cards: IndexedCard[];
}

/**
 * In-memory index of every card in the vault.
 *
 * The canvas file format is plain JSON, so the index can be built with the
 * public vault API only (no Canvas internals): `cachedRead` + `JSON.parse`.
 * Entries are cached per file and invalidated by mtime/size.
 */
export class CardIndex {
	private readonly app: App;
	private readonly cache = new Map<string, CacheEntry>();

	constructor(app: App) {
		this.app = app;
	}

	async getCards(file: TFile): Promise<IndexedCard[]> {
		const cached = this.cache.get(file.path);
		if (cached && cached.mtime === file.stat.mtime && cached.size === file.stat.size) {
			return cached.cards;
		}
		let cards: IndexedCard[] = [];
		try {
			const raw = await this.app.vault.cachedRead(file);
			const json = JSON.parse(raw) as CanvasFileJson;
			const nodes = Array.isArray(json.nodes) ? json.nodes : [];
			for (const node of nodes) {
				if (node.type !== 'text') continue;
				const card = normalizeCardData(node[CARD_FIELD]);
				if (!card || !card.card) continue;
				cards.push({
					file,
					nodeId: node.id,
					title: typeof node.text === 'string' ? node.text : '',
					body: card.body,
				});
			}
		} catch {
			cards = [];
		}
		this.cache.set(file.path, { mtime: file.stat.mtime, size: file.stat.size, cards });
		return cards;
	}

	async search(query: string, limit = 100): Promise<IndexedCard[]> {
		const needle = query.trim().toLowerCase();
		const files = this.app.vault.getFiles().filter((file) => file.extension === 'canvas');
		const results: IndexedCard[] = [];
		for (const file of files) {
			const cards = await this.getCards(file);
			for (const card of cards) {
				if (!needle) {
					results.push(card);
				} else {
					const title = card.title.toLowerCase();
					const body = card.body.toLowerCase();
					if (!title.includes(needle) && !body.includes(needle)) continue;
					results.push(card);
				}
				if (results.length >= limit) return results;
			}
		}
		return results;
	}

	/** Removes stale entries (deleted or renamed canvases). */
	prune(): void {
		const paths = new Set(this.app.vault.getFiles().map((file) => file.path));
		for (const path of this.cache.keys()) {
			if (!paths.has(path)) this.cache.delete(path);
		}
	}

	clear(): void {
		this.cache.clear();
	}
}
