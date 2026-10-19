# Obsidian Canvas 内部实现勘察（本机 1.14.4，app.js 定点检索）

> 目标：为插件设计提供"事实"而非猜测。所有偏移都是 **app.js 绝对字节偏移**（文件 3,942,126 B）。
> 方法：零依赖 Node 脚本 + latin1 视图正则（`match.index` 即字节偏移）+ 局部窗口截取，未把 app.js 读入上下文。
> 产物：`.tmp-research/probe/app.js`、`.tmp-research/probe/canvas-region.js`（app.js[3,275,000, 3,445,000)）、`out/*.json`。

## 0. 结论速览

| 问题 | 结论 | 置信度 |
|---|---|---|
| 文本节点是否走 MarkdownRenderer | 否（不是 `MarkdownRenderer.render` 调用）；每个文本节点是一个内嵌 markdown 视图/编辑器实例（`markdown-embed`） | 已验证 |
| 是否有 `canvas:node-created` / `canvas:node-deleted` | **没有**（全文件 0 命中） | 已验证 |
| 是否有 `canvas:canvas-menu` | **没有** | 已验证 |
| 节点菜单/选择菜单事件 | `canvas:node-menu (menu, node)`、`canvas:selection-menu (menu, canvas)` 存在 | 已验证 |
| nodes 中未知自定义字段是否保留 | **保留**：`unknownData` 收集其余键并在 `getData()` 展开 | 已验证 |
| 未知节点 *type* 是否保留 | **不保留**：`importData` 硬编码 4 类，其余 `continue` 丢弃 | 已验证 |
| 是否有自定义节点类型注册机制 | **没有**（仅 `registerViewType("canvas")`，视图级） | 高 |
| 搜索是否覆盖 canvas | **覆盖**，按文本节点逐节点索引，结果 key 为 `"canvas-"+nodeId` | 已验证 |
| 节点 DOM 是否带 data-id / dataset.nodeId | **否**；节点根元素无 id 属性，反查只能靠 JS 对象引用 | 已验证 |
| 官方 API 是否导出 Canvas / CanvasNode 类 | 否；Advanced Canvas 全部靠 monkey-patch + 实例字段 | 高 |

## 1. 提取与校验（任务 1）

- asar：`C:\Users\ink14\AppData\Local\Programs\Obsidian\resources\obsidian.asar`（27,477,966 B）。
- 头部布局（实测，与常见博客写法不同）：`[0..4)=4`、`[4..8)=headerSize`、`[8..12)=payloadSize`、`[12..16)=jsonLen`，**JSON 从偏移 16 开始**；`dataOffset = 8 + headerSize`。
  - headerSize=95,916；payloadSize=95,912；jsonLength=95,908；dataOffset=95,924。
  - `app.js` 条目：offset=764,147（相对 dataOffset），size=3,942,126。
- 提取结果：`outBytes=3,942,126`、`sizeMatchesExpected=true`、`sha256MatchesHeader=true`，
  sha256=`958ce57fe22f87fdf121546e46dfccd9c8ee971ce3fd8f801d60d4ece39a2df9`（与 header `integrity.hash` 一致）。
- 脚本：`.tmp-research/probe/extract-appjs.mjs`（解析 + 单条目提取 + 校验）、`re.mjs`（字节偏移正则）、`windows.mjs`（多窗口截取）、`pretty.mjs`（按宽度拆行+偏移前缀）、`filter.mjs`。
- 注意：下面出现的 `ste`/`Dee`/`Ree`/`ete` 等是压缩后的构建名，**只保证本版本**；插件不要按名字绑定，按结构/行为做特征检测。

## 2. CSS 类名（任务 2a）

`canvas-node[-a-z]*`：17 次，偏移 3,288,292 .. 3,402,147，12 个变体：

| 类名 | 次数 | 用途 |
|---|---|---|
| `canvas-node` | 1 | 节点根元素（`createDiv("canvas-node")`） |
| `canvas-node-container` | 1 | 根内第一层容器（`canvas-node-container`） |
| `canvas-node-content` | 2 | 内容区 |
| `canvas-node-content-blocker` | 1 | 覆盖层（未编辑时拦截事件） |
| `canvas-node-label` | 2 | 文件/链接节点标签 |
| `canvas-node-group` | 1 | 组节点附加类 |
| `canvas-node-resizer` | 4 | 缩放手柄：4 边 `data-resize="top|right|bottom|left"` + 4 角 `"topright|bottomright|bottomleft|topleft"`（角名无连字符），共 8 个 |
| `canvas-node-connection-point` | 1 | 连接点，带 `data-side="top/bottom/left/right"` |
| `canvas-node-interaction-layer` | 1 | 交互层 |
| `canvas-node-placeholder` | 1 | 未初始化占位 |
| `canvas-node-width` / `canvas-node-height` | 各 1 | 尺寸标签 |

