# Canvas Cards — Obsidian 画布卡片插件设计文档

> 版本：v1.4（2026-10-20）
> 状态：**实现完成（v0.3.0）**；M0–M7 全部完成，v1.0 八项验收 + v1.1 三项功能 + v0.3.0 画布空白右键菜单均通过，复审修复见 `docs/VERIFICATION.md` §2.2
> 目标：在 Obsidian Canvas 中提供"只显示标题的卡片，点击后弹窗查看/编辑正文"的组件。

---

## 1. 目标与非目标

### 1.1 核心场景（首要目标 A）

画布信息降噪 / 地图式浏览：节点平时只显示标题，需要时点开看正文细节。

### 1.2 顺带目标

- B 演示/讲解：弹窗内全屏阅读（v1 只做弹窗全屏，不做独立演示流）
- C 闪卡：标题即正面，正文即答案
- D 长文收纳：正文藏于节点数据，不占版面

### 1.3 非目标（v1 不做）

移动端、独立演示模式、普通笔记内复用、Dataview 等动态渲染、嵌套 Canvas、iframe。

> v1.1 起：卡片正文可被"搜索卡片正文"命令检索、卡片可导出为独立笔记、正文首图可作为卡片封面缩略图。全局搜索面板仍不集成正文（Canvas 索引只覆盖标题，见 §5.2）。

---

## 2. 决策记录（三轮 grill 结论）

| # | 决策 | 结论 |
|---|---|---|
| D1 | 首要用途 | A 信息降噪为主，B/C/D 顺带 |
| D2 | 内容形态 | 纯 Markdown + 标准嵌入（图片/笔记/PDF） |
| D3 | 存储位置 | 自包含：正文存进 `.canvas` 节点数据内 |
| D4 | 作用域 | 首版仅 Canvas；核心模块与 Canvas 解耦，便于将来复用 |
| D5 | 打开方式 | 可配置；默认"单击卡片打开"，每张卡右上角提供角落按钮；`trigger: icon` 时仅角落按钮打开 |
| D6 | 弹窗形态 | 居中 Modal（默认）+ 弹窗内全屏阅读 |
| D7 | 分发/平台 | 个人自用，但按可上架标准写；桌面优先，不做移动端；minAppVersion 1.14.4（实际测试过的最低版本），实测基线 1.14.4 |
| D8 | 数据模型 | 标题放原生 `text`，正文放节点自定义字段（优雅降级） |
| D9 | 兼容 | 必须与 Advanced Canvas 7.1.0 共存；不做接管式 patch |
| D10 | 正文编辑 | 弹窗内轻量编辑器（textarea + 预览），自动保存 + 会话级撤销 |
| D11 | 入口 | 命令面板全套 + 节点右键菜单；不做工具栏按钮/空白双击 |
| D12 | 外观 | 极简为默认，设置项可切换"按钮样式"；颜色沿用节点 `color` |
| D13 | 取消卡片 | 正文保留在隐藏字段，不丢数据 |
| D14 | 图片 | v1 支持粘贴图片（写入附件目录并插入 `![[...]]`） |
| D15 | 插件身份 | id=`canvas-cards`，name=`Canvas Cards`，中英双语 UI |
| D16 | 测试部署 | 在 `D:\Obsidian\all-in-one` 新建专用测试画布，Advanced Canvas 保持启用 |
| D17 | internals 口径 | **S1 放宽**：允许最小必要的 Canvas internals（`leaf.view.canvas`、`canvas.nodes`、`node.getData/setData/nodeEl`），在 AGENTS.md 记录例外与约束，保持可维护可卸载 |
| D18 | 渲染方式 | **CSS 类为主 + 唯一 DOM 增强**：给 `nodeEl` 加 `canvas-cards-card` 类 + CSS；每张卡右上角注入一个角落按钮（`.canvas-cards-corner`）；标题保持原生 text 渲染（行内 markdown 天然可用） |
| D19 | 单击语义 | **即时打开弹窗**（无延迟）；双击不再进原生编辑（改名走弹窗标题输入框）；Shift/Ctrl/Meta 点击放行原生 |
| D20 | 点击选中 | 开弹窗同时 `canvas.selectOnly(node)` 补原生选中，保留 Delete/键盘/右键能力 |
| D21 | 保存语义 | 写字段后调 `canvas.requestSave()`（内部防抖，约 2s 落盘）；正文自动保存不按敲键入 Canvas 撤销栈，但关闭弹窗时 push 一个会话级快照，使撤销可整步回退且不会静默丢字 |
| D22 | 正文搜索 | 全局搜索面板不集成（Canvas 索引只索引 `node.text`，改 caches 不影响匹配；patch 搜索类会破坏预览）。v1.1 提供独立"搜索卡片正文"命令 + Modal：扫描 `.canvas` 解析卡片，按标题/正文模糊匹配，选中后定位画布并打开卡片弹窗 |
| D23 | 导出为笔记 | 命令 + 右键菜单，把卡片导出为与画布同目录的唯一命名 `.md`：YAML frontmatter 记录来源画布/节点 id/导出时间，正文写入标题与 Markdown 正文；不移动、不删除原卡片 |
| D24 | 缩略图 | 正文中第一个图片嵌入（`![[img]]` / `![alt](img)`）解析为卡片封面：`nodeEl` 设 `--canvas-cards-thumb`，CSS 深色渐变 + `cover` 铺满，标题白色左下；设置项 `showThumbnails` 可关；非图片嵌入/无法解析时不显示 |
| D25 | 数据/DOM 同步 | 数据是唯一事实源，外观从 `canvasCard` 派生：`CanvasBinding` 用 `MutationObserver` + 30ms 定时器刷新（不用 rAF）；撤销/重做等纯数据变化由按 document 的 `Ctrl/Cmd+Z/Y` 与 `.canvas-wrapper` `pointerup` 捕获兜底；pop-out 每个 document 独立注册监听 |
| D26 | 空白右键菜单加卡 | 画布空白处右键无 workspace 事件（`canvas:selection-menu` 只在已有选区时触发），菜单由 `canvas.showCreationMenu(menu, pos, size)` 构建 → 用 saved-original 方式包裹 `Object.getPrototypeOf(canvas).showCreationMenu`，在原生"创建分组"后追加"添加卡片"项；点击以右键点 `pos` 为左上角创建空卡片（300×96）并打开编辑弹窗；`Map<prototype>` 幂等 guard，`onunload` 仅在仍是自己的 wrapper 时还原（唯一原型 patch 例外，见 AGENTS.md） |

