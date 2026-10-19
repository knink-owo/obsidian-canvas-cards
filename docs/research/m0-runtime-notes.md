# M0 运行时可行性实验记录

- 环境：Obsidian 1.14.4（Chromium 150 / Electron 43），vault `D:\Obsidian\all-in-one`，Advanced Canvas 7.1.0 启用。
- 方法：`Obsidian.exe --remote-debugging-port=9222 D:\Obsidian\all-in-one` 启动真实应用，用 CDP `Runtime.evaluate` 在 renderer 里执行实验；鼠标/键盘/截图用 `.tmp-research/cdp/scenario.mjs` 的 plan 脚本（`node scenario.mjs plan.json`）驱动。
- 测试画布：`D:\Obsidian\all-in-one\Canvas Cards 测试.canvas`（实验结束保留，供回归用）。
- 坐标注意：窗口 dpr≈1.425，画布 wrapper 有独立 transform（`c.zoom`/`c.tx` 与实际 DOM transform 可能不一致）。**点击坐标一律取 `nodeEl.getBoundingClientRect()` 真值**，动作前重新取一次；先 `canvas.zoomToFit()` 并等动画结束。

## 1. 创建节点（createTextNode）

源码 @3,325,506：

```js
e.prototype.createTextNode=function(e){
  var t=e.pos,n=e.size,i=e.position,r=e.text,o=e.save,a=e.focus,
      s=new Ree(this);
  n||(n=this.config.defaultTextNodeDimensions);
  s.moveAndResize(S9(t,n,i)); r&&s.setText(r);
  this.addNode(s);
  !1!==o&&this.requestSave();
  !1!==a&&(s.attach(),s.render(),this.selectOnly(s),s.startEditing());
  return s}
```

- 参数：`{pos:{x,y}, size?={width,height}, position?: "center"|…, text?, save?, focus?}`。
- 新节点默认 `isEditing=true`、`nodeEl.classList` 含 `is-editing`；`focus:false` 可避免直接进入编辑。
- 节点原型方法可见：`getData/setData/setText/initialize/render/showMenu/convertToFile`（`startEditing` 等为实例方法）。

## 2. 自定义字段持久化（核心结论：可行）

- `node.getData()` = `{...unknownData, id, x, y, width, height}`；`setData(src)` 会把几何/color 之外的键**全量替换**进 `unknownData`。
- 因此写入必须整体展开：`node.setData({...node.getData(), canvasCard: {...}})`。
- 写入后立即在 `node.getData()` / `node.unknownData` / `canvas.getData()` / `leaf.view.getViewData()` 中都出现，序列化顺序为 `id,type,text,styleAttributes,canvasCard,x,y,width,height`。
- 落盘样例（磁盘读回）：

```json
{"id":"733d0e2cfb1550c3","type":"text","text":"Hello card","styleAttributes":{},
 "canvasCard":{"v":1,"title":"T","body":"Body **md**"},
 "x":0,"y":0,"width":300,"height":100}
```

## 3. 保存链路（有防抖，必须等落盘）

- `canvas.requestSave`（@3,317,223）：

```js
e.prototype.requestSave=function(e){void 0===e&&(e=!0),
  this.data=this.getData(),
  e&&this.requestPushHistory(this.data),
  this.view.requestSave()}
```

- 实测：`setData` + `canvas.requestSave()` 后等 1.5s，磁盘仍是旧内容；再补 `leaf.view.requestSave()` + `view.save()` + `canvas.requestSave()` 再等 2.5s，磁盘内容完整（含 `canvasCard`、`styleAttributes`、`metadata:{"version":"1.0-1.0","frontmatter":{}}`）。
- `leaf.view` 具备 `requestSave/save/lastSavedData/saveAgain`。结论：**写完后调 `canvas.requestSave()`，不要假设立即落盘**；关闭/切换前若有未保存风险，可等 1–2s 或重复触发一次。
- 撤销历史：`requestSave(true)` 会 `requestPushHistory`，即自定义字段整体进入 canvas 撤销栈。正文自动保存使用 `requestSave(false)`（不入栈），并在**编辑会话结束时**统一 `requestSave(true)` 一次（会话级快照）；否则撤销更早的画布操作会恢复到正文修改前的旧快照，导致正文被静默回滚——详见 §12。