更宽的 `canvas-[a-z]+[-a-z]*`：78 次，3,279,877 .. 3,433,768。另有：`canvas-control-item`(8)、`canvas-color`(5)、`canvas-control-group`(4)、`canvas-card-menu-button`(3)、`canvas-edges`(2)、`canvas-menu`(2)、`canvas-selection`、`canvas-minimap`、`canvas-mover`、`canvas-group-label`、`canvas-background`、`canvas-embed`、`canvas-empty-embed-container`、`canvas-link`（webview/iframe 链接节点）。

状态类（canvas 区段 22 次）：`is-dragging`(10，节点与 wrapper 都用)、`is-focused`(7)、`is-editing`(3)、`is-selected`(2)。节点类切换的入口：`select()`→`addClass("is-selected")`、`focus()`→`addClass("is-focused")`、`setIsEditing()`→`toggleClass("is-editing")`。

**颜色类**（3,287,6xx）：节点/边根元素上 `mod-canvas-color-<n>`（n∈1..6），自定义颜色用 `mod-canvas-color-custom` + 内联 `--canvas-color`，主题色用 `is-themed`；更新时会先移除所有 `mod-canvas-color*` 再重设。即"颜色"不是 `style.backgroundColor`，而是类 + CSS 变量。

**解读**：样式打补丁可依赖这些类，但 `canvas-node` 是公共前缀，注意别用 `[class^=canvas-node]` 误伤 resizer/label。

## 3. 事件字符串（任务 2b）

全文件 `canvas:[a-z-]+` 仅 **10 次 / 8 个唯一值**：

| 事件 | 次数 | 偏移 | 调用形态 |
|---|---|---|---|
| `canvas:new-file` | 2 | 1,439,037；3,423,908 | 命令 id（空状态提示 + `registerGlobalCommand`） |
| `canvas:selection-menu` | 2 | 3,351,220；3,351,440 | `trigger("canvas:selection-menu", n, this)` → **(menu, canvas)**；另作为 `files-menu` 的 source 字符串 |
| `canvas:node-menu` | 1 | 3,374,918 | `trigger("canvas:node-menu", e, this)`（node.showMenu 内）→ **(menu, node)** |
| `canvas:node-connection-drop-menu` | 1 | 3,379,325 | `trigger(... , c, n, l)`，随后 `c.showAtMouseEvent(e)` |
| `canvas:edge-menu` | 1 | 3,412,564 | `this.canvas.app.workspace.trigger("canvas:edge-menu", e, this)`（edge.showMenu）→ **(menu, edge)** |
| `canvas:convert-to-file` | 1 | 3,424,903 | 命令 id |
| `canvas:export-as-image` | 1 | 3,424,419 | 命令 id |
| `canvas:jump-to-group` | 1 | 3,424,641 | 命令 id |

未命中（全文件 0 次）：`canvas:node-created`、`canvas:node-deleted`、`canvas:canvas-menu`、`canvas:node-moved`、`canvas:selection-changed` 等。

**解读**：
- 菜单事件是**同步向 Menu 里 addItem** 的扩展点，签名如上；`files-menu` 的 source 也复用了 `canvas:selection-menu`（3,351,440），监听 `files-menu` 时可用第 4 个参数识别来源。
- 没有节点生命周期事件 → 需要 `createTextNode/createFileNode/createGroupNode/createLinkNode/addNode` 之类的 monkey-patch（Advanced Canvas 正是这么做的，见 §9）。
- 命令 id 集中在 3,423,9xx–3,424,9xx 的 `registerGlobalCommand` 区块，checkCallback 均先 `workspace.getActiveViewOfType(ste)`。

## 4. 文本节点与 Markdown 渲染（任务 2c）