---

## 3. 数据模型

### 3.1 节点字段

卡片 = 普通 `text` 节点 + 一个命名空间字段 `canvasCard`。不引入自定义节点 `type`（Canvas 只认 text/file/link/group，伪造 type 风险高）。

```json
{
  "id": "3f2a9c1d8b7e6f04",
  "type": "text",
  "x": 120, "y": 80, "width": 240, "height": 80,
  "text": "卡片标题",
  "color": "4",
  "canvasCard": {
    "v": 1,
    "card": true,
    "body": "## 正文\n\n- 支持 Markdown\n- 支持 ![[图片.png]] 嵌入\n",
    "updated": 1760000000000
  }
}
```

字段语义：

- `canvasCard.card`：`true` 按卡片渲染（隐藏正文、可点击）；`false` 表示"已取消卡片但保留正文"，节点恢复普通外观，数据不丢。
- `canvasCard.body`：正文 Markdown，源文件里唯一存储位置。
- `canvasCard.updated`：epoch ms，用于排序/调试，不参与渲染。
- `text`：标题。允许行内 Markdown；建议单行。原生渲染，插件不改标题内容。

### 3.2 兼容与降级

| 场景 | 行为 |
|---|---|
| 插件禁用/卸载 | 节点按普通 text 节点显示标题；`canvasCard` 字段仍在 `.canvas` 文件中（是否被 Obsidian 保留见 §5.2 风险） |
| Advanced Canvas 同时启用 | 双方字段互不覆盖；样式、背景、分组功能不受影响 |
| 文件拷到另一个 vault | 标题、正文、嵌入路径随文件走（嵌入指向的附件需一起拷） |
| `text` 被原生编辑器改成多行 | 视为多行标题，插件不干预；弹窗正文不受影响 |

### 3.3 未知字段保留规则（硬性要求）

- 读写一律基于节点 `getData()` 返回的对象做展开式修改，**禁止**手搓 `{id,type,text,x,y,width,height}` 后 `setData`。
- 本插件只新增/修改 `canvasCard`；`styleAttributes`、`toFloating`、`metadata` 等第三方字段原样保留。
- 写入统一走 `writeCardData(node, patch)`：`node.setData({ ...node.getData(), canvasCard: { ...current, ...patch } })` + `canvas.requestSave()`。
- 禁止改动 `type`、`id`；禁止依赖字段顺序（序列化顺序由 Canvas 决定）。

