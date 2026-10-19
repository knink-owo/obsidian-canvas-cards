# Obsidian Canvas 插件扩展机制调研

调研日期：2026-10-19　环境：Windows，Obsidian 1.14.4（本地 `resources/obsidian.asar` 内 package.json 确认），工作区 `D:\Projects\ob-canvas`。
说明：本机 `git clone`/`curl` 因 TLS schannel `SEC_E_NO_CREDENTIALS` 失败，所有 GitHub 证据改用 raw.githubusercontent / api.github.com 读取；未启动 Obsidian、未改动任何 vault。本地反编译产物仅作只读分析，位于 `.tmp-research/obsidian-asar/`（由 `resources/obsidian.asar` 解包）。

置信度口径：**已验证** = 读到了实现代码/规范/当事人原帖；**高** = 多个独立证据交叉、机制清楚但未实机验证；**低** = 单一间接线索；**推测** = 未验证判断。

---

## 1. `.canvas` 文件格式与未知字段 round-trip

**结论**
- 顶层是 `{ "nodes": [...], "edges": [...] }`，节点共有字段 `id/type/x/y/width/height/color`；`type` 只有 `text | file | link | group`。
  - text: `text`（Markdown 字符串）
  - file: `file`, `subpath`（可选）
  - link: `url`
  - group: `label`, `background`, `backgroundStyle`
  - edge: `id/fromNode/fromSide/toNode/toSide/color/label`（Advanced Canvas 扩展还有 `fromEnd/toEnd/fromFloating/toFloating/styleAttributes`）
- **Canvas 保存不会丢弃节点/边对象上的未知自定义字段**（已验证）。核心实现里每个节点有 `unknownData`：`getData()` 返回 `{...this.unknownData, id,x,y,width,height}`，`setData()` 把已知键摘掉后 `this.unknownData = s`；边同样。`Canvas.getData()` 再 `{...this.data, nodes, edges}`。所以给 text 节点加 `cardData`、`collapsed` 之类字段能 round-trip。
- **但未知 `type` 会被丢弃**（已验证）：`importData` 只认 `file/text/link/group`，其它 `type` 直接 `continue`。因此不能注册 `type:"card"`，必须复用 `text`（或 file/group）再加自定义字段。
- 历史坑：1.6.5 及更早，自定义字段值为 **对象/数组** 时核心的 JSON stringify 会写出多余逗号导致文件损坏；官方称 1.7 修复（论坛帖 84698）。当前 1.14.4 下对象可用；若要兼容老版本，把数据序列化成字符串塞进一个字段最稳。

**证据**
- 规范：<https://github.com/obsidianmd/jsoncanvas/blob/main/spec/1.0.md>；本地 `.tmp-research/ac/advanced-spec.md`（Advanced Canvas 的 1.0-1.0 扩展规范，列出 `metadata.version/frontmatter/startNode`、`dynamicHeight`、`ratio`、`zIndex`、`styleAttributes`、`portal`、`collapsed` 等扩展字段）：<https://github.com/Developer-Mike/obsidian-advanced-canvas/blob/main/assets/formats/advanced-json-canvas/spec/1.0-1.0.md>
- 本地实现（Obsidian 1.14.4，`app.js` 为单行压缩文件，给的是字节偏移）：
  - 节点基类 `unknownData`：offset `3364304` 构造、`3364517 getData`、`3364695 setData`（末尾 `this.unknownData=s`）
  - 边同样：offset `3400932`/`3401701`/`3401988`
  - `Canvas.getData`：offset `3314193`；`setData`：`3315148`
  - 未知 type 丢弃：`3315148 importData`（`if("file"===u.type) ... else if("text") ... else if("link") ... else { if("group"!==u.type) continue; ... }`）
- 论坛：<https://forum.obsidian.md/t/canvas-file-corruption-if-file-node-has-custom-property-of-type-object-or-list/84698>（Developer-Mike，v1.6.5；官方 WhiteNoise 回复 1.7 修复）
- 论坛：<https://forum.obsidian.md/t/way-to-extend-whats-saved-into-the-canvas-file/71602>（改文件被覆盖；建议 patch `saveData`，OP 尝试未生效，thread 无结论）
- 反向证据（插件长期这么干且数据存活）：Advanced Canvas 把 `zIndex`、`styleAttributes`、`collapsed`、`portal` 写进节点并保存，见其规范与 `src/canvas-extensions/*`。