- `MarkdownRenderer` 全文件 **1 次**，偏移 253,826，仅在导出表：`MarkdownRenderer:()=>$j`（同处 `MarkdownRenderChild:()=>xj`）。
- `.renderMarkdown(` **0 次**；canvas 区段内 `$j.`、`renderMarkdown`、`markdown-rendered`/`markdown-preview`/`internal-embed` 均 0 命中。
- 实际机制（3,392,720 文本节点 `Ree`）：
  - `getData` 追加 `{type:"text", text:this.text}`；`setText(e)` 同步到 `this.child`。
  - `render()` 中 `this.child || (this.child = new Bee(this), this.child.set(this.text), this.child.load())`。
  - `Bee`（3,394,700）构造：`e.call(this, t.app, t.contentEl, null)`，置 `editable=!0, useIframe=!0`，`containerEl.addClass("markdown-embed")`；`save()` 里把文本写回 `node.text` 并 `canvas.requestSave()`；`linktext = view.file.path + "#^" + node.id`，折叠状态走 `app.foldManager`。
  - `Bee extends E0`，`E0` 在 2,628,800，是 markdown 视图基类（含 `previewMode`/`editMode`，`L8`=MarkdownView 也继承它）；紧邻 2,628,6xx 还有 `class ... extends ($j)`（MarkdownRenderer 的滚动/搜索包装）。
- **结论**：canvas 文本节点 = 每个节点一个内嵌 markdown 视图（编辑器 + 预览），不是一次性 `MarkdownRenderer.render`。因此插件可拿 `node.child`（视图实例）、`node.child.editMode.cm.dom`（CodeMirror）、`node.child.previewMode.renderer.previewEl`；但**不要**假设存在统一的 render 钩子。

## 5. 序列化与未知字段（任务 2d）

- `Canvas.getData()`（3,319,273）：遍历排序后的 nodes/edges 收集 `getData()`，返回
  `g(g({}, this.data), {nodes:e, edges:t})` → **顶层未知字段保留**（`this.data` 是上次载入的原始对象）。
- `Canvas.importData(e, t)`（3,320,580）：
  - 同 id 复用已有节点对象；否则按 `e.type` 分派：`"file"→Oee`、`"text"→Ree`、`"link"→Nee`、`"group"→Hee`，**其它类型 `continue`（静默丢弃）**；随后 `p.setData(u)`；`t` 为真时移除 data 中不存在的节点；边用 `Xee`，缺失 side 用 `qee` 推断；返回新/复用节点数组。
  - 没有插件钩子、没有 type 注册表 → **未知节点类型无法存活**（会被下一次保存抹掉）。
- 节点基类 `Dee`（3,369,603）：
  - 构造 `this.unknownData={}`、`this.nodeEl=createDiv("canvas-node")`。
  - `getData()`：`var s=e.unknownData, l=g(g({},s),{id,x,y,width,height}); return a&&(l.color=a), l` → **custom 字段先展开，再被 id/几何覆盖；color 只在非空时写**。
  - `setData(t)`：`s=m(e,["x","y","width","height","color"])`，几何 `Math.round`、color 经 `W9()` 归一化，最后 `this.unknownData=s` → **其余所有键原样保存**。
- 各类型追加字段：text→`type,text`；file→`type,file,subpath`；link→`type,url`；group→`type`(+label/background/backgroundStyle)；edge→`id,fromNode,fromSide,toNode,toSide`(+fromEnd/toEnd/color/label)。
- **解读**：想给节点挂私有数据，直接 `node.setData({...node.getData(), myField: ...})` 即可随 `.canvas` 落盘；但**不要**试图新增 `type`。注意 `setData` 会用 unknownData 全量替换，忘写 `...getData()` 会丢字段。

## 6. 插件注册与视图类型（任务 2e）

- 无字面 `id:"canvas"` / `name:"Canvas"`（0 命中）。内置插件类在 3,422,422：
  `this.id="canvas", this.name=nte.name(), this.description=nte.desc(), this.defaultOn=!0, this.options={}, this.renames=[]` → id 运行时构造，name 走 i18n（`db.plugins.canvas`）。
- 3,418,042：`ete="canvas", tte="canvas", nte=db.plugins.canvas`；`ite` 是文件处理器（`canProcess(e){return e.extension===tte}`，`process()` 里 JSON.parse 后收集引用）。
- 视图注册：`t.registerViewType(ete, function(e){return new ste(e,n)})`（3,423,9xx 区），`ste` 即 CanvasView（3,428,636）。
  - `getViewType(){return ete}`；`getViewData(){return Yb(this.canvas.data)}`；`setViewData(json, clear)` 解析后 `canvas.setData(...)` 或 `createPlaceholder()`，并按 localData 设 readonly。
  - `setEphemeralState(t)`（3,430,833）支持搜索跳转：`{match:{nodeId, content, matches}}` → `canvas.nodes.get(nodeId)` → `selectOnly` + `panIntoView(getBBox())`，若 text 节点且 `child instanceof Bee` 且有 matches 则高亮。