---

## 4. 交互规格

### 4.1 卡片状态与触发

- 卡片渲染：节点内容只显示标题（原生 text），`nodeEl` 加 `canvas-cards-card` 类（D18）；正文永不渲染进画布。
- 单击：`document` 捕获阶段 `click`，命中卡片节点、非编辑态、位移 < 5px、无 Shift/Ctrl/Meta → 即时打开弹窗（D19）；同时 `canvas.selectOnly(node)` 补选中（D20）。
- 双击：不进入原生标题编辑（捕获阶段 `dblclick` 一并 `preventDefault`）；改名统一在弹窗标题输入框完成。
- 拖拽：不拦截，`pointerdown` 记起点，位移 > 5px 视为拖拽，不打开弹窗（M0 实测拖拽不受影响）。
- 编辑态（`.canvas-node.is-editing` / `.cm-editor` 内）不拦截，交给原生编辑器。
- 标题里的链接（`<a>`）不拦截，交给浏览器。
- 角落图标：每张卡的 `nodeEl` 内注入一个 `<button class="canvas-cards-corner interactive-child">`（内嵌 `id-card` 图标，`aria-label="打开卡片"`），`click` 打开弹窗；`interactive-child` 让原生拖拽/双击逻辑跳过它。默认仅 hover/focus 时淡入；设置 `trigger: icon` 时始终显示，并且只有它打开弹窗（卡片本体点击保持 Canvas 原生行为）。`is-editing` 时隐藏。
- 点击空白/别的节点：不处理，保持原生行为。
- 缩略图（D24）：正文首个图片嵌入可解析且 `showThumbnails` 开启时，`nodeEl` 加 `canvas-cards-has-thumb` 并设 CSS 变量 `--canvas-cards-thumb`；CSS 用深色渐变 + `cover` 铺满容器，标题改为白色左下（带 text-shadow）。编辑态、关闭设置或解析失败时移除。正文/图片变更后随绑定自动刷新。

### 4.2 弹窗

- 居中 Modal，最大宽度约 `min(720px, 90vw)`，标题为纯文本标题。
- 工具栏：阅读/编辑切换、全屏、复制正文、关闭。
- 阅读：`MarkdownRenderer.render(app, body, el, canvasFilePath, component)`，`sourcePath` 传 `.canvas` 文件路径，使 `![[笔记]]`/`![[图片]]` 能解析。
- Esc：全屏中先退出全屏，再按一次关闭；点击遮罩关闭。
- 正文为空：显示空状态提示 + "开始编辑"。
- 标题留空：弹窗标题输入框显示占位文案（EN `Card title` / ZH `卡片标题`）；搜索结果中无标题的卡片显示"未命名卡片"（仅 UI 占位，不改数据）。

### 4.3 编辑与保存

- 阅读/编辑同一弹窗切换，编辑区为 textarea（等宽字体、自动高度或固定高度滚动）。
- 自动保存：输入防抖 400ms + 失焦 + 关闭弹窗时写入；顶部显示保存状态。
- 撤销：编辑区使用浏览器原生 textarea 撤销（Ctrl+Z 只回退编辑框文本）。Canvas 撤销基于整画布数据快照，因此正文自动保存虽然不按敲键入栈，关闭弹窗时仍会 `canvas.requestSave(true)` push 一个会话级快照：一次 Ctrl+Z 整步回退本次编辑，且之后撤销更早的移动/新建操作不会把已保存正文丢掉。
- 粘贴图片：监听 `paste`，取剪贴板图片 → `app.fileManager.getAvailablePathForAttachment(name, canvasFilePath)` → `app.vault.createBinary` → 插入 `![[name]]`。
- 正文长度上限不设硬限制，但超过约 200KB 时提示性能影响。

### 4.4 全屏

- 弹窗容器加 `canvas-cards-fullscreen` 类（约 92vw × 92vh），内容区独立滚动；工具栏按钮图标在全屏时切换为 `minimize`。
- 全屏状态不持久化（v1）。

### 4.5 命令与右键菜单

命令（均带 `checkCallback`，仅在 Canvas 视图可用）：

