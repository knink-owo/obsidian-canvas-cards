import type { App } from 'obsidian';

/** Extensions that can be used as a card cover image. */
const IMAGE_EXTENSIONS = new Set([
	'png',
	'jpg',
	'jpeg',
	'gif',
	'webp',
	'svg',
	'bmp',
	'avif',
	'ico',
]);

const WIKI_EMBED = /!\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]/g;
const MARKDOWN_IMAGE = /!\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(?:\s+["'][^"']*["'])?\s*\)/g;

export interface Thumbnail {
	/** `vault.getResourcePath()` URL, ready for a CSS `url()`. */
	url: string;
	alt: string;
}

function extensionOf(path: string): string {
	const clean = path.split('#')[0]?.split('|')[0] ?? path;
	const dot = clean.lastIndexOf('.');
	return dot === -1 ? '' : clean.slice(dot + 1).toLowerCase();
}

function decodeLinkTarget(value: string): string {
	const trimmed = value.trim().replace(/^<|>$/g, '');
	try {
		return decodeURIComponent(trimmed);
	} catch {
		return trimmed;
	}
}

/** Extracts the first image reference from a card body, if any. */
export function findThumbnailLink(body: string): { path: string; alt: string } | null {
	let best: { index: number; path: string; alt: string } | null = null;
	// A body may embed notes before the first image; scan every embed so any
	// leading `![[Some note]]` does not hide a later image.
	for (const match of body.matchAll(WIKI_EMBED)) {
		const target = decodeLinkTarget(match[1] ?? '');
		if (!IMAGE_EXTENSIONS.has(extensionOf(target))) continue;
		const alt = (match[2] ?? '').replace(/^\d+(x\d+)?$/, '').trim();
		if (best === null || (match.index ?? 0) < best.index) {
			best = { index: match.index ?? 0, path: target, alt };
		}
	}
	for (const match of body.matchAll(MARKDOWN_IMAGE)) {
		const target = decodeLinkTarget(match[2] ?? '');
		if (!IMAGE_EXTENSIONS.has(extensionOf(target))) continue;
		const alt = (match[1] ?? '').trim();
		if (best === null || (match.index ?? 0) < best.index) {
			best = { index: match.index ?? 0, path: target, alt };
		}
	}
	return best ? { path: best.path, alt: best.alt } : null;
}

/** Resolves the first image embed of a body to a renderable resource URL. */
export function resolveThumbnail(app: App, body: string, sourcePath: string): Thumbnail | null {
	if (!body.trim()) return null;
	const link = findThumbnailLink(body);
	if (!link) return null;
	const target = app.metadataCache.getFirstLinkpathDest(link.path, sourcePath);
	if (!target) return null;
	if (!IMAGE_EXTENSIONS.has(target.extension.toLowerCase())) return null;
	try {
		return { url: app.vault.getResourcePath(target), alt: link.alt || target.basename };
	} catch {
		return null;
	}
}
