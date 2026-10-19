import { App, Component, MarkdownRenderer, Modal, Notice, normalizePath, Scope, setIcon } from 'obsidian';
import type CanvasCards from '../main';
import { getCardTitle, readCard, writeCard, writeCardTitle } from '../canvas/card';
import type { CanvasLike, CanvasNodeLike } from '../canvas/internals';
import { t } from '../i18n';

export interface CardModalOptions {
	plugin: CanvasCards;
	node: CanvasNodeLike;
	canvas: CanvasLike;
	sourcePath: string;
	startInEdit?: boolean;
	/** Called after the dialog has fully closed, so the plugin can forget it. */
	onClosed?: () => void;
}

type Mode = 'read' | 'edit';

const BODY_DEBOUNCE_MS = 400;
const TITLE_DEBOUNCE_MS = 300;
const BODY_SIZE_TIP = 200_000;

/**
 * The card dialog: a title input plus a Markdown reader / textarea editor.
 * Body edits are written straight into the node payload and saved through the
 * Canvas save queue; the title is written to the node's native `text` field.
 */
export class CardModal extends Modal {
	private readonly options: CardModalOptions;
	private mode: Mode;
	private body: string;
	private bodyDirty = false;
	private titleDirty = false;
	private bodyEdited = false;
	private titleEdited = false;
	private bodyTimer: number | null = null;
	private titleTimer: number | null = null;
	private renderToken = 0;
	private fullscreen = false;
	private titleInput!: HTMLInputElement;
	private modeButton!: HTMLButtonElement;
	private fullscreenButton!: HTMLButtonElement;
	private readEl!: HTMLElement;
	private editorEl!: HTMLTextAreaElement;
	private statusEl!: HTMLElement;
	private pasteHandler: ((evt: ClipboardEvent) => void) | null = null;
	private extraScope: Scope | null = null;
	/** Owns components created by the rendered Markdown (embeds, links, ...). */
	private readonly renderHost = new Component();

	constructor(app: App, options: CardModalOptions) {
		super(app);
		this.options = options;
		this.mode = options.startInEdit ? 'edit' : 'read';
		this.body = readCard(options.node)?.body ?? '';
	}

	onOpen(): void {
		this.renderHost.load();
		this.modalEl.addClass('canvas-cards-modal');
		this.build();
		this.setMode(this.mode);
		// Push a child scope on top of the modal's scope: it is consulted first,
		// so the first Escape can leave fullscreen instead of closing the
		// dialog; every other key falls through to the modal scope.
		this.extraScope = new Scope(this.scope);
		this.extraScope.register([], 'Escape', (evt: KeyboardEvent) => {
			evt.preventDefault();
			if (this.fullscreen) {
				this.setFullscreen(false);
			} else {
				this.close();
			}
			return false;
		});
		this.app.keymap.pushScope(this.extraScope);
		// The modal framework focuses the first focusable element (the title
		// input). Put focus on the intended surface for the active mode.
		window.setTimeout(() => {
			if (!this.modalEl.isConnected) return;
			if (this.mode === 'edit') {
				this.editorEl.focus();
			} else {
				this.titleInput.blur();
				this.readEl.focus({ preventScroll: true });
			}
		}, 0);
	}

	onClose(): void {
		if (this.extraScope) {
			this.app.keymap.popScope(this.extraScope);
			this.extraScope = null;
		}
		this.clearTimers();
		// Canvas undo works on whole-canvas data snapshots. Body autosaves are
		// written without pushing history (so keystrokes never flood the undo
		// stack), but the final state has to become a snapshot too: otherwise
		// undoing an *earlier* canvas action would silently restore a snapshot
		// that predates the body edit and drop the text. Pushing one snapshot
		// per editing session keeps canvas undo predictable: one Ctrl+Z steps
		// back over the body edit, and later undos keep the saved body.
		const contentChanged = this.bodyEdited || this.titleEdited;
		this.flushBody();
		this.flushTitle();
		if (contentChanged) {
			try {
				this.options.canvas?.requestSave?.(true);
			} catch (error) {
				console.error('Canvas Cards: failed to push the edit snapshot', error);
			}
		}
		this.renderHost.unload();
		if (this.pasteHandler) this.editorEl.removeEventListener('paste', this.pasteHandler);
		this.contentEl.empty();
		this.modalEl.removeClasses(['canvas-cards-edit-mode', 'canvas-cards-fullscreen']);
		try {
			this.options.onClosed?.();
		} catch (error) {
			console.error('Canvas Cards: modal close hook failed', error);
		}
	}