| 命令 id | 行为 |
|---|---|
| `canvas-cards:create-card` | 在视口中心新建卡片（300×96，标题空，正文空，进入编辑；与已有卡片冲突时按 28px 步进避让） |
| `canvas-cards:convert-to-card` | 将选中的 text 节点转为卡片（标题=现有文本，正文空） |
| `canvas-cards:uncard` | 取消卡片（`card=false`，保留正文） |
| `canvas-cards:edit-card-body` | 打开选中卡片的正文弹窗 |
| `canvas-cards:copy-card-body` | 复制选中卡片正文到剪贴板 |
| `canvas-cards:search-cards` | 打开"搜索卡片正文"弹窗，按标题/正文检索所有画布卡片，回车/点击跳转到对应卡片 |
| `canvas-cards:export-card` | 把选中的卡片导出为同目录唯一命名的 `.md` 笔记（frontmatter 记录来源） |

节点右键菜单：追加上述"转为卡片/取消卡片/编辑正文/复制正文/导出为笔记"，与 Advanced Canvas 的菜单项并存。

画布空白处右键菜单（v0.3.0，D26）：原生创建菜单（添加文本/添加笔记/添加媒体文件/添加网页/创建分组）之后追加"添加卡片"项，点击后在右键坐标处以左上角对齐新建空卡片并进入编辑；实现方式与还原约束见 §5.2 末段。

### 4.6 设置

| 设置 | 默认 | 说明 |
|---|---|---|
| trigger | `click` | `click` 或 `icon` |
| appearance | `minimal` | `minimal` 极简卡片 / `button` 填充按钮（`--interactive-normal`） |
| showThumbnails | `true` | 正文首个图片嵌入作为卡片封面 |
| showStatus | `true` | 弹窗内显示保存状态 |

不设默认快捷键（符合社区插件规范）。UI 中英双语，跟随 Obsidian 语言。

### 4.7 搜索卡片正文（D22）

- 入口：命令 `canvas-cards:search-cards`（无画布也可用）。
- 弹窗：输入框 + 状态行（"共 N 张卡片"）+ 结果列表；输入防抖 180ms，按标题与正文不区分大小写包含匹配（`CardIndex.search` 默认上限 100，弹窗调用时传 60 条）。
- 结果行：卡片标题、来源画布名、命中位置附近的正文片段（压平空白、超长省略）。
- 键盘 ↑/↓ 切换、Enter 打开；点击行打开。
- 打开后：定位/切换到所属画布，`selectOnly(node)`，`zoomToSelection()`，再以阅读模式打开卡片弹窗。
- 数据来源：公共 `Vault` API 读取 `.canvas` 并解析 `canvasCard`，按 `path+mtime+size` 缓存；不读取、不修改 Canvas 内部搜索索引（全局搜索面板行为不变）。

### 4.8 导出为笔记（D23）

- 入口：命令 `canvas-cards:export-card`（需选中卡片）+ 卡片右键菜单"导出为笔记"。
- 输出：与 `.canvas` 同目录的 `.md`，文件名取标题（非法字符替换为 `-`、截断 80 字符、空则 `Untitled card`），重名自动追加 ` 2`、` 3`…
- 内容：frontmatter `canvas-cards-source: "[[画布路径]]"`、`canvas-cards-node: <节点 id>`、`exported: <ISO 时间>`；正文为 `# 标题` + 卡片正文。
- 失败时 Notice 提示，不修改画布数据。

---

## 5. 技术架构

### 5.1 模块划分

```
src/
  main.ts                插件入口：设置、绑定生命周期、捕获阶段点击、命令、右键菜单、搜索/导出编排
  settings.ts            设置接口（appearance / trigger / showThumbnails / showStatus）+ 声明式设置页
  i18n.ts                zh/en 文案
  canvas/
    internals.ts         Canvas 内部对象的最小类型与特性检测（allowlist 集中处）
    card.ts              canvasCard 数据模型：读取/校验/写入（setData 展开 getData）
    binding.ts           每个 canvas leaf 的绑定：MutationObserver + 类名/角落按钮/缩略图同步
    card-index.ts        卡片检索：扫描 .canvas、解析 canvasCard、按标题/正文搜索与缓存
    thumbnail.ts         正文首图解析：`![[...]]` / `![](...)` → 资源 URL
    export.ts            卡片 → 独立笔记（frontmatter + 标题 + 正文，同目录唯一命名）
  ui/
    card-modal.ts        弹窗（阅读/编辑/全屏/复制/粘贴图片/会话级撤销快照）
    card-search-modal.ts 搜索卡片正文弹窗（键盘导航、结果片段、跳转定位）
styles.css
```

