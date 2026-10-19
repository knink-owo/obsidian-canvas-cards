# Canvas「标题卡片 + 点击弹窗」：同类先例与替代路线评估

调研日期：2026-10-19　工作区：`D:\Projects\ob-canvas`
方法：GitHub API / jsDelivr 读取 manifest、README、源码（未安装依赖、未启动 Obsidian、未改动 vault）；社区插件注册表（9116 条）离线检索；Obsidian 官方帮助仓库 markdown 原文；Obsidian 论坛 API 读原帖。
配套文件：[canvas-plugins-inventory.md](canvas-plugins-inventory.md)（199 个 canvas 相关插件的全量清单）。

置信度口径：
- **已验证**：读到了实现代码 / 官方文档原文 / 当事人原帖。
- **高**：多个独立线索交叉，机制清楚但未在本机 Obsidian 实机验证。
- **推测**：未验证判断，已单独列出（见 §9）。

---

## 1. 结论摘要

1. **没有找到"平时只显示标题按钮、点击弹出 Modal 显示节点内正文"的完全同类插件。** 最接近的先例是两个都还很新、且都**未经人工审核**的插件：
   - **Note Cards**：把 **file 节点**（.md 笔记）渲染成 250×60 的标题卡，双击卡片或点 hover 出现的眼睛按钮 → 用内部 `embedRegistry` 在 Modal 里**可编辑**打开该笔记。纯 CSS 隐藏原生内容，状态存在节点私有字段。桌面限定（`isDesktopOnly: true`）。
   - **MM Notes Expand**：**单击**任意 text/file 节点 → 在该节点位置自建一个 overlay，用 `MarkdownRenderer.render` **只读**渲染节点全部内容；双击 → 在新标签打开笔记。节点本身仍显示原内容（不是标题卡）。
2. **"折叠节点内容"有成熟先例**：Collapse Node（给每个节点加 header + 折叠按钮，折叠时 CSS 隐藏 `.canvas-node-content`，状态存 `unknownData.collapsed`，2025-03 后停更）；Canvas Folding（按有向边折叠**整条分支**，状态刻意不写进 `.canvas`，并**文档化了与 Advanced Canvas 的共存降级策略**）。Advanced Canvas 的 "Collapsible Groups" 只折叠 **group 节点**，不折叠单卡内容。
3. **"自定义节点类型 / 自定义渲染"在 Obsidian 里不存在**：JSON Canvas 只认 `text | file | link | group`，未知 `type` 在 `importData` 时被丢弃（已在 `docs/research/canvas-plugin-research.md` 验证）。所有"卡片类"插件都是在原生节点上叠 DOM/CSS 或换视图。
4. **替代路线里能完全自由实现"按钮 + 弹窗"的只有两条**：① Excalidraw（换画布内核，`.excalidraw.md`，AGPL-3.0）；② 注册**自有视图**接管 .canvas（Visual Notes、Maguilanote 的做法，等于重写画布）。Markdown 折叠（callout / `<details>`）只能"原地展开"，做不出 Modal；但**自定义 code block + `registerMarkdownCodeBlockProcessor` 可以零 internals 地做出"按钮→Modal"**（代价是外观与编辑态体验）。Hover Editor 的触发面是**链接的 Page Preview**，不是 canvas 节点，无法直接用作"点卡片弹窗"。
5. **冲突风险的主要来源不是"多个插件同时 patch"，而是"自定义节点字段在没有本插件时被核心/其他插件改写"**。已验证的教训：Advanced Canvas 的 portal 画布在"禁用 AC → 交互 → 重新启用 AC"后**打不开**（AC #82）；AC 自己的折叠功能出过"组内节点消失"的数据丢失 bug（AC #102）。
6. **Publish 不支持 Canvas**（已验证：论坛客服帖 + 官方 roadmap 承认"在路线图上，无时间表"）；**Canvas 在移动端是可用核心插件**（帮助页 `mobile: true`），但我们的设计 D7 明确桌面优先且 v1 不做移动端。

---

## 2. 覆盖口径

| 指标 | 数量 | 说明 |
|---|---|---|
| 社区插件总数（注册表快照） | 9116 | `.tmp-research/community-plugins.json` |
| 名称或 id 含 `canvas` | 114 | 见清单 A 节 |
| 仅描述提到 `canvas` | 85 | 见清单 B 节 |
| **canvas 相关并集** | **199** | [全量清单](canvas-plugins-inventory.md) |
| 描述同时含 canvas 与折叠/弹层类关键词 | 24 | collapse-node、mm-notes-expand、note-cards、canvas-folding、canvas-mind-map、cammvas、canvas-branch-manager、canvas-card-view、crafty、canvas-cover-overlay 等 |
| 真正实现"点击节点 → 弹层" | **2** | note-cards、mm-notes-expand |

注册表描述里的 `This plugin has not been manually reviewed by Obsidian staff.` 后缀 = 该版本未经 Obsidian 人工审核；note-cards、mm-notes-expand、canvas-card-view、canvas-folding、canvas-mind-map、cammvas、canvas-branch-manager **都带这个后缀**（即都是新上架的自助发布插件）。

---

## 3. 逐插件：名称 / repo / 维护 / 相关功能 / 实现手法 / 与我们的差距 / 冲突风险

> 我们 = DESIGN v1.1：`type:"text"` 节点 + 标题放原生 `text` + 正文放节点字段 `canvasCard.body`，单击卡片开 Modal（D5/D6），Modal 内轻量编辑器（D10），必须与 Advanced Canvas 7.1.0 共存（D9），`minAppVersion 1.13.0`、桌面优先（D7）。
>
> ★ 数、推送日期、issue 数为 **2026-10-19 的 GitHub 快照**；manifest 版本取自各仓库 `manifest.json`（少数只抓到 README 的取其注册表条目）。

### 3.1 详表（重点插件）

