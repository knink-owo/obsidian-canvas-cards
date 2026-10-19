import type { TFile, WorkspaceLeaf } from 'obsidian';

/**
 * Minimal, feature-detected view of Obsidian's Canvas internals.
 *
 * Everything under `src/canvas/internals.ts` (and only there) may touch Canvas
 * objects that are not part of the public plugin API. See "Canvas internals
 * exception" in AGENTS.md.
 */

export interface CanvasNodeData {
	id: string;
	type: string;
	text?: string;
	x: number;
	y: number;
	width: number;
	height: number;
	color?: string;
	[key: string]: unknown;
}

export interface CreateTextNodeOptions {
	pos: { x: number; y: number };
	size?: { width: number; height: number };
	position?: string;
	text?: string;
	save?: boolean;
	focus?: boolean;
}

export interface CanvasNodeLike {
	id?: string;
	nodeEl?: HTMLElement;
	isEditing?: boolean;
	getData?(): CanvasNodeData;
	setData?(data: CanvasNodeData, requestSave?: boolean): void;
	setText?(text: string): void;
	attach?(): void;
	render?(): void;
}

export interface CanvasLike {
	wrapperEl?: HTMLElement;
	nodes?: Map<string, CanvasNodeLike>;
	selection?: Set<CanvasNodeLike>;
	createTextNode?(options: CreateTextNodeOptions): CanvasNodeLike;
	selectOnly?(node: CanvasNodeLike): void;
	requestSave?(requestHistory?: boolean): void;
	posFromClient?(point: { x: number; y: number }): { x: number; y: number };
	zoomToSelection?(): void;
}

export interface CanvasViewLike {
	canvas?: CanvasLike;
	file?: TFile | null;
}

/** Returns the Canvas view for a leaf, or null when the leaf is not a loaded Canvas view. */
export function getCanvasView(leaf: WorkspaceLeaf | null | undefined): CanvasViewLike | null {
	if (!leaf) return null;
	const view = leaf.view as unknown as CanvasViewLike | null | undefined;
	if (!view || !view.canvas) return null;
	return view;
}

export function getCanvasNodes(canvas: CanvasLike | null | undefined): CanvasNodeLike[] {
	if (!canvas || !canvas.nodes) return [];
	return Array.from(canvas.nodes.values());
}

export function getNodeData(node: CanvasNodeLike | null | undefined): CanvasNodeData | null {
	const data = node?.getData?.();
	return data && typeof data === 'object' ? data : null;
}

export function findNodeByElement(
	canvas: CanvasLike | null | undefined,
	el: Element | null,
): CanvasNodeLike | null {
	if (!canvas || !el) return null;
	for (const node of getCanvasNodes(canvas)) {
		if (node.nodeEl === el) return node;
	}
	return null;
}

export function isTextNode(node: CanvasNodeLike | null | undefined): boolean {
	return getNodeData(node)?.type === 'text';
}