	private build(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('canvas-cards-modal-content');

		const header = contentEl.createDiv({ cls: 'canvas-cards-header' });
		this.titleInput = header.createEl('input', {
			cls: 'canvas-cards-title-input',
			attr: { type: 'text', placeholder: t('titlePlaceholder'), spellcheck: 'false' },
		});
		this.titleInput.value = getCardTitle(this.options.node);
		this.titleInput.addEventListener('input', () => this.onTitleInput());
		this.titleInput.addEventListener('keydown', (evt) => {
			if (evt.key === 'Enter') {
				evt.preventDefault();
				this.titleInput.blur();
			}
		});

		const toolbar = header.createDiv({ cls: 'canvas-cards-toolbar' });
		this.modeButton = this.makeButton(toolbar, 'square-pen', t('modalEdit'), () => {
			this.setMode(this.mode === 'edit' ? 'read' : 'edit');
		});
		this.makeButton(toolbar, 'copy', t('modalCopy'), () => {
			void this.copyBody();
		});
		this.fullscreenButton = this.makeButton(toolbar, 'maximize', t('modalFullscreen'), () => {
			this.setFullscreen(!this.fullscreen);
		});
		this.makeButton(toolbar, 'x', t('modalClose'), () => this.close());

		this.readEl = contentEl.createDiv({
			cls: 'canvas-cards-body markdown-rendered',
			attr: { tabindex: '-1' },
		});
		this.editorEl = contentEl.createEl('textarea', {
			cls: 'canvas-cards-editor',
			attr: { placeholder: t('bodyPlaceholder'), spellcheck: 'true' },
		});
		this.editorEl.value = this.body;
		this.editorEl.addEventListener('input', () => this.onBodyInput());
		this.editorEl.addEventListener('blur', () => this.flushBody());
		this.pasteHandler = (evt: ClipboardEvent) => this.onPaste(evt);
		this.editorEl.addEventListener('paste', this.pasteHandler);

		this.statusEl = contentEl.createDiv({ cls: 'canvas-cards-status' });
	}

	private makeButton(
		parent: HTMLElement,
		icon: string,
		label: string,
		onClick: () => void,
	): HTMLButtonElement {
		const button = parent.createEl('button', {
			cls: 'canvas-cards-icon-button',
			attr: { type: 'button', 'aria-label': label, title: label },
		});
		setIcon(button, icon);
		button.addEventListener('click', (evt) => {
			evt.preventDefault();
			evt.stopPropagation();
			onClick();
		});
		return button;
	}

	private setMode(mode: Mode): void {
		if (mode === this.mode && mode === 'read' && this.readEl.childElementCount > 0) return;
		if (this.mode === 'edit' && mode !== 'edit') this.flushBody();
		this.mode = mode;
		this.modalEl.toggleClass('canvas-cards-edit-mode', mode === 'edit');
		this.updateEditButton();
		if (mode === 'edit') {
			this.editorEl.value = this.body;
			this.editorEl.focus();
		} else {
			this.renderBody();
			this.readEl.focus({ preventScroll: true });
		}
	}

	private updateEditButton(): void {
		const editing = this.mode === 'edit';
		const label = editing ? t('modalRead') : t('modalEdit');
		const icon = editing ? 'book-open' : 'square-pen';
		this.modeButton.empty();
		setIcon(this.modeButton, icon);
		this.modeButton.setAttr('aria-label', label);
		this.modeButton.setAttr('title', label);
	}

	private renderBody(): void {
		const token = ++this.renderToken;
		this.readEl.empty();
		if (this.body.trim().length === 0) {
			this.readEl.createDiv({ cls: 'canvas-cards-empty', text: t('modalEmptyBody') });
			const start = this.readEl.createEl('button', {
				cls: 'canvas-cards-start-editing',
				text: t('modalStartEditing'),
			});
			start.addEventListener('click', () => this.setMode('edit'));
			return;
		}
		const target = this.readEl.createDiv({ cls: 'canvas-cards-render-target' });
		void MarkdownRenderer.render(
			this.app,
			this.body,
			target,
			this.options.sourcePath,
			this.renderHost,
		).then(() => {
			// A newer render (or a closed dialog) owns the container now.
			if (token !== this.renderToken) target.remove();
		});
	}

