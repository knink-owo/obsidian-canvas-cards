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
	containerEl?: HTMLElement;
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

/** Converts client coordinates to canvas coordinates; null when unavailable. */
export function canvasPointFromClient(
	canvas: CanvasLike | null | undefined,
	point: { x: number; y: number },
): { x: number; y: number } | null {
	if (!canvas?.posFromClient) return null;
	try {
		const result = canvas.posFromClient(point);
		if (!result || typeof result.x !== 'number' || typeof result.y !== 'number') return null;
		return result;
	} catch {
		return null;
	}
}

/** Renders a node that was created with `save:false`/`focus:false` into the canvas DOM. */
export function attachAndRenderNode(node: CanvasNodeLike | null | undefined): void {
	if (!node?.attach || !node.render) return;
	try {
		if (node.nodeEl?.isConnected) return;
		node.attach();
		node.render();
	} catch {
		// Canvas will render the node on the next layout pass; never let this throw.
	}
}

/** True while the node object is still the live node of that canvas instance. */
export function isLiveNode(
	canvas: CanvasLike | null | undefined,
	node: CanvasNodeLike | null | undefined,
): boolean {
	if (!canvas?.nodes || !node?.id) return false;
	return canvas.nodes.get(node.id) === node;
}

/** Finds the current node object for an id on a canvas. */
export function getNodeById(
	canvas: CanvasLike | null | undefined,
	id: string,
): CanvasNodeLike | null {
	return canvas?.nodes?.get(id) ?? null;
}