原则：`store` 与 `ui` 不依赖 Canvas 内部类；Canvas 相关代码集中在 `canvas/`，便于将来换接入方式。

### 5.2 Canvas 接入机制（M0 运行时已验证）

结论：**不需要 patch 序列化，也不需要 patch 节点/渲染相关原型方法**——Canvas 节点保留未知字段；点击用捕获阶段拦截；外观用 CSS 类 + 一个角落按钮。**唯一例外**是画布空白右键菜单：`showCreationMenu` 无法通过事件扩展，采用 saved-original 包裹（见本节末段，D26）。证据见 `docs/research/m0-runtime-notes.md`（CDP 实测）与 `docs/research/canvas-internals-local.md`（源码偏移）。

**数据读写（无需 patch）**

- `node.getData()` 返回 `{...unknownData, id, x, y, width, height}`；`setData(src)` 把几何/`color` 之外的所有键整体塞回 `unknownData` → `canvasCard` 随 `.canvas` 保存，重开/`rebuildView()` 后仍在。
- ⚠️ `setData` 是**全量替换** `unknownData`：写入必须 `node.setData({ ...node.getData(), canvasCard })`，否则丢字段（含 Advanced Canvas 的 `styleAttributes`）。
- 保存：`canvas.requestSave()` 内部 `this.data=this.getData(); this.requestPushHistory(data); this.view.requestSave()`，有防抖（实测约 2s 落盘）。关闭/切换画布前不要假设已落盘。
- `canvasCard` 不进全局搜索（搜索只索引 `type:"text"` 的 `text`），符合 D3 取舍。v1.1 的正文检索由插件自建（D22）：`Canvas index` 的 `process/parseText` 只把 `node.text` 写入 `caches`，全局搜索的 `match` 也直接对 `node.text` 匹配，向 caches 追加 body sections 不影响结果；patch 搜索类又会因结果预览按 `node.text` 切偏移而错位，因此不改内部搜索，改由 `CardIndex` 读 `.canvas` 自己搜。

**不能新增节点类型**

- `Canvas.importData`（@3,320,580）按 `type` 硬编码 `file/text/link/group`，其它 `type` 直接 `continue` 丢弃；无类型注册 API → 卡片只能是 `text` 节点 + 私有字段（D8）。

**渲染：CSS 类 + 角落按钮（唯一 DOM 增强）**

- 持有 `canvasCard.card===true` 的节点，其 `nodeEl` 加 `canvas-cards-card` 类；CSS 让 `.canvas-node-container` 呈现卡片外观、标题居中（见 `styles.css`）。
- 类的补挂：每个 canvas leaf 一个 `CanvasBinding`，`MutationObserver` 观察画布节点层（childList/subtree，rAF 防抖），节点出现/重建后遍历 `canvas.nodes` 幂等补类，并 ensure/remove 角落按钮；无需 patch `render/importData`。
- 角落按钮：`ensureCorner()` 在 `nodeEl` 内创建/复用 `.canvas-cards-corner`（`interactive-child`，避免触发原生拖拽/双击编辑）；非卡片节点或销毁时移除。`trigger: icon` 时 `nodeEl` 加 `canvas-cards-icon-trigger` 类让按钮常显。
- 颜色沿用节点 `color`（D12）：卡片背景只在节点带 `mod-canvas-color-*` 时用 `--canvas-color`，否则 `--background-primary`（`--canvas-color` 默认是灰色哨兵）。

**点击：document 捕获阶段拦截**

- `pointerdown`（捕获）记录起点；`click`（捕获）判断：target 命中 `.canvas-node`、节点有 `canvasCard.card===true`、非编辑态、位移 < 5px、无 Shift/Ctrl/Meta。
- 命中则 `preventDefault + stopPropagation` → 打开弹窗 + `canvas.selectOnly(node)`；未命中不干预（拖拽/框选/双击全保持原生）。
- 反查节点：维护 `WeakMap<HTMLElement, node>` 或遍历 `canvas.nodes` 按 `nodeEl` 比对（节点 DOM 无 `data-id`）。
- `dblclick`（捕获）对卡片 `preventDefault`，阻止原生双击编辑（D19）。