| 插件 | repo | 最近维护 | 与需求相关的功能 | 实现手法 | 与我们差距 | 冲突风险 |
|---|---|---|---|---|---|---|
| **Note Cards** `note-cards` v0.1.1 minApp 1.7.2 **桌面限定** 0★ | [arkadyburyakov/obsidian-note-cards](https://github.com/arkadyburyakov/obsidian-note-cards) | 2026-10-06 建库并推送；1 open issue；未人工审核 | file 节点→标题卡（250×60）；双击卡 / hover 眼睛按钮→**可编辑 Modal**；卡上原地改标题；新建笔记按钮；浮动选择菜单加开关 | `monkey-around` patch `Canvas.prototype.createFileNode/addNode/showCreationMenu`、`CanvasPopupMenu.render`、节点原型的 `render/setData/startEditing`；CSS 隐藏 `.canvas-node-content` 等；Modal 内用 `app.embedRegistry.embedByExtension.md` 造 embed 并 `showEditor()` | **只支持 file 节点**，正文在 .md 里、不在 .canvas；Modal 是"笔记 editor"而非自研编辑器；桌面限定；无中英双语 | 与 AC 同为"patch 节点原型 + 注入 DOM"，**共存未声明**；无 AC 时行为未说明（推测可用） |
| **MM Notes Expand** `mm-notes-expand` v1.0.0 minApp 0.15.0 0★ | [lemathmath/Obsidian_MM-Notes-Expand](https://github.com/lemathmath/Obsidian_MM-Notes-Expand) | 2026-07-28；未人工审核 | 单击 text/file 节点→**只读 overlay**；双击→新标签；可配置单击/双击、是否按 Ctrl/Cmd、点击内部是否关闭 | 不 patch 方法：`registerDomEvent(document,"click",…,true)` + 对 `view.contentEl` 加捕获期 click/dblclick；`setTimeout` 区分单双击；自建 `div` overlay 定位到节点矩形；`MarkdownRenderer.render` 渲染 `node.text` / 文件内容；DOM→节点靠遍历 `canvas.nodes` 比对 `nodeEl/containerEl` | **不隐藏原内容**（不是标题卡）；overlay 只读、不能编辑；无卡片外观/尺寸管理；节点内容仍占版面 | 只读内部对象 + 自己挂 DOM 监听，不抢方法；与 AC 的冲突面小（推测低）；但它同样在捕获期拦 click，可能与我们/别的插件抢事件 |
| **Collapse Node** `collapse-node` v2.0.0 minApp 1.1.0 71★ | [quorafind/Obsidian-Collapse-Node](https://github.com/quorafind/Obsidian-Collapse-Node) | 2025-03-05 后无推送（停更） | 每个节点 hover 出现 header（折叠图标+类型图标+标题+alias+可选缩略图）；点击 header 折叠/展开节点内容；Fold/Expand All + Selected；节点菜单项 | 给 `node.nodeEl` 插 header，`click` 里 `preventDefault+stopPropagation` 后 `toggleCollapsed()`；折叠态 `node.nodeEl.addClass("collapsed")`，CSS `.canvas-node.collapsed .canvas-node-content{display:none}`；状态 `node.unknownData.collapsed` 并 `canvas.setData(...)` 落盘 | **原地展开，无 Modal**；标题取自正文首行（非独立字段）；无正文编辑器；未跟 AC 7.x 做过共存验证 | 同样在节点里插 DOM + 改 `setData` 落盘；折叠状态与 AC 的 group collapsed 是**两套字段**，可能语义重叠（推测中） |
| **Canvas Folding** `canvas-folding` v1.2.9 minApp 1.13.0 0★ | [hkohlhoff/canvas-folding](https://github.com/hkohlhoff/canvas-folding) | 2026-10-06；未人工审核 | 按**有向边**折叠整条分支；level 视图、focus、每个 canvas tab 独立状态；桌面+移动实测；**导出公开 API** `getFoldState()`（apiVersion 1） | `src/src/canvas/adapter.ts` + `tree/{graph,state,visibility}.ts`；控件是节点右上角原生 resize 边框外的 `−`；状态**不写进 .canvas**（视图内存 / `data.json`） | 折叠的是"后代节点"，不是"单卡正文"；没有弹窗 | **共存最佳实践样本**：README 专节写与 AC 6.5.4 / 7.0.0 的共存矩阵，检测到 AC 的分组折叠控件时**让位**、不显示重复开关 |
| **Advanced Canvas** `advanced-canvas` v7.1.0 minApp 1.13.0 1564★ GPL-3.0 | [developer-mike/obsidian-advanced-canvas](https://github.com/developer-mike/obsidian-advanced-canvas) | 2026-09-27 推送，活跃 | Presentation、Portals、**Collapsible Groups**（只折叠 group）、Encapsulate、Node Shapes、Auto Resize、Z-order、Better Readonly、Edge styles、**Canvas Events**（`advanced-canvas:*`） | `src/patchers/canvas-patcher.ts` 大面积 patch `CanvasView`/`Canvas`/`CanvasNode`/`CanvasEdge`/菜单/交互层；每个功能一个 `canvas-extensions/*.ts`；节点数据写 `collapsed`/`portal`/`styleAttributes` 等扩展字段；`dataset-exposers` 把节点数据写进 `nodeEl.dataset` 供 CSS | **没有自定义节点类型 / 自定义渲染 API**；不能把节点变成"标题+弹窗"；折叠仅 group | **它是生态里的"地主"**：同时 patch 同一批方法；依赖它的插件（canvas-card-view、canvas-mindmap-widget）只能跟着它的版本走；我们 D9 要求共存 → 必须事件优先、幂等、可降级 |
| **Canvas Card View** `canvas-card-view` v0.2.1 minApp 1.13.0 0★ | [ml9373/canvas-card-view](https://github.com/ml9373/canvas-card-view) | 2026-09-20；未人工审核 | Markdown file 卡在"可编辑预览"与"紧凑链接 `[[Note]]`"之间切换；不改动边/反链 | **硬依赖 AC**：监听 `advanced-canvas:canvas-changed / node-rendered / node-changed / popup-menu-created`；状态存**原生** `styleAttributes: { cardView: "link" }`；读 `canvas.nodes`、`node.getData()`、`canvas.menu.menuEl`、`canvas.pushHistory()` | 只处理 file 卡；切换后是"链接"不是"标题按钮"；无弹窗 | 自述 "An update of either can break it"；**依赖 AC 事件 = 与 AC 的版本强耦合**，但默认不抢方法 → 风险可控 |
| **Canvas Mind Map** `canvas-mind-map` v1.1.1 minApp 1.7.7 1★ | [zenolzx/Canvas-Mind-Map](https://github.com/zenolzx/Canvas-Mind-Map) | 2026-10-18，活跃；未人工审核 | 从 md/text 卡生成思维导图；Native 模式有 **"Title only" 与 "Include body"** 两种内容模式；`+/-` 折叠分支；7 种布局 | 自述"节点仍是原生 canvas 卡"；未读源码 | 有"只显示标题"的形态，但目的是导图，不是"点击开弹窗读正文" | 与 AC 的 Node Shapes/折叠可能有视觉重叠（推测） |
| **Cammvas** `cammvas` v1.3.0 minApp 1.13.4 3★ | [cuatrecasespro/cammvas](https://github.com/cuatrecasespro/cammvas) | 2026-09-02；未人工审核 | 导图式父子关系、拖拽改层级、可折叠子树、持久化、outline | 未读源码 | 折叠的是分支，无弹窗 | 未声明与 AC 共存 |
| **Canvas Branch Manager** `canvas-branch-manager` | [heixizhu/canvas-branch-manager](https://github.com/heixizhu/canvas-branch-manager) | 2026-10-09；未人工审核 | 显式层级、分支移动、focus、后代折叠；可把层级/折叠状态同步到 vault 根的 `Canvas Branch Manager State.md` | 未读源码 | 同样是分支折叠 | 状态外置到 md，避免污染 .canvas（思路可借鉴） |
| **Crafty** `crafty` v1.3.3 16★ 桌面限定 | [liolle/Crafty](https://github.com/liolle/Crafty) | 2026-06-24 | 给任意 canvas 节点加 **tooltip**、节点间导航、按标题搜索 | 未读源码 | 只是悬浮说明，不是弹窗阅读 | 桌面限定；推测 DOM 注入，冲突面小 |
| **Canvas Picture in Picture** `canvas-picture-in-picture` v0.1.0 6★ | [h-sphere/obsidian-canvas-picture-in-picture](https://github.com/h-sphere/obsidian-canvas-picture-in-picture) | 2024-08-02 后停滞 | 把选中节点**克隆 DOM** 到 `document.body` 下浮动显示 | `main.ts` 210 行：`element.cloneNode(true)` 进 `div.floating-container`，自制 resize；关闭时把克隆 append 回原节点 | 是"浮动克隆"，不是共享同一份实时内容的弹窗；克隆后编辑器不可用 | 克隆 DOM 与虚拟化/重渲染冲突（推测中）；已停滞 |
| **Canvas Presentation** `canvas-presentation` 90★ | [quorafind/Obsidian-Canvas-Presentation](https://github.com/quorafind/Obsidian-Canvas-Presentation) | 2023-03-29 后停更 | 按顺序演示卡片 | 未读源码 | 与"标题+弹窗"无关 | 老插件，minApp 很低，风险主要在版本兼容 |
| **Canvas Mindmap** `canvas-mindmap` 374★ | [quorafind/Obsidian-Canvas-MindMap](https://github.com/quorafind/Obsidian-Canvas-MindMap) | 2024-09-04 后停更 | 让 canvas 像 mindmap（快捷键、树布局） | 已验证：`around` patch `CanvasView` 实例原型 `onOpen/onKeydown`，patch `node.constructor.prototype.setColor`，`leaf.rebuildView()` | 无折叠、无弹窗 | 老插件 + 全量 patch，与 AC 共存风险高（推测） |
| **Canvas Conversation** `obsidian-canvas-conversation` 104★ | [andrebaltazar8/obsidian-canvas-conversation](https://github.com/andrebaltazar8/obsidian-canvas-conversation) | 2023-03-18 后停更 | 用 ChatGPT 生成 canvas 对话 | 未读源码 | 无关 | 无关 |
| **HiNote** `hi-note` 259★ | [catmuse/HiNote](https://github.com/catmuse/HiNote) | 2026-10-17，活跃 | 高亮批注、AI、闪卡；**不是 canvas 节点渲染类** | 未读源码 | 无关 | 无关 |
| **Visual Notes** `visual-notes` 27★ | [dandersondev/visual-notes](https://github.com/dandersondev/visual-notes) | 2026-10-19，活跃 | 自有"视觉笔记"视图，Storyboard 卡有 expand 按钮/双击进聚焦编辑器 | `registerView(VISUAL_NOTES_VIEW_TYPE)`；README/main.ts 自述接管带自家标记的 `.canvas` 叶子 | **路线不同**：等于重写画布，功能可完全自由 | **接管式**，与核心 Canvas/AC 天然互斥（用户只能二选一） |
| **Maguilanote** `maguilanote` 21★ GPL-3.0 | [is-cout/maguilanote-obsidian](https://github.com/is-cout/maguilanote-obsidian) | 2026-10-12，活跃 | 自有 `.board` 格式（`registerExtensions(["board"])`），JSON Canvas 仅导入导出；sketch/record 卡双击开 popup | 自有视图 + 自有格式 | 路线不同；资产不在 .canvas | 无冲突（完全独立格式） |
| **Better Embedded Canvas** `better-embedded-canvas` 22★ | [kotaindah55/better-embedded-canvas](https://github.com/kotaindah55/better-embedded-canvas) | 2026-10-11，活跃 | 嵌入 canvas 的全尺寸预览、hover 预览 | 依赖核心 Page preview | 不是节点卡片 | 低 |
| **Canvas Mindmap Widget** `canvas-mindmap-widget` | [yidachen-14/obsidian-canvas-mindmap-widget](https://github.com/yidachen-14/obsidian-canvas-mindmap-widget) | 新；未人工审核 | "所有导图数据留在 .canvas 文件内"，**Requires Advanced Canvas** | 未读源码 | 不是标题卡 | 与我们 **D3（自包含）+D9（依赖 AC）** 的组合完全同构，是可引用的先例 |
| **Canvas Plus** `canvas-plus` | [jsmorabito/obsidian-canvas-plus](https://github.com/jsmorabito/obsidian-canvas-plus) | 2026-10-18，新 | 工具栏、Note Types（note card/关系/关键图）、图层树 | 未读源码 | "Note Types" 可能与我们概念重叠，需进一步核 | 未审；新插件 |

> 其余 180+ 个 canvas 相关插件（含 canvas-css-class、canvas-card-bg-remover、canvas-minimap、canvas-node-linker、canvas-text-scaler、canvas-card-shapes、canvas-node-align、semantic-map-canvas、canvas-cover-overlay、link-card-preview、freeform-link-cards 等）与"标题+弹窗"无直接关系，全量见 [清单](canvas-plugins-inventory.md)。其中两个对**数据建模**有参考价值：
> - `canvas-node-align`：把对齐信息"stored as plain text so .canvas files stay standard JSON Canvas"——与我们"字段可降级、不破坏标准"的思路一致。
> - `semantic-map-canvas`：语义缩放 + 节点可见性，说明"按状态隐藏/显示节点内容"是已被验证的需求方向。

### 3.2 两个最接近先例的源码级细节（已验证）

**Note Cards**（本地副本 `.tmp-research/repos/note-cards/src/main.ts`，838 行）
- 判定：`isNoteNode(node) = node.filePath !== undefined && node.file?.extension === "md"`（:114）→ **text 节点完全不支持**。
- 卡片 DOM 建在 `node.containerEl` 里：`buildCard()` 创建 `div.note-card` + `div.note-card-title`，`dblclick` 时 `preventDefault()` 并 `new NoteModal(app, node.file, node.subpath).open()`（:372-397）；hover 时出现 `.note-card-actions`（眼睛 = Preview、跳转 = Go to document）。按钮都 `pointerdown` 停冒泡以免触发画布拖拽（:387-392）。
- 显示切换：`node.nodeEl.toggleClass("is-note-card", isCard)`；`styles.css` 里 `.canvas-node.is-note-card .canvas-node-content, .content-blocker, .placeholder, .label { display:none }`（1-7 行）——**只隐藏不销毁**，所以编辑器和嵌入都还活着。
- 尺寸：`CARD_SIZE = {250,60}`，切卡片时 `unknownData[PREV_SIZE_KEY] = {width,height}` 然后 `node.resize(CARD_SIZE)`；切回按 prev 还原（:609-622）。
- 状态：`node.unknownData[VIEW_KEY] = "card"`（即 .canvas 节点上的自定义字段），随 `getData/setData` round-trip。
- 弹窗：`NoteModal extends Modal`（:742-793），`createEmbed({app, linktext: file.path+subpath, sourcePath:"", containerEl, depth:0}, file, subpath)` → `embed.editable=true; load(); loadFile(); showEditor(); app.workspace.activeEditor=embed`；`onClose` 时 `showPreview(true); unload()`。**借核心 embed 造"笔记编辑器"，不是自己渲染 Markdown。**

**MM Notes Expand**（`.tmp-research/repos/mm-notes-expand/src/main.js`，552 行）
- 全局捕获 click（:31）+ 对每个 canvas view 的 `contentEl` 挂捕获期 click/dblclick/mousedown（:99-108）；单击用 `setTimeout` 与双击区分（:163）。
- overlay 自建 `div`：定位到 `nodeEl.getBoundingClientRect()`，再按设置涨到 `minWidth`/窗口百分比（:207-269）；内容 `MarkdownRenderer.render(app, markdown, el, sourcePath, this)`（:245、:308-317），拿不到源码时（图片/PDF 等）退化为**克隆节点 DOM**（:250-256）。
- DOM→节点：遍历 `canvas.nodes` 比 `node.nodeEl === nodeEl || node.containerEl === nodeEl`（:349-351）；内容取 `node.getData()` / `node.text` / `node.file`（:357-378）。
- 关键差别：**它没有把节点变成标题卡**，只是在节点上方盖一个阅读层；关闭后还是原样。

### 3.3 三项能力的归属（对第 1 项问题的直接回答）

**① 折叠/展开节点内容**

| 做法 | 谁做了 | 折的是什么 |
|---|---|---|
| CSS 隐藏单节点 content + header 按钮 | **Collapse Node** | 单个节点的正文（最接近"只显示标题"） |
| 折叠整条分支（隐藏后代节点） | Canvas Folding、Cammvas、Canvas Branch Manager、Canvas Mind Map | 后代节点/子树（不是当前节点正文） |
| 折叠 group | **Advanced Canvas**（Collapsible Groups） | group 内的子节点/边 |
| 把 file 卡换成紧凑链接 | Canvas Card View | 卡片呈现形式（不隐藏数据） |
| 自建 Reading overlay | MM Notes Expand | 不折叠，只是盖一层 |

**② 点击节点弹模态框**

| 谁 | 触发 | 形态 |
|---|---|---|
| **Note Cards** | 双击卡片 / hover 眼睛按钮 | 真正的 `Modal`（内部是笔记 embed editor，可编辑） |
| **MM Notes Expand** | 单击（可配 Ctrl/Cmd） | 自建 `div` overlay，**不是 Modal**，只读 |
| Crafty | hover | 只有 tooltip，不弹内容 |
| Visual Notes / Maguilanote | 双击卡 | 自有视图里的聚焦编辑器/popup（不在核心 Canvas 内） |

**③ 自定义节点类型 / 自定义渲染**

**没有任何插件做到**，因为核心 `importData` 只接受 `text|file|link|group`（未知 type 直接丢弃，见 `canvas-plugin-research.md` §1），且没有渲染钩子。最接近的是"改外观"而非"改类型"：Advanced Canvas 的 Node Shapes（改形状/边框）与 `canvas-card-shapes`（圆角/胶囊/菱形等预设）都只是在原生节点上叠样式；`canvas-css-class` 则是给**整块画布**加 CSS class/属性（注册表描述："Add a CSS class to the canvas, but also other attributes"），不是给节点定义类型。

---

## 4. 直接回答：是否已有"标题按钮 + 弹窗显示内容"

**没有 100% 同类。** 按七个维度对照（✔=有，△=部分，✘=无）：

| 维度 | Note Cards | MM Notes Expand | Collapse Node | AC | 我们（目标） |
|---|---|---|---|---|---|
| 平时只显示标题（隐藏正文） | ✔（file 卡，CSS 隐藏） | ✘（原内容仍在） | ✔（折叠后隐藏 content，但 header 是栏不是"卡片"） | ✘（只有 group 折叠） | ✔ |
| 点击节点本身触发 | △（双击；单击不触发） | ✔（单击，可配 Ctrl/Cmd） | ✔（点 header 折叠，不弹窗） | ✘ | ✔（默认单击） |
| 弹窗（Modal） | ✔（`Modal` + embed 编辑器） | ✘（自建 overlay，非 Modal，只读） | ✘ | ✘ | ✔（居中 Modal + 全屏阅读） |
| 正文存在节点内（自包含 .canvas） | ✘（正文在 .md） | —（读现有内容） | —（内容就是节点 text） | ✘ | ✔（`canvasCard.body`） |
| 弹窗内可编辑正文 | ✔（借笔记 editor） | ✘ | ✘ | ✘ | ✔（轻量编辑器 + 自动保存） |
| 支持 text 节点（无文件） | ✘ | ✔ | ✔ | ✔ | ✔ |
| 声明与 AC 共存 | ✘（未声明） | ✘（未声明，但不抢方法） | ✘ | —（它自己就是 AC） | 必须（D9） |

结论：**"标题卡 + 弹窗"这件事在社区里被拆成了两半**——Note Cards 解决"标题卡 + Modal"，但绑死在 file 节点；MM Notes Expand 解决"点节点看全文"，但不做标题卡、不做编辑。我们的组合（text 节点 + 自包含正文 + 单击 Modal + 内置编辑器）目前是空白位。

**关键词检索结果（已验证）**：注册表 9116 条里，描述同时含 canvas 与 collaps/fold/expand/popup/modal/overlay/peek/hover/compact/title card 的仅 24 条；逐个核对后只有 note-cards、mm-notes-expand 属于"点击节点→弹层"。注册表中**不存在**名为 "Canvas Card Color" 的插件（最接近的是 `canvas-card-bg-remover`、`bases-kanban-card-colors`）；"Canvas Card Color" 可能是与 `canvas-card-shapes` / `canvas-card-bg-remover` 混淆的记忆。

---

## 5. 替代路线评估

### R1 原生嵌入 `![[note]]` 与 file 节点 + "Narrow to heading/block"

- 机制：Canvas 原生支持拖入笔记成 file 卡；右键卡片可 **Narrow to heading… / Narrow to block…**（官方帮助已验证）。file 节点的内容是笔记的实时预览。
- 能否"按钮 + 弹窗"：**不能**。原生没有"隐藏内容只留标题"的开关，也没有节点点击弹窗；能做的只有把卡片尺寸调小（内容被裁切，仍可见一部分）。
- 代价：零代码。
- 限制：做不到标题化；`Narrow to heading` 只是"只显示某个小节"，不是"只显示标题"；双击卡片进的是笔记编辑器而不是弹窗。
- 证据：<https://help.obsidian.md/plugins/canvas>（"Narrow to heading…/Narrow to block…"、"Text-only cards don't appear in Backlinks"）。

### R2 Markdown 折叠：callout fold / `<details>` / 自定义 code block

- 机制：text 节点用核心 markdown 渲染管线（本地已验证：text 节点是 markdown embed，`Bee/E0/C0`，`file=null`、`sourcePath=""`），所以 **callout 的 `+/-` 折叠、`<details>`、以及注册的 code block processor / markdown post processor 都会在 canvas 卡片里执行**。
- 能否"按钮 + 弹窗"：
  - callout / `<details>`：能"原地展开"，**不能弹窗**；且展开后卡片高度不变 → 内容溢出/裁切。
  - **自定义 code block（推荐评估）**：在节点 text 里写 ` ```card ... ``` `，processor 渲染成一个标题按钮；按钮 click 里 `new Modal(...)` 渲染正文。**完全不需要碰 canvas internals**，也不需要 patch 任何方法。
- 代价：低（一个 `registerMarkdownCodeBlockProcessor` + 一个 Modal 类）；正文存在节点 `text` 里（自包含 .canvas，符合 D3）。
- 限制（重要）：
  1. 卡片外观由 block 渲染结果决定，**无法控制节点尺寸/边框/颜色语义**（节点仍是 text 节点，宽度由用户拖）；
  2. 进入节点编辑态时用户会看到原始 fenced 源码（体验割裂）；
  3. 禁用插件后节点显示原始代码块（可读性差但**不丢数据**）；
  4. 没有"双击卡片"语义、没有右键菜单集成（除非再注册 editor menu）；
  5. 标题无法直接用原生 `text`（D8 要改），且搜索结果/反向链接里看到的是代码块。
- 证据：`docs/research/canvas-plugin-research.md` §2（text 节点是 markdown embed；Dataview/Tasks 的 code block 确实被执行，只是 `sourcePath` 为空导致残废）；<https://github.com/blacksmithgu/obsidian-dataview/issues/1655>。
- **这条路是唯一同时满足 AGENTS.md "不许碰 internals" 与 D3 "正文自包含" 的方案**，代价是外观与交互自由度。

### R3 Hover Editor / Hoverlay 类"悬停/弹窗阅读"

- Hover Editor（<https://github.com/nothingislost/obsidian-hover-editor>，789★，MIT，2026-08-29，127 open issues）：把核心 **Page Preview** 的 hover popover 变成完整编辑器（可拖拽/缩放/固定/多开）。
- 能否"按钮 + 弹窗"：**不能直接用**。它的触发面是"悬停一个链接"，canvas 的 file 节点不是链接元素；text 节点里的 `[[链接]]` 可以触发 Page Preview（因此 Hover Editor 在 canvas 文本卡里**可以**弹出笔记浮窗），但那是"链接"而不是"节点"。
- 代价：低（如果接受"卡片正文 = 一个链接"的形态）；限制：无法"点节点本身"；依赖核心 Page preview 设置开启；自述用了未公开 API。
- 相关：Hoverlay（<https://github.com/zspatter/obsidian-hoverlay>，3★，MIT，2026-08-01）。

### R4 Excalidraw（换内核）

- 事实（已验证）：`zsviczian/obsidian-excalidraw-plugin` 7746★，**AGPL-3.0**，pushed 2026-10-15，927 open issues；文件格式是 `.excalidraw.md`（Markdown 包 scene JSON），**与 .canvas 无关**。
- 公开 API 存在且成熟：`docs/API/ExcalidrawAutomate.d.ts`（60768 字符）含 `addEmbeddable(topX, topY, width, height, url?, file?, embeddableCustomData?)`、`EmbeddableMDCustomProps`、`getActiveEmbeddableViewOrEditor()`；脚本引擎 `ea.obsidian` 暴露完整 Obsidian API，官方文档明说可 "Create custom modals, controls, and persistent sidepanels"。
- 能否"按钮 + 弹窗"：**能**，而且不用 patch——embeddable 元素（笔记缩略），双击进编辑，脚本可开 Modal；再配合自定义元素/脚本可做"只显示标题的矩形 + 点击弹窗"。
- 代价：**换画布**。用户的 .canvas 资产、边、group、与核心 Canvas 的互操作全部作废；AGPL-3.0 与我们的 MIT 不兼容（不能抄代码，只能调用其 API）。
- 结论：能力最自由、迁移成本最高；只在"我们愿意做一个 Excalidraw 脚本/插件而不是 Canvas 插件"时成立。

### R5 自有视图接管 .canvas（Visual Notes / Maguilanote 路线）

- 事实：Visual Notes（27★）`registerView(...)`，只接管"带自家标记的 .canvas"；Maguilanote（21★，GPL-3.0）干脆用自有 `.board` 扩展名。
- 能否"按钮 + 弹窗"：**能**（整块画布都是自己的渲染）。
- 代价：等于重写画布（缩放、框选、连线、group、撤销、移动端手势……）；与核心 Canvas、AC 完全互斥；用户不敢用（数据被私有视图接管）。
- 结论：不适合"给现有 Canvas 加一个卡片组件"的目标。

### R6 只用 Advanced Canvas 的公开事件 + CSS（半内部、不 patch）

- 机制：AC 暴露 `advanced-canvas:*` 事件（完整清单见 `src/@types/CustomWorkspaceEvents.d.ts`，已验证），其中 `double-click` 带 `preventDefault: {value:boolean}` 可拦截双击；`node-rendered`/`node-changed` 可在节点渲染后挂自己的 DOM 监听；AC 的 `dataset-exposers/node-exposer.ts` 把节点数据（含 `styleAttributes`）写进 `nodeEl.dataset`，可只用 CSS 隐藏 `.canvas-node-content` 做"标题卡"外观。
- 能否"按钮 + 弹窗"：**外观能（CSS）、点击能（事件/自挂监听）、正文读取不能**——正文要么放节点 `text`（Markdown 路线），要么读 `node.getData()`（internals）。
- 代价：硬依赖 AC（与 D9 一致）；不抢方法 → 冲突面小；AC 改事件名/数据结构会破。
- 证据：AC 事件类型定义；canvas-card-view 与 canvas-mindmap-widget 都是"依赖 AC + 存原生字段"的活例。

### 路线对比

| 路线 | 按钮+弹窗 | 需碰 internals | 正文自包含 | 与 AC 共存 | 工作量 | 外观自由度 |
|---|---|---|---|---|---|---|
| R1 原生 file 卡 + Narrow | ✘ | 否 | ✘（在 .md） | ✔ | 0 | 无 |
| R2 自定义 code block | ✔（弹窗） | **否** | ✔ | ✔ | 低 | 低 |
| R2' callout / `<details>` | ✘（只能原地展开） | 否 | ✔ | ✔ | 极低 | 无 |
| R3 Hover Editor | △（只能对链接） | 否（用现成插件） | ✘ | ✔ | 低 | 无 |
| R4 Excalidraw | ✔ | 否（用公开 API） | ✘（换格式） | 无关 | 高 | 高 |
| R5 自有视图 | ✔ | 是（接管） | ✔ | ✘ | 极高 | 极高 |
| R6 AC 事件 + CSS | △（外观+点击可，读数据要 internals） | 部分 | ✔ | ✔（硬依赖） | 中 | 中 |
| **S1 note-cards 式 patch** | ✔ | **是** | ✔ | 需自证 | 中 | 高 |

---

## 6. 兼容性与已知冲突案例

1. **Advanced Canvas 是事实上的"canvas 平台"**：patch 了 `CanvasView`、`Canvas`（addNode/createTextNode/createFileNode/importData/getData/undo/redo/onDoubleClick…）、`CanvasNode`/`CanvasEdge` 原型、`CanvasPopupMenu.render`、`NodeInteractionLayer`。任何同样 patch 的插件都在同一批方法上叠罗汉，顺序与版本敏感。
2. **数据兼容 > 代码冲突**（已验证）：AC #82 "Unable To Open if Plugin Is Disabled and Canvas Interacted With"——带 portal 的 canvas，在禁用 AC 后由核心改写数据，再启用 AC 后**打不开**。<https://github.com/Developer-Mike/obsidian-advanced-canvas/issues/82>
   - 对我们的含义：`canvasCard` 字段在"用户临时禁用我们 + 核心保存一次"后仍应可用；**不要**依赖任何"不装插件就会坏"的结构（例如 portal 那种跨节点引用 ID 表）。我们的 `body` 是纯字符串 → 风险低。
3. **AC 自己的折叠出过数据丢失**：#102 "The nodes within the group disappeared when in a collapsed state"（closed）。<https://github.com/Developer-Mike/obsidian-advanced-canvas/issues/102>
4. **依赖 AC 的插件必须跟着 AC 版本走**（已验证）：canvas-card-view README 原话 "The plugin relies on Advanced Canvas events and on internal objects of the core Canvas … An update of either can break it."；canvas-mindmap-widget 同样 "Requires Advanced Canvas"。
5. **共存是有先例可抄的**（已验证）：Canvas Folding README 专节 "Using Canvas Folding with Advanced Canvas"，对 AC 6.5.4 + Obsidian 1.13.7 做了共存矩阵（加载顺序/重启/各节点类型/嵌套组/环/undo），并规定"检测到 AC 的分组折叠控件时让位，不显示重复开关"；两边同时折叠时 tooltip 说明谁藏了内容。**这是我们应该照抄的工程姿态。**
6. **社区里"AC 与别的 canvas 插件是否兼容"通常没有结论**：论坛帖 <https://forum.obsidian.md/t/is-advanced-canvas-plugin-compatible-with-semantic-canvas-plugin/80311> 只有"去沙盒测"的回答。也就是说我们不能指望上游保证，必须自己写冒烟矩阵。
7. **接管式插件天然互斥**：Visual Notes 用自有 view 接管带标记的 `.canvas`，与核心 Canvas/AC 不能共存——这是"换内核"路线的代价证据。
8. **捕获期 click 监听会互相抢**：MM Notes Expand 在 `document` 捕获阶段拦 click，并用 `setTimeout` 区分单双击；我们若也做单击触发，两者的单/双击语义会打架（推测：用户在装了 MM Notes Expand 的库里点我们的卡片可能被它先开 overlay）。

---

## 7. Obsidian Publish 与移动端

### Publish：**不支持 Canvas**（已验证）

- 帮助文档 `Publish limitations` 只说社区插件"minimal support"（raw markdown 输出可用、需要 codeblock 渲染的默认不可用），**全篇未提 Canvas**；`Publish your content`、`Introduction`、`Set up`、`Media files` 同样未提。<https://help.obsidian.md/publish/limitations>
- 论坛实证（2026-02-06，用户订阅后才发现）："I wanted to publish a canvas … then error message : canvas can't be published."；回复："Canvas support is on the roadmap (but no estimates as to when)"。<https://forum.obsidian.md/t/just-subscribed-to-publish-plan-canvas-cant-be-published-can-i-be-refunded-5-after-subscribing/110890>
- 功能请求自 2022-12 起 50 帖仍未落地：<https://forum.obsidian.md/t/publish-support-canvas/49206>
- 含义：**我们的卡片方案无法通过 Publish 分享**；要分享只能导出图片/HTML（社区有 `simple-canvas-exporter`、sharecanvas.io、Kiln 等第三方），或截图。这一点应在 README/发布说明里提前讲清。

### 移动端：Canvas 是官方支持的核心插件（已验证 + 高）

- 官方帮助页 `en/Plugins/Canvas.md` 的 frontmatter 为 `mobile: true`（该字段控制帮助页在移动端站点可见），且 Canvas 是核心插件；<https://help.obsidian.md/plugins/canvas>
- 生态侧证据：Canvas Folding README 明说在 Windows/macOS/iPadOS/iOS 实测；Collapse Node、MM Notes Expand 的 `isDesktopOnly` 都是 `false`；Note Cards 明确 `isDesktopOnly: true`。
- 移动端的交互差异（高，非本机实测）：无 hover（Collapse Node 的 hover 显示 header、Note Cards 的 hover 按钮在触屏上不可达）；单/双击/长按语义不同；`pointerdown` 拖拽与点击更易冲突。
- 我们的 D7 已决定桌面优先、v1 不做移动端 → `manifest.json` 的 `isDesktopOnly` **必须写 true**（提交规则要求准确；写 false 却依赖 hover/双击会被审核挑出）。

---

## 8. 对本项目的影响与建议

### 8.1 与现有决策的关系

| 决策 | 先例支持度 | 说明 |
|---|---|---|
| D3 正文存 .canvas 节点字段 | ✔ 有先例 | AC 的 `collapsed`/`portal`/`styleAttributes`、Note Cards 的 `unknownData[VIEW_KEY]`、`canvas-mindmap-widget` 的"data stays in the .canvas file"都是同型做法；`canvas-node-align` 更进一步强调"plain text 以保持标准 JSON Canvas" |
| D8 标题放原生 `text` | ✔ | Collapse Node 的标题也是从节点内容取；Note Cards 则把标题放进自建 DOM（因为它不显示原生内容）——两种都可，D8 更稳（禁用插件后仍可读） |
| D9 与 AC 7.1.0 共存、不做接管式 patch | ✔ 有范本 | Canvas Folding 的共存矩阵与"让位"策略可直接照抄；但注意**"不做接管式 patch"不等于"不 patch"**：要隐藏内容/拦截点击，目前没有零 patch 的完整方案（除 R2 code block） |
| D10 弹窗内轻量编辑器 | ✔ | Note Cards 借核心 embed editor（可编辑但重）；MM Notes Expand 只读。自研 textarea+预览在 canvas 插件里没有先例 → **属于我们的差异点，也意味着没有可抄的坑** |
| D7 桌面优先 | ✔ | Note Cards/Crafty 同为桌面限定；移动端 hover 不可用是已知约束 |

### 8.2 与 `AGENTS.md` 的硬冲突（必须先解决）

`AGENTS.md` 写死："**Only import from `obsidian`; do not reach into Obsidian internals.**"

但本次调研的**全部**先例（Advanced Canvas、Note Cards、MM Notes Expand、Collapse Node、Canvas Folding、Canvas Mindmap、canvas-card-view……）都在读/写 `canvas.nodes`、`node.getData()`、`node.nodeEl`、`node.unknownData`、patch 原型——因为 **Canvas 没有官方扩展 API**（JSON Canvas / Obsidian 仓库里"自定义节点类型"长期停留在提案，见 <https://github.com/obsidianmd/jsoncanvas/issues>）。
更具体地说，我们的设计本身（D3 正文存节点字段 + D9 与 AC 共存 + 点击弹窗）需要：
1. 读到节点的自定义字段 → `node.getData()` 或 `canvas.getData()`（internals）；
2. 在节点上叠标题按钮/隐藏内容 → 注入 DOM 或 patch `render`（internals）；
3. 知道"哪个节点被点击" → 从 DOM 反查 `canvas.nodes`（internals）或 AC 事件（半内部）。

**三条可选立场**（需要父 agent 拍板）：

- **S1 放宽 AGENTS.md（推荐，若产品目标优先）**：沿用 note-cards 式 patch（`monkey-around` 或手写原型包装），但照 Canvas Folding 的姿态做：只 patch 必要方法、幂等、`register(uninstaller)` 完整还原、事件优先于 patch、遇到 AC 已处理的情况让位、README 明写"依赖未公开 API"。**风险**：与 AGENTS.md 冲突；每次 Obsidian 大版本要回归（已记录的脆弱点：1.6.5 / 1.7.2 / 1.8.3 / 1.9.6 / 1.12.4）。
- **S2 严守 AGENTS.md（若合规优先）**：走 R2 自定义 code block（`registerMarkdownCodeBlockProcessor` + Modal），零 internals、零 patch。**代价**：失去"节点级标题卡"的外观控制（不能可靠地只显示标题并隐藏正文，除非正文全在 code block 里）、编辑态暴露源码、无右键菜单/双击语义。可以做"节点 text 只放一个 ```card 块"来逼近标题卡。
- **S3 分层**：v1 用 S2 的可运行骨架（合规、能发版），同时把"节点渲染层"抽象成接口，v2 再加 S1 的可选增强（设置里开关"原生卡片渲染（实验）"）。**代价**：两套渲染路径维护成本。

### 8.3 差异化与发布注意

- **命名/描述**：`note-cards` 已占 "Show canvas notes as compact title cards … edit in a modal" 的描述位。我们的描述要强调 **text 节点 / 正文自包含在 .canvas / 画布内编辑正文**，避免被当成 Note Cards 的克隆（提交规则：描述 ≤250 字符、结尾标点、无 emoji）。
- **许可证**：Advanced Canvas 是 **GPL-3.0**，只能读思路不能抄代码；Note Cards（MIT）、MM Notes Expand（GPL-3.0）、Collapse Node（license 未取到）——**借鉴 Note Cards 的实现细节时保留 MIT 归属**，不要抄 GPL 项目的代码。
- **minAppVersion**：note-cards 用 1.7.2 且 `isDesktopOnly: true`；我们 D7 定 1.13.0（与 AC 7.1.0、canvas-card-view、canvas-folding 一致），合理。
- **发布前自测矩阵**（照 Canvas Folding）：AC 开/关 × 插件先/后加载 × 重启 × text/file/group/portal 节点 × 折叠组内卡片 × undo/redo × 只读模式 × 移动端（至少确认不崩）。

---

## 9. 未验证 / 推测

| # | 内容 | 等级 |
|---|---|---|
| 1 | note-cards 与 Advanced Canvas 7.1.0 同时启用是否稳定（双方都在 patch 节点原型） | 推测（未实机） |
| 2 | Collapse Node 在 Obsidian 1.13/1.14 上是否仍工作（2025-03 后停更，可能已破） | 推测 |
| 3 | AC `advanced-canvas:double-click` 的 `preventDefault` 是否能可靠阻止节点进入编辑态（事件签名已确认，实际时序未测） | 高 |
| 4 | R2 code block 渲染的按钮在 canvas 卡片里点击时，是否会被 `.canvas-node-content-blocker` 吃掉第一次点击（需 `is-focused` 后才可交互） | 高（机制已知，未实机） |
| 5 | MM Notes Expand 与我们的单击语义是否真的互抢（它在 document 捕获期、用 timeout 区分） | 推测 |
| 6 | `canvas-plus` 的 "Note Types" 是否已包含"卡片+弹窗"（描述提到 note card，未读源码） | 低 |
| 7 | "Canvas Card Color" 是否存在过（注册表无；可能更名为 canvas-card-shapes / canvas-card-bg-remover） | 推测 |
| 8 | Excalidraw 的 embeddable 元素双击默认行为是否就是打开笔记（文档提到可编辑 embeddable，未逐条核对交互） | 高 |
| 9 | 移动端 Canvas 的具体交互差异（长按/双击/悬停替代） | 高（官方 mobile:true + 生态实测，未逐项核对） |
| 10 | AGENTS.md 的"不许 internals"是否可被解释为"不 import 非 obsidian 模块"（当前字面读法是禁止访问未公开对象） | 需人工确认 |

### 建议的下一步验证（在真实 vault，不改仓库）

1. 装 note-cards + AC 7.1.0，测：file 卡切换、双击 Modal、undo/redo、AC 的 group 折叠嵌套卡片、插件禁用后 canvas 是否仍能打开。
2. 装 mm-notes-expand，测：单击 text 卡是否开 overlay、与 AC 的 `double-click` 是否冲突。
3. 装 collapse-node，看是否还能在 1.14.4 加载（若不能，说明"折叠内容"必须自己做）。
4. 用最小 demo 验证 R2：`registerMarkdownCodeBlockProcessor("card")` 在 canvas text 节点里渲染按钮并点开 Modal。

---

## 附：主要证据链接

- JSON Canvas 规范：<https://jsoncanvas.org/>；其 issue 区长期有"自定义节点类型"提案：<https://github.com/obsidianmd/jsoncanvas/issues>
- 官方帮助 Canvas：<https://help.obsidian.md/plugins/canvas>
- 官方帮助 Publish 限制：<https://help.obsidian.md/publish/limitations>
- Publish 不支持 Canvas 的用户实证：<https://forum.obsidian.md/t/just-subscribed-to-publish-plan-canvas-cant-be-published-can-i-be-refunded-5-after-subscribing/110890>
- Publish Canvas 功能请求（50 帖，2022 起）：<https://forum.obsidian.md/t/publish-support-canvas/49206>
- AC #82（禁用插件后画布打不开）：<https://github.com/Developer-Mike/obsidian-advanced-canvas/issues/82>
- AC #102（折叠态组内节点消失）：<https://github.com/Developer-Mike/obsidian-advanced-canvas/issues/102>
- canvas 文件自定义对象字段写坏（1.6.5，1.7 修复）：<https://forum.obsidian.md/t/canvas-file-corruption-if-file-node-has-custom-property-of-type-object-or-list/84698>
- patch saveData 无效的尝试：<https://forum.obsidian.md/t/way-to-extend-whats-saved-into-the-canvas-file/71602>
- AC 与 Semantic Canvas 兼容性（无结论）：<https://forum.obsidian.md/t/is-advanced-canvas-plugin-compatible-with-semantic-canvas-plugin/80311>