---

## 2. Canvas text 节点的渲染实现

**结论**
- text 节点不是直接调用 `MarkdownRenderer.render()`，而是构造一个 **markdown embed 组件**：`textNode.render()` → `new Bee(this)`；`Bee extends E0`（embed 基类），`file = null`，`editable=true`、`useIframe=true`，`previewMode = new C0(o)`，`C0 extends $j`（MarkdownPreviewView 系），其 `renderer.set(text)` 走的是**阅读视图同款 MarkdownPreviewRenderer 管线**。
- 因此 **注册的 code block processor 与 markdown post processor 都会在 canvas text 节点里执行**（高）。Dataview 的 issue 就是证据：查询块被处理了、`<div>` 被创建，但高度 0px、内容空白；Tasks 的查询块也执行了，但抛 `Cannot read properties of null (reading 'file')`。
- 关键副作用：`Bee` 把 `file` 传成 `null`，`path` getter 返回 `""`。所以 text 节点里渲染上下文**没有真实文件**（`ctx.sourcePath` 为空/无 TFile）。任何依赖“当前文件”的插件都会残废：`dv.current()` 拿不到文件、Tasks 的 `query.file` 为 null、相对路径链接/块引用解析异常。这是设计约束，不是 bug。
- 已知限制/表现：Dataview 基本不可用（空/0 高，issue 1655 长期未解）；Tasks 嵌查询报错，官方建议改为嵌入一个含查询的 md 笔记；纯 Markdown、callout、内嵌笔记/图片、代码高亮正常。公式一般可渲染，论坛 50425 的“公式不渲染”是 4 空格缩进被当成代码块所致。

**证据**
- 本地 app.js：text 节点 `render`（`this.child=new Bee(this)`）offset `3387827` 附近；`Bee` 定义 offset `3389554`（`e.call(this,t.app,t.contentEl,null)`、`linktext = canvas.view.file.path + "#^" + node.id`）；`E0` 定义 offset `2623819`（`o.file=i`，此处 i=null；`path` getter `(this.file?.path)||""`）；`C0` offset `2622195`（`file` getter 返回 `owner.file`，即 null）。
- CSS 印证阅读视图管线：`.canvas-node-content.markdown-embed > .markdown-embed-content > .markdown-preview-view {...}`（`app.css`）。
- Dataview #1655 “Canvas card support”（closed，2023-01-21）：<https://github.com/blacksmithgu/obsidian-dataview/issues/1655>（正文：div 被创建但 height 0px、行重叠）
- Tasks #2971（`query.file` null，v1.6.7 / Tasks 7.6.1）：<https://github.com/obsidian-tasks-group/obsidian-tasks/issues/2971>
- 公式帖：<https://forum.obsidian.md/t/formulas-dont-render-in-canvas-notes/50425>

**对本项目的含义**：弹窗里的内容若用 `MarkdownRenderer.render(app, md, el, sourcePath, component)` 自己渲染，可以显式传真实 `sourcePath`（例如 canvas 文件路径或某 md 笔记路径），从而绕开 text 节点“无文件上下文”的限制。

---

## 3. 官方 Canvas 扩展 API？社区 monkey-patch 做法

**结论**
- **没有官方 Canvas 扩展 API**（无自定义节点类型注册、无自定义渲染钩子）。JSON Canvas 规范 issue #13 明确在讨论“自定义节点类型/额外元数据”，至今只有提案（`properties` 逃生字段、厂商前缀 type），没有落地。
- 社区唯一可行路径是 **monkey-patch 内部对象**（`monkey-around` 库）。标准套路（Advanced Canvas 已产品化，MindMap 同款）：
  1. 取已加载视图：`app.workspace.getLeavesOfType("canvas")`，`leaf.view.canvas`；
  2. `around(CanvasView.prototype, {...})` / `around(Canvas.prototype, {...})` 包方法；
  3. 对已存在的节点/边，用任一实例 `node.constructor.prototype` 打补丁；**新建节点**在 `Canvas.addNode` 的 patch 里补；
  4. 打完对已开视图 `leaf.rebuildView()` 使其生效；没有视图则等 `workspace.on("layout-change")` 或插件的 `waitForViewRequest`；
  5. `this.register(uninstaller)` 保证卸载还原。