	private onBodyInput(): void {
		this.body = this.editorEl.value;
		this.bodyDirty = true;
		this.bodyEdited = true;
		this.setStatus(t('statusSaving'));
		if (this.body.length > BODY_SIZE_TIP) this.setStatus(t('statusTooLarge'));
		this.clearBodyTimer();
		this.bodyTimer = window.setTimeout(() => {
			this.bodyTimer = null;
			this.flushBody();
		}, BODY_DEBOUNCE_MS);
	}

	private flushBody(): void {
		this.clearBodyTimer();
		if (!this.bodyDirty) return;
		try {
			const saved = writeCard(
				this.options.node,
				this.options.canvas,
				{ body: this.body },
				{ requestHistory: false },
			);
			if (saved) {
				this.bodyDirty = false;
				this.setStatus(t('statusSaved'));
			}
		} catch (error) {
			console.error('Canvas Cards: failed to save card body', error);
		}
	}

	private onTitleInput(): void {
		this.titleDirty = true;
		this.titleEdited = true;
		this.clearTitleTimer();
		this.titleTimer = window.setTimeout(() => {
			this.titleTimer = null;
			this.flushTitle();
		}, TITLE_DEBOUNCE_MS);
	}

	private flushTitle(): void {
		this.clearTitleTimer();
		if (!this.titleDirty) return;
		try {
			if (writeCardTitle(this.options.node, this.options.canvas, this.titleInput.value)) {
				this.titleDirty = false;
			}
		} catch (error) {
			console.error('Canvas Cards: failed to save card title', error);
		}
	}

	private setStatus(text: string): void {
		if (!this.options.plugin.settings.showStatus) {
			this.statusEl.setText('');
			return;
		}
		this.statusEl.setText(text);
	}

	private setFullscreen(fullscreen: boolean): void {
		this.fullscreen = fullscreen;
		this.modalEl.toggleClass('canvas-cards-fullscreen', fullscreen);
		const label = fullscreen ? t('modalExitFullscreen') : t('modalFullscreen');
		this.fullscreenButton.empty();
		setIcon(this.fullscreenButton, fullscreen ? 'minimize' : 'maximize');
		this.fullscreenButton.setAttr('aria-label', label);
		this.fullscreenButton.setAttr('title', label);
	}

	private async copyBody(): Promise<void> {
		this.flushBody();
		try {
			await navigator.clipboard.writeText(this.body);
			new Notice(t('noticeCopied'));
		} catch {
			new Notice(t('noticeCopyFailed'));
		}
	}

	private onPaste(evt: ClipboardEvent): void {
		const files = evt.clipboardData?.files;
		if (!files || files.length === 0) return;
		const image = Array.from(files).find((file) => file.type.startsWith('image/'));
		if (!image) return;
		evt.preventDefault();
		void this.insertImage(image);
	}

	private async insertImage(file: File): Promise<void> {
		try {
			const extension = (file.name.split('.').pop() ?? 'png').toLowerCase();
			const stamp = new Date().toISOString().replace(/[:.]/g, '-');
			const filename = `canvas-card-${stamp}.${extension}`;
			let path = normalizePath(filename);
			try {
				path = await this.app.fileManager.getAvailablePathForAttachment(
					filename,
					this.options.sourcePath,
				);
			} catch {
				// Fall back to the vault root when attachments are misconfigured.
			}
			const buffer = await file.arrayBuffer();
			await this.app.vault.createBinary(path, buffer);
			const name = path.split('/').pop() ?? filename;
			this.insertAtCursor(`![[${name}]]`);
			new Notice(t('noticeImageInserted'));
		} catch (error) {
			console.error('Canvas Cards: failed to insert image', error);
			new Notice(t('noticeImageFailed'));
		}
	}

	private insertAtCursor(text: string): void {
		const editor = this.editorEl;
		const start = editor.selectionStart;
		const end = editor.selectionEnd;
		editor.value = editor.value.slice(0, start) + text + editor.value.slice(end);
		const caret = start + text.length;
		editor.selectionStart = caret;
		editor.selectionEnd = caret;
		this.onBodyInput();
		editor.focus();
	}

	private clearBodyTimer(): void {
		if (this.bodyTimer !== null) {
			window.clearTimeout(this.bodyTimer);
			this.bodyTimer = null;
		}
	}

	private clearTitleTimer(): void {
		if (this.titleTimer !== null) {
			window.clearTimeout(this.titleTimer);
			this.titleTimer = null;
		}
	}

	private clearTimers(): void {
		this.clearBodyTimer();
		this.clearTitleTimer();
	}
}