## 4. 重建往返（重要）

- `leaf.rebuildView()` 后重新取 `leaf.view.canvas`，节点 `getData()`/`unknownData` 中 `canvasCard` 仍在，节点数不变 → 视图重建（切文件/重开）不会丢字段。
- 重建后新节点 DOM 会重建，`nodeEl` 引用会变；任何挂 DOM 的增强都要能重挂（幂等）。

## 5. 节点 DOM 结构（1.14.4）

- `.canvas-node`（根，`nodeEl`）> `.canvas-node-container` > `.canvas-node-content` > 原生 markdown 视图（`.markdown-preview-view/.markdown-preview-sizer/.markdown-preview-section/.markdown-preview-pusher`）。
- 未聚焦时 `.canvas-node-content-blocker` 覆盖并吃掉首次点击；聚焦后 blocker `display:none`。
- 状态类：`is-focused`、`is-editing`、`is-selected`、`is-dragging`；编辑时 class 变为 `canvas-node is-focused is-editing`，聚焦元素为 `embed-iframe`。
- 原生编辑体验：单击 blocker 先选中并聚焦；再次单击进入编辑；双击进入编辑。编辑态由 `.is-editing` 标记。

## 6. 点击拦截：捕获阶段可行，拖拽不受影响

在 `document` 捕获阶段监听 `pointerdown`（记起点）/`click`/`dblclick`，用 `e.target.closest('.canvas-node')` 判定，位移 >5px 视为拖拽放弃：

| 操作 | 结果 |
|---|---|
| 单击 blocker | 我们的 handler 触发 1 次；`isEditing=false`；节点不被选中（`preventDefault+stopPropagation` 抑制了选中） |
| 再单击 | handler 再触发 |
| 双击 | 我们的 dblclick handler 触发；两次 click 也都触发；原生双击编辑被阻止（`isEditing=false`） |
| 从卡片中心拖到别处 | 节点正常移动（20,140→220,200），handler 不触发；拖后 `is-focused`，click 落在 canvas-wrapper |

- 结论：**拦截点击不会破坏原生拖拽**；拖拽结束的 click 事件 target 不是节点，再配合位移守卫可避免误开弹窗。
- 注意：拦截后节点不产生原生选中态。若产品需要"选中卡片后可用键盘操作/右键"，需另给选中入口（见 §9 待定项）。

## 7. 卡片外观：不注入 DOM，纯 CSS 类即可

给 `nodeEl` 加 `canvas-card` 类 + 注入 CSS（原型样式）：

```css
.canvas-node.canvas-card .canvas-node-container{
  background:var(--background-primary);
  border:1px solid var(--background-modifier-border);
  border-radius:10px; box-shadow:0 1px 3px rgba(0,0,0,.06);}
.canvas-node.canvas-card .canvas-node-content{padding:0}
.canvas-node.canvas-card .markdown-preview-view{padding:0 12px}
.canvas-node.canvas-card .markdown-preview-sizer{padding:0!important;min-height:0!important}
.canvas-node.canvas-card .markdown-preview-section{
  display:flex;align-items:center;justify-content:center;height:100%;
  text-align:center;font-weight:600;font-size:15px;line-height:1.3}
.canvas-node.canvas-card .markdown-preview-pusher{display:none}
```

- 280×80 卡片截图 `.tmp-research/shots/card-style-1.png`：干净的圆角卡片、标题居中加粗，标题仍是原生 text 渲染（行内 markdown/链接天然可用）。
- 已知问题（已修复）：直接 `var(--canvas-color, var(--background-primary))` 会因 `--canvas-color` 默认值 `#c0c0c0` 永远不落 fallback，卡片呈灰色。最终实现：基础样式用 `var(--background-primary)`，仅在节点带 `[class*='mod-canvas-color']` 时覆盖 `background: var(--canvas-color)`，从而默认白底、显式设色时保留节点色（D12）。
- 隐藏正文：卡片模式只显示标题，正文在 `canvasCard.body`，不在 text 中，天然不渲染。