- **解读**：官方没有节点类型注册 API；扩展只能（a）向已有节点挂字段，（b）patch 视图/节点方法，（c）监听 3 个菜单事件 + 3 个命令。

## 7. 搜索索引（任务 2f）

- `SearchQuery.match(file, content)`（1,475,392）：canvas 分支 `JSON.parse` 后只取 `type==="text"` 节点，逐节点用 `YI`（1,456,305，带 `cache` 的文本匹配器）匹配，结果 key `"canvas-"+nodeId`，并附带 filename 匹配。
- 结果预览（1,980,940）：canvas 时把 text 节点按 `(y,x)` 排序，`plugin.index.get(file)` 取 `caches[nodeId]`，逐节点渲染，并把 `match.nodeId` 写进结果（供 `setEphemeralState` 定位）。
- 搜索引擎（3,080,046 / 3,080,116）：扩展名 `"canvas"` → `internalPlugins.getEnabledPluginById("canvas")`，`index.get(file)`；无缓存则移除结果；再遍历 `caches` 逐节点索引。
- `isSupportedFile`（3,713,819）把 `"canvas"` 视为可搜索；1,477,502 处对 canvas 做 `cachedRead` 取内容。
- 全文件 `nodeId` 仅 6 次：搜索 2 处 + `setEphemeralState` + 4 处无关调试代码。
- **解读**：canvas 的文本内容**已进全局搜索**，且可精确定位到节点；插件自建搜索若要复用，走 `internalPlugins.getEnabledPluginById("canvas").index` 是可行的（非公开 API，需容错）。

## 8. 节点 DOM 数据属性（任务 2g）

- `data-id` 全文件 **0 次**；`canvas` 区段内 `dataset.` **0 次**（全文件只有编辑器代码 2,669,624 / 2,669,640 的 `dataset.idx`）。
- 节点根元素 `canvas-node` 不带 id；但子元素带 data-*：
  - `createDiv({cls:"canvas-node-resizer", attr:{"data-resize": side}})`（3,288,313 / 3,292,677 / 3,437,xxx 区，8 向）
  - `createDiv({cls:"canvas-node-connection-point", attr:{"data-side": side}})`（≈3,293,160）
- **解读**：DOM 上无法从元素反查节点 id。要 `nodeEl → node`，只能遍历 `canvas.nodes.values()` 比对 `node.nodeEl`（Advanced Canvas 在导出/命中测试时就这么做，见 §9）。

## 9. Advanced Canvas 7.1.0 的 patch/inject 点

文件：`D:\Obsidian\all-in-one\.obsidian\plugins\advanced-canvas\main.js`（387,098 B；manifest minAppVersion 1.13.0）。

- 打包 `monkey-around`（`function around(obj, factories)`，111,515 起，共 5 处相关）；自写 `Patcher`：
  - `OverrideExisting`、`waitForMapValueLookup(map, viewType, patch)`（116,194，`around(map, {[viewType]: next => function(...){ const view = invoke(next,this,...); patch(view); ... }})`）；
  - `Patcher.waitForViewRequest(app, "canvas", cb)`；目标方法不存在时抛 `Method ${key} does not exist on target`（117,602）。
- 发现已开视图：`app.workspace.getLeavesOfType("canvas")`（118,946）→ `patchCanvas(leaf.view)` → 逐个 `leaf.rebuildView()`（119,286）；没有则等视图请求。这是**插件初始化时拿到 CanvasView** 的标准做法。
- 关键 patch：
  - `createTextNode / createFileNode / createFileNodes / createGroupNode / createLinkNode`：调用后 `workspace.trigger("advanced-canvas:node-created", this, node)`（124,902 起）——用来弥补核心没有 `canvas:node-created`。
  - `Canvas.addNode`：`that.patchNode(node)` 后再走原逻辑。
  - `undo`/`redo`：完成后 `this.importData(this.getData(), true)` + `advanced-canvas:redo`（129,552）。
  - `node.setZIndex`：改写为 `this.setData({...this.getData(), zIndex:value}, true); this.updateZIndex()`（133,965）——私有字段随 unknownData 落盘。
  - `CanvasView.setViewData`：try/catch 包裹，JSON 解析失败时 `createFileSnapshot` + 日志 `Invalid JSON, repairing through Advanced Canvas:`（121,497）。