- Advanced Canvas 具体 patch 面（`src/patchers/canvas-patcher.ts`）：
  - `CanvasView.prototype`: `setViewData`（JSONC.parse + 迁移/修复 + 触发事件）、`setEphemeralState`（`#nodeId` 定位）、`close`
  - `Canvas.prototype`: `markViewportChanged`、`markMoved`（记 prev 位置，发 node-moved/node-resized）、`onDoubleClick`（可取消：先触发事件，`value===false` 才调原函数）、`setDragging`、`createTextNode`/`createFileNode`/`createFileNodes`/`createGroupNode`/`createLinkNode`、`addNode`（内部再 patchNode）、`addEdge`、`removeNode`/`removeEdge`、`getData`（发 data-requested）、`importData`（data-loaded:before/after）、`requestSave`（saved:before/after）、`undo`/`redo`（之后 `importData(getData(), true)` 强制刷新）、`cloneData`、`getContainingNodes`、`updateSelection`、`zoomToBbox`、`setReadonly`、`handleCopy/handlePaste`
  - `canvas.menu`（`CanvasPopupMenu.render`）、`canvas.nodeInteractionLayer`（`NodeInteractionLayer.setTarget`）
  - **CanvasNode 实例原型**（`patchNode`）：`render`、`setData`（比较 JSON 后调原函数，必要时 `getData()+requestSave()`）、`setIsEditing`、`updateBreakpoint`、`getBBox`、`onConnectionPointerdown`、`setZIndex/updateZIndex/renderZIndex`、`setFile/setFilePath`；CanvasEdge：`setData`、`render`、`getCenter`、`onConnectionPointerdown`
  - 还注册 CM6 `EditorView.updateListener` + `editorInfoField` 监听节点文本编辑（`node-text-content-changed`）
- 同类插件（已验证源码）：**Quorafind/Obsidian-Canvas-MindMap** 用 `around` patch `CanvasView` 实例原型的 `onOpen`/`onKeydown`，并对任意节点实例 `node.constructor.prototype.setColor` 打补丁，最后 `leaf.rebuildView()`；补丁时机为 `onLayoutReady` + 失败时等 `layout-change`。
- 未逐一读源码、但同属 Canvas 深度改造（低，仅仓库存在性）：`rpggio/obsidian-chat-stream`、`MetaCorp/obsidian-augmented-canvas`、`Quorafind/Obsidian-Collapse-Node`、`borolgs/enchanted-canvas`、`TfTHacker/obsidian-canvas-candy`。

**证据**
- JSON Canvas #13：<https://github.com/obsidianmd/jsoncanvas/issues/13>
- Advanced Canvas patcher：<https://github.com/Developer-Mike/obsidian-advanced-canvas/blob/main/src/patchers/canvas-patcher.ts>（本地 `.tmp-research/ac/canvas-patcher.ts`）
- MindMap：<https://github.com/Quorafind/Obsidian-Canvas-MindMap/blob/main/src/canvasMindMap.ts>
- monkey-around：<https://github.com/pjeby/monkey-around>

---

## 4. 点击 / 选中 / 拖拽

**结论**
- 节点 DOM 从外到内：`.canvas-node` > `.canvas-node-container`（拖拽/边框）> `.canvas-node-content`（内容）+ `.canvas-node-content-blocker`（全尺寸透明遮罩，`z-index: var(--layer-cover)`）+ `.canvas-node-placeholder`。
- **遮罩是“第一次点击只选中”的机制**：`.canvas-node.is-focused:not(.is-dragging) .canvas-node-content-blocker { display:none }`——未聚焦时点击被遮罩吃掉（选中/拖拽），聚焦后遮罩消失、内容才可交互。
- 核心的“点击进编辑”逻辑有两处（都可被取消）：
  1. `containerEl` 上的 `dblclick` → `startEditing`，**除非** `event.defaultPrevented`，或 target 命中 `closest("button, input, .collapse-indicator, .interactive-child")`
  2. `contentEl` 上的单击助手 `XE`：click 且 `detail===1`、非 shift、无文本选区时 → 延时 `startEditing`；其中先判 `r.defaultPrevented`，被 preventDefault 就直接返回。