## 8. Advanced Canvas 共存

- `canvas.createTextNode/addNode/requestSave` 的 `toString()` 是 monkey-around 生成的 wrapper（`function wrapper(...args){ if (current===original && obj[method]===wrapper) remove(); return current.apply(this,args) }`）→ AC 7.1.0 已在这些方法上挂 patch。
- 因此我们若需 patch，必须用 `monkey-around`（可 npm 引入，Obsidian 插件常用）或"先存原函数再包裹"，保证 AC/我们/别的插件可叠加且能卸载。
- M0 的点击/拖拽/CSS 方案**不 patch 任何原型方法**，与 AC 天然无冲突（实测 AC 启用下全部通过）。

## 9. 对实现的直接结论

1. **数据**：卡片 = text 节点 + `canvasCard` 自定义字段；标题用 `node.text`（原生编辑即改名），正文在字段里。
2. **外观**：给带 `canvasCard.card===true` 的节点 `nodeEl` 加类 `canvas-card`；用 MutationObserver 监听画布节点层，节点出现/重建后幂等补类（无需 patch 渲染）。
3. **点击**：`document` 捕获阶段 click；从 target 找到 `.canvas-node`，再在对应 `canvas.nodes` 里按 `nodeEl` 引用反查节点；有 `canvasCard` 才拦截并开弹窗。Shift/Ctrl/Meta 点击放行给原生多选。
4. **双击**：M0 证明原生双击编辑可被完全阻止；但"单击开弹窗"与"双击改名"在交互上互斥（第一次 click 已开弹窗）→ 需产品拍板（见 §10）。
5. **拖拽**：保持原生；用 5px 位移守卫区分点击与拖拽。
6. **保存**：弹窗内改正文后 `node.setData({...node.getData(), canvasCard})` + `canvas.requestSave()`。
7. **右键菜单**：`canvas:node-menu (menu, node)` 是稳定扩展点，追加"编辑卡片正文/取消卡片"；不影响 AC 菜单。
8. **生命周期**：`layout-change` / `active-leaf-change` 时给所有 canvas leaf 重新挂载；视图内节点 DOM 重建交给 MutationObserver；leaves 关闭时解绑。

## 10. 待定项（已在实现中拍板）

- **AGENTS.md 的 internals 口径** → 选 S1：允许最小必要 Canvas internals，写入 `AGENTS.md` 的 "Canvas internals exception" allowlist（读取 `leaf.view.canvas`、`canvas.nodes`、`node.getData/setData` 等）；特性检测 + 降级。
- **双击语义** → 选 A：单击即开弹窗、双击不进原生编辑；改名走弹窗标题输入框。
- **点击后是否保留选中** → 选"补选中"：开弹窗同时 `canvas.selectOnly(node)`，保留 Delete/键盘/右键能力。
- **节点颜色** → 基础白底 + `mod-canvas-color-*` 时保留 `--canvas-color`（见 §7）。

## 11. 未验证 / 已知风险（已在 v0.1.0 验收中复核）

- ✅ 应用完全重启后的往返：重启后插件自启、卡片数据/外观/点击全部恢复（`docs/VERIFICATION.md` 验收 #3）。
- ✅ 弹窗全屏与 Esc 两段式：`docs/VERIFICATION.md` 验收 #2；popout 多窗口仍未测（v1 桌面单窗口）。
- ✅ 缩放导致 `contentEl` detach 时类保持：类在 `nodeEl` 上，`rebuildView`/缩放后仍正确（验收 #1–#8 过程中复验）。
- ✅ 未安装插件时：普通 text 节点，标题可见、正文隐藏但保留（验收 #4）。
- ⚠️ 被其他工具整体重写 `.canvas` 时（无本插件运行），`canvasCard` 作为未知字段仍应保留，但若工具不理解该字段可能丢弃；风险已记录在 `docs/DESIGN.md` §8。