**生命周期与事件**

- `getLeavesOfType("canvas")` → `leaf.view.canvas`；监听 `layout-change`/`active-leaf-change` 重建绑定。
- 右键菜单：`canvas:node-menu (menu, node)` 追加"编辑卡片正文/取消卡片"等项，不替换 Advanced Canvas 的项。
- 没有 `canvas:node-created/node-deleted`（源码确认），新节点/删除通过 MutationObserver 与命令路径处理。
- 视图关闭/插件卸载：断开 observer、移除捕获监听、移除类名与角落按钮（样式是静态 `styles.css`，由 Obsidian 在禁用插件时自动卸载）。

**画布空白右键菜单（唯一原型 patch 例外，D26）**

- 空白处右键菜单由 `Canvas.onContextMenu(e)` 直接 `new Menu` → `canvas.showCreationMenu(menu, pos, size)` 生成，之后才追加撤销/粘贴/快速设置；整条链路**没有** workspace 事件（`canvas:selection-menu` 只在已有选区时触发，空白右键实测 `selEvents=0`）。
- 做法：`ensureCreationMenuPatch(canvas)` 取 `Object.getPrototypeOf(canvas)`，用 `creationMenuPatches: Map<prototype, {original, wrapped}>` 幂等包裹 `showCreationMenu`：`wrapped.call(this, menu, pos, size)` 先执行原方法，再 `decorateCreationMenu(menu, canvas, pos)` 用 `menu.addItem(...setSection('create'))` 追加"添加卡片"；onClick 以 `pos` 为左上角调 `createCardAt({leaf, canvas, view}, pos)`（复用命令路径）。
- 还原：`onunload()` 调 `restoreCreationMenuPatches()`，仅当 `target.showCreationMenu === wrapped` 时替换回 `original`，避免误还原其他插件的 patch；原型方法被外部替换时放弃还原并记日志。
- 这是 AGENTS.md 明确允许的唯一 patch 例外；其余 Canvas 交互仍走"捕获阶段拦截 + CSS 类"。

### 5.3 生命周期与多画布

- Canvas 视图创建：监听 `layout-change` / `active-leaf-change`，配合 `onLayoutReady` 对每个 canvas leaf 建立独立 `CanvasBinding`（DOM 容器、节点反查表、observer、捕获监听）；pop-out 窗口的每个 `ownerDocument` 各注册一套点击监听（`boundDocuments` 去重）。
- 节点 DOM 变动：视图容器上 `MutationObserver`（childList/subtree）+ **30ms 定时器** `scheduleApply()`（不用 rAF：隐藏/后台窗口会暂停 rAF，刷新会静默失效）；节点重建后幂等补类。
- 数据变化不触发 DOM 的情况（撤销/重做、工具栏操作、外部写入）：按 document 捕获 `Ctrl/Cmd+Z/Y` 与 `.canvas-wrapper` 内 `pointerup` → `scheduleCanvasRefresh()`；弹窗保存/设置变更调 `applyAppearance()` 重刷。
- 视图关闭：断开 observer、清除定时器、移除捕获监听、移除类名，释放绑定。
- 插件卸载：移除捕获监听、移除所有 `canvas-cards-card` 类与角落按钮、还原 `showCreationMenu` 原型（唯一 patch 例外，见 §5.2 末段）；静态 `styles.css` 随插件禁用自动卸载。
- 异常隔离：任何绑定失败只影响本插件功能，不得让 Canvas 报错或丢数据（try/catch + 日志 + 功能降级）。

### 5.4 与 Advanced Canvas 共存

- 只新增自己的字段与 CSS 类，不覆盖其字段、不接管节点渲染。
- 右键菜单用"追加"而非"替换"；与其他插件同事件时不 `stopPropagation`。
- 类名带 `canvas-cards-` 前缀，避免样式冲突。
- 若检测到已知冲突（同一节点被对方重写 DOM），降级为角落图标模式，标题仍可见。

### 5.5 失败降级策略

| 失败点 | 降级行为 |
|---|---|
| 拿不到 canvas 实例/节点 | 卡片按普通 text 节点显示（标题可见），数据不丢；命令提示"当前画布不可用" |
| 类名补挂失败 | 卡片退化为普通节点（仍可右键/命令打开正文） |
| `setData`/保存失败 | 编辑器内的文本不丢（仍在 textarea / 内存草稿中），控制台记录错误；关闭弹窗时再尝试写入一次；不做显式重试按钮（v1 取舍） |
| 打开弹窗异常 | 记录错误，不阻塞 Canvas 操作 |

