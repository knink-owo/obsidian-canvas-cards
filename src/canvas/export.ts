import { normalizePath } from 'obsidian';
import type { App, TFile } from 'obsidian';
import { getCardTitle, readCard } from './card';
import type { CanvasNodeLike } from './internals';
import { getNodeData } from './internals';

const ILLEGAL_FILENAME = /[\\/:*?"<>|#^[\]]/g;

/** Turns a card title into a safe note name (without extension). */
export function cardNoteBaseName(title: string): string {
	const cleaned = title
		.replace(ILLEGAL_FILENAME, '-')
		.replace(/\s+/g, ' ')
		.replace(/^[.\s]+|[.\s]+$/g, '')
		.slice(0, 80)
		.trim();
	return cleaned || 'Untitled card';
}

function uniquePath(app: App, folder: string, base: string): string {
	const prefix = folder ? `${folder}/` : '';
	let candidate = normalizePath(`${prefix}${base}.md`);
	let counter = 1;
	while (app.vault.getAbstractFileByPath(candidate)) {
		candidate = normalizePath(`${prefix}${base} ${counter}.md`);
		counter += 1;
	}
	return candidate;
}

function yamlString(value: string): string {
	return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/** Writes one card to a Markdown note next to its canvas. Returns the new file. */
export async function exportCardToNote(
	app: App,
	canvasFile: TFile,
	node: CanvasNodeLike,
): Promise<TFile | null> {
	const title = getCardTitle(node).trim();
	const body = readCard(node)?.body ?? '';
	const nodeId = getNodeData(node)?.id ?? '';
	const folder = canvasFile.parent?.path ?? '';
	const path = uniquePath(app, folder, cardNoteBaseName(title));
	const frontmatter = [
		'---',
		`canvas-cards-source: ${yamlString(`[[${canvasFile.path}]]`)}`,
		`canvas-cards-node: ${yamlString(nodeId)}`,
		`exported: ${new Date().toISOString()}`,
		'---',
		'',
	].join('\n');
	// A converted node can have a multi-line title; keep the note heading on one line.
	const headingText = (title || 'Untitled card').replace(/\s+/g, ' ').trim();
	const heading = `# ${headingText}`;
	const content = `${frontmatter}${heading}\n\n${body.trim()}\n`;
	try {
		return await app.vault.create(path, content);
	} catch {
		return null;
	}
}