## 12. 撤销历史（实现期补充实测）

`canvas.history` 实际结构：`{data, current, max}`，原型方法 `canUndo/undo/redo/push/replace/clear`。

```js
push(e)      // 截断 redo 后 data.push(e); current = data.length-1
undo()       // current--; return data[current]
replace(e)   // data[current] = e
pushHistory(e)  // history.push(e); updateHistoryUI()
applyHistory(e) // importData(e, true); data=e; view.requestSave(); updateHistoryUI()
overrideHistory() // requestPushHistory.run(); data=getData(); history.replace(data); view.requestSave()
```

- `requestPushHistory` 是**防抖包装**（内部延迟调用 `pushHistory`）；`canvas.requestSave(false)` 不触发它。
- 节点 `setData` 原型只接收一个参数：`function(t){ e.prototype.setData.call(this,t); var n=t.text; isString(n)&&this.setText(n) }` → **第二参不是"是否入历史"**；历史入栈完全由 `canvas.requestSave(requestHistory)` 决定。
- **踩坑**：正文自动保存若一直 `requestSave(false)`，历史快照停留在正文修改前；用户之后撤销更早的画布操作（拖拽/新建）会恢复旧快照，**正文被静默回滚**（实测 Ctrl+Z 与 Ctrl+Shift+Z 都会丢 marker 文本）。
- **最终方案（D21）**：正文编辑期间 `requestSave(false)`；弹窗关闭时若有内容变更，统一 `canvas.requestSave(true)` 一次 → 一次编辑会话 = 一个撤销步；之后撤销更早操作不会丢正文。
- 实测：编辑正文保存 → 关闭 → Ctrl+Z 回到编辑前 → Ctrl+Shift+Z 重做；再拖拽节点 → Ctrl+Z 只回退位置、正文保留；`copy-card-body` 剪贴板原文正确。

## 13. DOM 与数据刷新机制（复审修复后的最终形态）

Canvas 只在自身渲染/重建时写 DOM；`node.setData()` 这类纯数据变更**不会**触发节点重渲染，
因此卡片的派生外观（`.canvas-cards-card` 类、角落按钮、缩略图背景）必须由插件在数据变化后重新应用。

- 唯一数据源：`node.getData().canvasCard`；DOM 类/角标/背景都是从它派生。
- `CanvasBinding` 的刷新触发点：`MutationObserver`（childList/subtree）、`scheduleApply()`
  调度的 **30ms 定时器**、以及 `plugin.applyAppearance()`（设置变更、弹窗保存后）。
- 不碰 DOM 的数据变化（`Ctrl/Cmd+Z` / `Ctrl/Cmd+Shift+Z`、工具栏撤销/重做）由**按 document 注册**
  的捕获监听兜底：`keydown` 命中 Ctrl/Cmd+Z/Y（且非输入态）、`pointerup` 落在 `.canvas-wrapper`
  内 → `plugin.scheduleCanvasRefresh(...)`。
- **不要用 requestAnimationFrame 做刷新**：实测 CDP 下 `document.hidden=true` 时 rAF 完全暂停
  （rafRan=0 / timerRan=1），刷新链路会静默失效；改为 `setTimeout` 后稳定。
- pop-out 窗口是独立 document：`syncBindings()` 对每个 canvas leaf 的 `ownerDocument` 注册一套
  监听（`boundDocuments` 去重），卡片与角落按钮在 pop-out 中同样生效；关闭/重建 leaf 时
  `registerDomEvent` 随插件卸载清理。
- 节点生命周期：`createTextNode({save:false,focus:false})` 后需 `node.attach(); node.render()`；
  `rebuildView()` / 重新打开画布会重建节点对象，弹窗用 `plugin.locateLiveCard(sourcePath, nodeId)`
  在写入前解析当前活节点，避免写进过期引用。
- 缩略图缓存 key = `${nodeId}:${canvasCard.updated}`，正文保存后 `updated` 变化 → 自然重新解析；
  设置开关或外部数据变更走 `applyAppearance()` 强制刷新。