---

## 6. 实现里程碑

| 里程碑 | 内容 | 完成标准 |
|---|---|---|
| **M0 可行性闸门 ✅** | devkit 脚手架；运行时复核（CDP 实测）；`docs/research/m0-runtime-notes.md` | 已通过：字段 round-trip、保存防抖、点击拦截不破坏拖拽、AC 共存、纯 CSS 外观均实测成立 |
| **M1 卡片基础 ✅** | 数据模型、转换/新建/取消、命令与右键菜单、类名注入、降级 | 已通过：建卡/转换/取消、禁用插件标题仍在、字段随 `.canvas` 往返 |
| **M2 阅读弹窗 ✅** | Modal、Markdown 渲染、嵌入、全屏、Esc/遮罩 | 已通过：标题/列表/引用/任务清单/`[[wikilink]]` 正确渲染；全屏 92vw×92vh |
| **M3 编辑闭环 ✅** | textarea 编辑、预览、自动保存、粘贴图片、保存状态 | 已通过：编辑后重启保留；画布撤销不丢正文（会话级快照，D21） |
| **M4 打磨 ✅** | 设置页、中英双语、极简/按钮外观、性能（63 节点） | 已通过：外观切换即时生效；63 节点 `apply()` ≈1.9ms、零干扰 |
| **M5 验收与交付 ✅** | 八项验收清单、与 Advanced Canvas 共存验证、README/使用说明 | 已通过：见 `docs/VERIFICATION.md`；README + 截图就绪 |
| **M6 v1.1 增强 ✅** | 搜索卡片正文、导出为笔记、首图缩略图 | 已通过：搜索"风险与阻塞"命中并跳转；导出笔记 frontmatter 正确；缩略图封面 + `showThumbnails` 开关生效（截图 `docs/assets/*`） |
| **M7 v0.3.0 ✅** | 画布空白右键菜单"添加卡片" | 已通过：菜单在"创建分组"后出现"添加卡片"；点击后以右键坐标新建 300×96 空卡片并进入编辑；禁用插件菜单恢复原生（无该项）、重新启用后重新生效 |

---

## 7. 测试与验收

### 7.1 分层验证

- **L1 静态**：`pnpm run build`（`tsc --noEmit` + esbuild production）与 `pnpm run lint` 通过；检查 `main.js` 为 CJS、`require("obsidian")` 外部化。
- **L2 隔离冒烟**：在临时 vault（独立 `--user-data-dir`）中启用插件，确认加载、命令注册、`onload`/`unload` 不崩。
- **L3 真实 vault**：部署到 `D:\Obsidian\all-in-one`，在新画布 `Canvas Cards 测试.canvas` 上手工验收。
- **L4 人工确认**：UI 行为由用户确认（截图/实际操作）。

### 7.2 验收清单（v1 完成定义）

1. 转换 / 新建 / 取消卡片均可用，命令与右键菜单都能触发
2. 单击开、Esc 或点遮罩关、全屏切换正常
3. 正文编辑自动保存，重启 Obsidian 后内容仍在
4. 禁用插件后卡片仍显示标题，正文保留在 `.canvas` 文件里
5. 与 Advanced Canvas 同时启用不冲突（背景/样式/分组正常，卡片交互正常）
6. `.canvas` 拷贝到另一 vault 仍可用
7. 弹窗内 Ctrl+Z 只影响编辑框；画布撤销整步回退一次编辑会话，不会静默丢正文
8. 63 节点 / 47 边量级画布操作流畅

v1.1 新增（已实测）：

9. "搜索卡片正文"能用正文里的词命中卡片，并跳转到所属画布打开该卡片
10. "导出为笔记"生成同目录笔记，frontmatter 记录来源画布与节点 id，正文完整
11. 正文含图片嵌入的卡片显示封面缩略图；`showThumbnails` 关闭后恢复纯标题卡片

v0.3.0 新增（已实测）：

12. 画布空白处右键 → 菜单含"添加卡片"；点击后在该坐标新建空卡片并打开编辑弹窗；禁用/启用插件后菜单项正确还原/重新生效