- 事件签名与核心一致：`workspace.on("canvas:node-menu", (menu, node) => ...)`、`workspace.on("canvas:selection-menu", (menu, canvas) => ...)`；自定义 `advanced-canvas:node-created`、`advanced-canvas:node-resized`、`advanced-canvas:popup-menu*`。
- 依赖的内部字段/方法：`canvas.nodes`（Map，`for (const [nodeId, node] of canvas.nodes)` 373,967）、`node.getData()/setData()`、`node.nodeEl`、`node.child.editMode.cm.dom`、`node.nodeEl.querySelector(".markdown-preview-view.markdown-rendered")`（229,320）、`canvas.wrapperEl.dataset.*`、`canvas.metadata["startNode"]`、`canvas.tx/ty/tZ`、`canvas.markMoved/markDirty`、`canvas.searchEl`（自建 `CanvasSearchView`，161,304）。
- 它自己也写 data-*：`node.nodeEl.dataset.isStartNode="true"`、`canvas.wrapperEl.dataset.isDragging`、`dataset.focusModeEnabled`（373,967 / 375,325 / 264,682）。
- 自存字段样例（9,777）：`node.setData({...node.getData(), id:"debug-bbox", color:"1", styleAttributes:{border:"invisible"}})` → 实证 unknownData 往返。
- 26 处 `Canvas`/`CanvasView` 命中中**没有** `import {Canvas}` 之类的官方类引用（全是设置文案/自有类名）→ 官方 API 不导出 Canvas 类。

## 10. 对插件设计的直接含义

1. **拿到视图**：`getLeavesOfType("canvas")[0].view`；早期加载用轮询/`workspace.on("layout-change")`，或像 Advanced Canvas 那样 `around(app.viewRegistry..., ...)` 等视图创建。
2. **节点扩展数据**：`node.setData({...node.getData(), nsField: ...})`，随文件保存；读取时 `node.getData().nsField`。不要依赖 `node.field` 直接赋值（不会落盘）。
3. **新节点类型不可行**：importData 会丢弃未知 type；替代方案是复用 text 节点 + 私有字段 + 自定义渲染注入。
4. **生命周期**：无 created/deleted 事件，需 patch `create*Node` / `removeNode` / `importData`（注意 undo/redo 也会走 importData）。
5. **菜单**：`canvas:node-menu`/`canvas:selection-menu`/`canvas:edge-menu` 是稳定扩展点，签名为 `(menu, target)`；`files-menu` 的 source 参数可区分来源。
6. **搜索**：若要做"跳到节点"，复用 `setEphemeralState({match:{nodeId,...}})` 的路径最省事；自建索引可参考 `.index.caches`。
7. **DOM**：节点元素无 data-id，`node.nodeEl` 是唯一可靠锚点；改样式优先加类，别改 `canvas-node` 本身的结构假设。

## 11. 复现命令（PowerShell，工作区 D:\Projects\ob-canvas）

```powershell
node .tmp-research/probe/extract-appjs.mjs "C:\Users\ink14\AppData\Local\Programs\Obsidian\resources\obsidian.asar" app.js .tmp-research/probe/app.js 3942126
node .tmp-research/probe/re.mjs .tmp-research/probe/app.js 'canvas:[a-z-]+' --ctx=180 --max=20 --offsets
node .tmp-research/probe/re.mjs .tmp-research/probe/app.js 'data-id|dataset\.nodeId|node-id' --ctx=120 --uniq
node .tmp-research/probe/windows.mjs .tmp-research/probe/app.js 3412564:80:260
```

## 12. 未验证 / 风险

- `canvas:edge-menu` 已从窗口确认为 `trigger("canvas:edge-menu", e, this)`，但未验证是否有第三个参数。
- 压缩名（`ste`/`Dee`/`Ree`/`Bee`/`E0`/`ete`）仅对本构建成立；升级后必须重新定位。
- `canvas` 区段之外（如 1.44M 空状态、3.73M 文件过滤）还有 canvas 相关逻辑未逐条读；对插件设计影响较小。
- 未在运行时验证（未启动 Obsidian）：以上为静态代码事实，动态行为（尤其 undo/redo 与 importData 的交互）需插件实测。