- 因此：**在节点内容里放自己的按钮/标题，并在 click 上 `preventDefault()`（必要时 `stopPropagation()`）即可拦截，不会误进编辑模式**；给元素加 `.interactive-child`（或直接用 `<button>`）也能让核心跳过编辑/拖拽判定。拖拽本身由容器/遮罩上的 pointer 事件驱动，**只要不在 pointerdown 阶段全局 stopPropagation，选中、框选、拖动都不受影响**。
- 社区做法：Advanced Canvas 的折叠按钮就是往 `.canvas-node` 内 `labelEl` 后插入一个 `div.collapse-button` 并绑 `onclick`（不替换 content），而不是劫持 pointerdown；`onDoubleClick` 则通过 patch `Canvas.onDoubleClick` + 可取消事件实现。
- 我们的卡片：建议不改 content，而是 patch `render`/监听 `node-added`，在 `nodeEl` 里覆盖一层 header（标题按钮），click 打开 Modal；避免动 `contentEl` 内 DOM（会随虚拟化卸载丢失，见 5）。

**证据**
- 本地 app.js：`Lee.initialize` offset `3375905`（dblclick + `closest("button, input, .collapse-indicator, .interactive-child")`）；`XE` 定义 offset `870659`（defaultPrevented 检查、detail>1 忽略、setTimeout 回调）；`mountContent/unmountContent` offset `3375439`。
- 本地 app.css：`.canvas-node-content-blocker{position:absolute;width:100%;height:100%;z-index:var(--layer-cover)}`、`.canvas-node.is-focused:not(.is-dragging) .canvas-node-content-blocker{display:none}`、`.canvas-node-container{cursor:grab}`。
- Advanced Canvas 折叠按钮：`src/canvas-extensions/collapsible-groups-canvas-extension.ts`（`groupNode.labelEl?.insertAdjacentElement('afterend', collapseEl)`）。

---

## 5. 生命周期与 DOM 稳定性

**结论**
- **必须重打补丁的场景**：新开一个 canvas 标签页（新 `CanvasView` 实例）；同一 tab 切换到另一个 `.canvas`（`setViewData` → `canvas.clear()` → `importData`，节点全部销毁重建）；关闭再打开。策略：加载时 patch 已存在的 leaf 并 `rebuildView()`；`addNode` 钩子里 patch 新节点；无视图时等 `layout-change` / `waitForViewRequest`。Advanced Canvas 与 MindMap 都是这个模式。
- **节点内容会被虚拟化卸载**：`mountContent/unmountContent` 在离屏或不需要时 detach `contentEl` + `contentBlockerEl`、换回 `placeholderEl`（`alwaysKeepLoaded` 可禁用）。所以注入到 contentEl 内的 DOM 会丢；注入到 `nodeEl` 上并监听 `node-changed`/`node-rendered` 重新插更稳。窗口 resize 本身不需要重 patch（Core 只做 resize/render），但 zoom 变化会触发节点 mount/unmount，需要保证幂等重插。
- DOM 类名近版本稳定（1.14.4 实测存在）：`.canvas-node`、`.canvas-node-container`、`.canvas-node-content`、`.canvas-node-content-blocker`、`.canvas-node-placeholder`、`.canvas-node-label`、`.canvas-node-resizer`、`.canvas-node-connection-point`、`.canvas-edge`/`.canvas-edges`、`.canvas-group-label`、`.canvas-wrapper`、`.canvas-menu`、`.canvas-node-interaction-layer`。**JS 内部类名全部被压缩，不可依赖**；依赖的是 `view.canvas`、`node.nodeEl/contentEl/labelEl`、`canvas.getData()` 等属性与方法名（这些反而是稳定接口，虽然未官方承诺）。
- 关键内部形状（来自 Advanced Canvas `src/@types/Canvas.d.ts` + 本地 app.js 印证）：`CanvasView { canvas, file, leaf, lastSavedData }`；`Canvas { view, nodes: Map, edges: Map, wrapperEl, canvasEl, menu, nodeInteractionLayer, selection:Set, getData/importData/requestSave, posFromClient, getViewportBBox, onDoubleClick, onResize }`；`CanvasNode { nodeEl, contentEl, labelEl?, child, isEditing, getData/setData, getBBox, startEditing, x/y/width/height }`。