### 7.3 纯函数单测

没有单元测试框架；数据模型、字段合并、Markdown/嵌入路径与 DOM 行为通过 L3 真实 vault 的手工验收（含 CDP 脚本）覆盖。v1 不搭 WebdriverIO e2e（成本高、收益低）。

---

## 8. 风险清单

| 风险 | 影响 | 对策 |
|---|---|---|
| 无公开 Canvas API，版本升级破坏 patch | 高 | 最小 patch 面；特性检测；失败降级；升级时先跑 M0 复核 |
| 未知字段在原生保存中被丢弃 | 低（源码已证保留） | `unknownData` 往返保留；M1 加 round-trip 回归测试 |
| 与 Advanced Canvas 冲突 | 中 | 只加字段/类名；追加菜单；冲突时降级 |
| 正文不可被全局搜索/双链 | 中 | 全局搜索面板已知不集成正文（Canvas 索引只覆盖标题）；v1.1 提供"搜索卡片正文"命令 + "导出为笔记"弥补（D22/D23） |
| 缩略图与节点色/编辑态互相覆盖 | 低 | 封面样式仅作用于 `canvas-cards-has-thumb`；编辑态还原；可整体关闭 |
| 弹窗编辑体验弱于原生编辑器 | 中 | v1 textarea；后续评估嵌入式编辑器 |
| 取消卡片/转换不可撤销 | 中 | 反向命令 + 正文保留（D13） |
| 点击拦截影响拖拽/框选 | 高 | 位移阈值；事件委托；M0 实测 |
| 大画布性能 | 低 | 委托 + MutationObserver 防抖；不逐节点监听 |

---

## 9. 问题状态

已全部解决（证据见 §5.2、`docs/research/canvas-internals-local.md`、`docs/research/m0-runtime-notes.md`）：

1. ✅ 内部类/DOM/事件：`.canvas-node` 无 data-id，靠 `node.nodeEl` 建反查；菜单事件为 `canvas:node-menu` / `canvas:selection-menu`。
2. ✅ 未知字段保留：`unknownData` 全量往返；`setData({...getData(), canvasCard})` 实测可保存、重建后仍在。
3. ✅ 文本节点渲染：Canvas 用内嵌 markdown 视图（`save()` → `node.text`），不是 `MarkdownRenderer`；弹窗内用 `MarkdownRenderer` 自成一路。
4. ✅ 选中节点：可调 `canvas.selectOnly(node)` 补选中；DOM 有 `.canvas-node.is-selected`。
5. ✅ 保存语义：`canvas.requestSave()` → `this.data=this.getData()` → `view.requestSave()`，防抖落盘（实测约 2s）；`setData` 第二参不是保存开关。
6. ✅ `createTextNode` 签名：`{pos, size?, position?, text?, save?, focus?}`；默认尺寸 `canvas.config.defaultTextNodeDimensions`；`focus:false` 不进入编辑。
7. ✅ 点击拦截：document 捕获阶段可行，拖拽/框选/双击均不被破坏（5px 位移守卫）。
8. ✅ 外观：CSS 类方案可行；唯一 DOM 注入是角落按钮；节点 color 通过 `[class*='mod-canvas-color']` 保留（默认 `--canvas-color` 是灰色哨兵，不能直接当 fallback）。
9. ✅ 空白右键菜单：`canvas:selection-menu` 在空白右键不触发；菜单由 `canvas.showCreationMenu(menu, pos, size)` 构建；saved-original 包裹 + `Map` 幂等 guard + `onunload` 条件还原均实测通过（禁用后菜单恢复原生，重新启用后重新出现"添加卡片"）。

剩余为**实现期验证**（已在 v0.1.0 全部完成，证据见 `docs/VERIFICATION.md`）：
- ✅ 弹窗全屏（92vw×92vh）与 Esc 两段式（先退全屏、再关闭）
- ✅ 缩放/重建后类保持（`leaf.rebuildView()` 后 class 与数据重新应用）
- ✅ 应用重启往返（插件自启、卡片数据与外观保留）
- ✅ 63 节点性能（`apply()` ≈1.9ms，无卡片时零干扰）
- ✅ Advanced Canvas 菜单并存
- ✅ v1.1：正文搜索（CDP 实测 `风险与阻塞` 命中并跳转）、导出笔记（frontmatter/正文正确）、缩略图（封面类与样式生效、设置可关）
