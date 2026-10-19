import type { CanvasLike, CanvasNodeData, CanvasNodeLike } from './internals';
import { getNodeData } from './internals';

/**
 * Card payload stored under `node.unknownData.canvasCard`.
 *
 * Canvas keeps every field of a node that is not geometry/color in
 * `unknownData` and writes it back to the `.canvas` file verbatim, so this
 * object survives reloads, undo/redo and view rebuilds. Never write the field
 * with a hand-built object: always spread `node.getData()` first, because
 * `setData` replaces `unknownData` wholesale and would drop other plugins'
 * fields.
 */

export const CARD_FIELD = 'canvasCard';

export interface CanvasCardData {
	v: 1;
	/** false = the body is kept but the node is rendered as a normal text node. */
	card: boolean;
	body: string;
	updated: number;
}

export function createCardData(body = ''): CanvasCardData {
	return { v: 1, card: true, body, updated: Date.now() };
}

export function normalizeCardData(value: unknown): CanvasCardData | null {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
	const raw = value as Record<string, unknown>;
	return {
		v: 1,
		card: raw.card !== false,
		body: typeof raw.body === 'string' ? raw.body : '',
		updated: typeof raw.updated === 'number' ? raw.updated : 0,
	};
}

export function readCard(node: CanvasNodeLike | null | undefined): CanvasCardData | null {
	const data = getNodeData(node);
	if (!data) return null;
	return normalizeCardData(data[CARD_FIELD]);
}

export function isCardNode(node: CanvasNodeLike | null | undefined): boolean {
	const data = getNodeData(node);
	if (!data || data.type !== 'text') return false;
	const card = normalizeCardData(data[CARD_FIELD]);
	return card !== null && card.card;
}

export function getCardTitle(node: CanvasNodeLike | null | undefined): string {
	const text = getNodeData(node)?.text;
	return typeof text === 'string' ? text : '';
}

export interface WriteCardOptions {
	/**
	 * Whether the change becomes a Canvas undo step. Dialog autosaves pass
	 * `false`: their undo history lives in the dialog itself, and the body
	 * should not turn every keystroke into a canvas undo entry.
	 */
	requestHistory?: boolean;
}

/** Merges `patch` into the card payload. Returns false when the node is gone. */
export function writeCard(
	node: CanvasNodeLike | null | undefined,
	canvas: CanvasLike | null | undefined,
	patch: Partial<Omit<CanvasCardData, 'v'>>,
	options: WriteCardOptions = {},
): boolean {
	const data = getNodeData(node);
	if (!node || !data || !node.setData) return false;
	const current = normalizeCardData(data[CARD_FIELD]);
	const next: CanvasCardData = {
		...(current ?? createCardData()),
		...patch,
		v: 1,
		updated: Date.now(),
	};
	const requestHistory = options.requestHistory ?? true;
	node.setData({ ...data, [CARD_FIELD]: next }, requestHistory);
	canvas?.requestSave?.(requestHistory);
	return true;
}

/** Writes the card title, which lives in the node's native `text` field. */
export function writeCardTitle(
	node: CanvasNodeLike | null | undefined,
	canvas: CanvasLike | null | undefined,
	title: string,
): boolean {
	if (!node) return false;
	const data: CanvasNodeData | null = getNodeData(node);
	if (!data) return false;
	if (title === getCardTitle(node)) return true;
	if (node.setText) {
		node.setText(title);
	} else if (node.setData) {
		node.setData({ ...data, text: title });
	} else {
		return false;
	}
	canvas?.requestSave?.();
	return true;
}