**证据**：`src/patchers/canvas-patcher.ts`（`rebuildView()`、`addNode` 内 `patchNode`、`runAfterInitialized`）；MindMap `patchCanvas()`；本地 app.js offset `3375439`（mount/unmount）；`app.css` 类名。

---

## 6. 版本脆弱点（近 2–3 年）

**结论**：Canvas 内部实现无兼容承诺，每次大版本都可能打断插件；Advanced Canvas 的 `minAppVersion` 已跟到 `1.13.0`（插件 7.1.0），并显式处理 `requireApiVersion('1.7.2')` + `leaf.isDeferred` 这类内部变化。

**已发生的实例（均可点开）**
- v1.6.5：自定义字段为对象/数组时 canvas 文件被写坏（多余逗号），1.7 修复 — <https://forum.obsidian.md/t/canvas-file-corruption-if-file-node-has-custom-property-of-type-object-or-list/84698>
- v1.7.2：deferred views（`leaf.isDeferred`）导致“视图还没加载”时 patch 不到 — Advanced Canvas 代码里的 `requireApiVersion('1.7.2')` 分支
- v1.8.3：Advanced Canvas 的 metadataCache 兼容层失效 — <https://github.com/Developer-Mike/obsidian-advanced-canvas/issues/155>
- v1.9.6：Advanced Canvas v5.3.2 的 frontmatter 添加功能被打断 — <https://github.com/Developer-Mike/obsidian-advanced-canvas/issues/260>
- v1.12.4：Advanced Canvas 6.0.0 的 canvas 内 Ctrl+F 搜索错乱 — <https://github.com/Developer-Mike/obsidian-advanced-canvas/issues/361>
- Advanced Canvas 自身回归导致带图片 canvas 被清空 — <https://github.com/Developer-Mike/obsidian-advanced-canvas/issues/190>
- 论坛 71602：patch `saveData`/`handleConfigFileChange` 在文件更新时不触发（patch 点选错即静默失效）— <https://forum.obsidian.md/t/way-to-extend-whats-saved-into-the-canvas-file/71602>

**风险等级判断**：DOM 类名与 `view.canvas` 形状 = 中低风险（多年稳定）；节点/画布方法签名（`createTextNode` 参数、`onDoubleClick` 语义、`setData` 时序）= 中高风险；`unknownData` round-trip = 低风险（核心明确设计）；`importData` 对未知 type 的丢弃 = 确定行为，不要碰。

---

## 对本项目（标题卡片 + 点击弹窗）的落地建议

1. 数据模型：`type:"text"`，`text` 里放**空串或短标题**（Canvas 会显示它）；自定义字段 `card: {v:1, title, body, ...}` 或 `cardData` 字符串。不要新增 type。
2. 渲染：patch `Canvas.addNode` + 节点 `render`（或监听 `node-added`/`node-rendered`），在 `node.nodeEl` 里插入 header 按钮、隐藏/裁剪 `contentEl`；按钮加 `.interactive-child` 且 click `preventDefault()`，弹 Modal。
3. 弹窗内容：用 `MarkdownRenderer.render(app, body, el, sourcePath, component)`，`sourcePath` 传 canvas 文件路径或指定 md；这样 Dataview/Tasks 等才可能正常。
4. 生命周期：加载时 patch 已开 leaf + `rebuildView()`；`layout-change` 兜底；节点卸载重挂时幂等重建 header；`register(uninstaller)`。
5. 兼容：`minAppVersion` 设到你要支持的最低版；对 `unknownData` 对象值在 <1.7 的环境做降级（序列化为字符串）。
6. 风险：这是未公开 API 的 monkey-patch，需按 Obsidian 版本做冒烟测试（至少 1.12.x / 1.13.x / 1.14.x）。
