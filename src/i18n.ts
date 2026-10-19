import { moment } from 'obsidian';

/**
 * Tiny two-language message table. Obsidian exposes the UI language through
 * the `moment` locale, which defaults to English.
 */

const EN = {
	commandCreateCard: 'Create card',
	commandConvertToCard: 'Convert selection to cards',
	commandUncard: 'Remove card from selection',
	commandEditBody: 'Edit card body',
	commandCopyBody: 'Copy card body',
	commandSearchCards: 'Search card bodies',
	commandExportCard: 'Export card to note',
	menuConvertToCard: 'Convert to card',
	menuEditCard: 'Edit card',
	menuUncard: 'Remove card',
	menuCopyBody: 'Copy body',
	menuExportCard: 'Export to note',
	noticeNeedSelection: 'Select a text node on the canvas first.',
	noticeNeedCard: 'Select a card first.',
	noticeConverted: 'Cards created:',
	noticeUncarded: 'Cards removed:',
	noticeCopied: 'Card body copied.',
	noticeCopyFailed: 'Could not copy the card body.',
	noticeCreateFailed: 'Could not create the card on this canvas.',
	noticeImageInserted: 'Image inserted.',
	noticeImageFailed: 'Could not save the pasted image.',
	statusSaving: 'Saving...',
	statusSaved: 'Saved',
	statusTooLarge: 'The body is large; consider splitting it into several cards.',
	titlePlaceholder: 'Card title',
	bodyPlaceholder: 'Write the card body here (Markdown supported)',
	modalEdit: 'Edit',
	modalRead: 'Read',
	modalFullscreen: 'Fullscreen',
	modalExitFullscreen: 'Exit fullscreen',
	modalCopy: 'Copy body',
	modalClose: 'Close',
	modalEmptyBody: 'No body yet.',
	modalStartEditing: 'Start writing',
	settingsAppearance: 'Card appearance',
	settingsAppearanceDesc: 'How canvas cards look when they are not opened.',
	appearanceMinimal: 'Minimal card',
	appearanceButton: 'Button',
	settingsTrigger: 'Opening',
	settingsTriggerDesc: 'How the card dialog opens from the canvas.',
	triggerClick: 'Single click on the card',
	triggerIcon: 'Corner button only',
	openCard: 'Open card',
	settingsShowStatus: 'Show save status',
	settingsShowStatusDesc: 'Show a small status line in the card dialog.',
	settingsShowThumbnails: 'Show thumbnails',
	settingsShowThumbnailsDesc: 'Use the first image embed of the body as the card cover.',
	searchPlaceholder: 'Search card titles and bodies…',
	searching: 'Searching…',
	searchFailed: 'Search failed.',
	searchNoResults: 'No cards found.',
	searchResultCount: '{count} cards',
	untitledCard: 'Untitled card',
	noticeCardNotFound: 'Could not locate the card on the canvas.',
	noticeExported: 'Cards exported:',
	noticeExportFailed: 'Could not export the card.',
};

const ZH: Record<keyof typeof EN, string> = {
	commandCreateCard: '新建卡片',
	commandConvertToCard: '把选中的文本节点转换为卡片',
	commandUncard: '取消选中节点的卡片状态',
	commandEditBody: '编辑卡片正文',
	commandCopyBody: '复制卡片正文',
	commandSearchCards: '搜索卡片正文',
	commandExportCard: '导出卡片为笔记',
	menuConvertToCard: '转换为卡片',
	menuEditCard: '编辑卡片',
	menuUncard: '取消卡片',
	menuCopyBody: '复制正文',
	menuExportCard: '导出为笔记',
	noticeNeedSelection: '请先在画布上选择文本节点。',
	noticeNeedCard: '请先选择一张卡片。',
	noticeConverted: '已转换的卡片数量：',
	noticeUncarded: '已取消的卡片数量：',
	noticeCopied: '已复制卡片正文。',
	noticeCopyFailed: '复制卡片正文失败。',
	noticeCreateFailed: '无法在当前画布上创建卡片。',
	noticeImageInserted: '图片已插入。',
	noticeImageFailed: '粘贴的图片保存失败。',
	statusSaving: '保存中…',
	statusSaved: '已保存',
	statusTooLarge: '正文较大，建议拆分成多张卡片。',
	titlePlaceholder: '卡片标题',
	bodyPlaceholder: '在这里写卡片正文（支持 Markdown）',
	modalEdit: '编辑',
	modalRead: '阅读',
	modalFullscreen: '全屏',
	modalExitFullscreen: '退出全屏',
	modalCopy: '复制正文',
	modalClose: '关闭',
	modalEmptyBody: '还没有正文。',
	modalStartEditing: '开始编辑',
	settingsAppearance: '卡片外观',
	settingsAppearanceDesc: '卡片在画布上未打开时的呈现方式。',
	appearanceMinimal: '极简卡片',
	appearanceButton: '按钮',
	settingsTrigger: '打开方式',
	settingsTriggerDesc: '从画布打开卡片弹窗的方式。',
	triggerClick: '单击卡片',
	triggerIcon: '仅角落图标',
	openCard: '打开卡片',
	settingsShowStatus: '显示保存状态',
	settingsShowStatusDesc: '在卡片弹窗底部显示一条保存状态。',
	settingsShowThumbnails: '显示缩略图',
	settingsShowThumbnailsDesc: '把正文中的第一张内嵌图片用作卡片封面。',
	searchPlaceholder: '搜索卡片标题与正文…',
	searching: '搜索中…',
	searchFailed: '搜索失败。',
	searchNoResults: '没有找到卡片。',
	searchResultCount: '共 {count} 张卡片',
	untitledCard: '未命名卡片',
	noticeCardNotFound: '无法在画布上定位该卡片。',
	noticeExported: '已导出卡片数量：',
	noticeExportFailed: '导出卡片失败。',
};

export type MessageKey = keyof typeof EN;

function usesChinese(): boolean {
	const locale = (moment.locale() || '').toLowerCase();
	// Obsidian sets moment's locale from the app language; navigator.language is
	// the OS locale, so only use it as a fallback when moment has none.
	if (locale) return locale.startsWith('zh');
	const nav = typeof navigator === 'undefined' ? '' : (navigator.language || '').toLowerCase();
	return nav.startsWith('zh');
}

export function t(key: MessageKey): string {
	return usesChinese() ? ZH[key] : EN[key];
}
