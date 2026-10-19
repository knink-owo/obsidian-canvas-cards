# Canvas Cards — 验收与验证记录

版本：**0.2.0**（v1.0 完成定义 + v1.1 三项增强，见 `docs/DESIGN.md` §7.2）
验证日期：2026-10-19
验证人：自动化 + 人工复核（DeepSeek Harness 会话）

---

## 1. 验证环境

| 项目 | 值 |
|---|---|
| Obsidian | 1.14.4（Windows，真实桌面应用） |
| 测试 vault | `D:\Obsidian\all-in-one` |
| 测试画布 | `Canvas Cards 测试.canvas`（专用，未改动用户既有画布） |
| 共存插件 | Advanced Canvas 7.1.0（全程启用） |
| 其他启用插件 | obsidian-minimal-settings、easy-typing-obsidian、templater-obsidian、table-editor-obsidian、obsidian-kanban、obsidian-tasks-plugin |
| 构建工具链 | Node v24.19.0、pnpm 9.15.9、esbuild 0.25.5、TypeScript 5.9.x |
| 插件安装路径 | `D:\Obsidian\all-in-one\.obsidian\plugins\canvas-cards` |

### 验证方法

- **自动化**：Obsidian 以 `--remote-debugging-port=9222` 启动，通过 CDP（Chrome DevTools Protocol）在渲染进程内执行 DOM 断言与合成鼠标/键盘事件；脚本位于 `.tmp-research/cdp/`（`cdp.mjs`、`scenario.mjs`），截图位于 `.tmp-research/shots/`，验收截图已复制到 `docs/assets/`。
- **构建检查**：`pnpm run build`（tsc + esbuild production）与 `pnpm run lint`（ESLint + obsidianmd 规则）均通过。
- **人工复核**：弹窗、外观、全屏、右键菜单均以截图确认。

### 构建产物

| 文件 | 大小 | 说明 |
|---|---|---|
| `main.js` | 33,681 B | CJS bundle，仅 `require("obsidian")`，无绝对路径 / vault 名 / 网络 URL；sha256 `5B37E497…D640F15`（发布前复审修复后重新构建） |
| `manifest.json` | 257 B | id=canvas-cards，version=0.2.0，minAppVersion=1.14.4（实际测试过的最低版本），isDesktopOnly=true |
| `styles.css` | 8,935 B | 卡片外观 + 角落按钮 + 缩略图封面 + 弹窗/搜索样式 |
| `data.json`（运行时生成） | 99 B | `{"appearance":"minimal","trigger":"click","showThumbnails":true,"showStatus":true}` |

---

## 2. 验收清单结果

| # | 验收标准 | 结果 | 证据 |
|---|---|---|---|
| 1 | 转换 / 新建 / 取消卡片均可用，命令与右键菜单都能触发 | ✅ | `convert-to-card` 给节点加 `canvasCard{card:true}` 并立即加卡片类；`uncard` 置 `card:false`、移除类、保留正文；连续两次 `create-card` 生成 300×96 卡片并 28px 避让、位置不重叠；右键菜单与命令面板均出现对应项 |
| 2 | 单击开、Esc 或点遮罩关、全屏切换正常 | ✅ | 单击卡片 → 弹窗以阅读模式打开（`modal canvas-cards-modal`）；全屏后第一次 Esc 仅退出全屏、第二次 Esc 关闭；点弹窗外遮罩关闭；全屏尺寸 1240×736（窗口 1348×800，≈92vw×92vh）；截图 `docs/assets/card-modal.png`、`card-fullscreen.png` |
| 3 | 正文编辑自动保存，重启 Obsidian 后内容仍在 | ✅ | 编辑后 400ms 防抖写入 `.canvas`（`canvasCard.body`）；真实退出并重启 Obsidian（`Stop-Process` + 重新启动）后插件自动启用、两张卡片数据与外观完整恢复，点击可再次打开弹窗；截图 `docs/assets/after-restart.png` |
| 4 | 禁用插件后卡片仍显示标题，正文保留在 `.canvas` 文件里 | ✅ | `disablePlugin` 后节点类回到 `canvas-node`，标题"项目会议要点"仍由原生文本渲染；`.canvas` 中 `canvasCard.body` 字段完整；重新启用后卡片外观恢复 |
| 5 | 与 Advanced Canvas 同时启用不冲突 | ✅ | Advanced Canvas 7.1.0 全程启用；右键菜单同时包含 AC 项（聚焦当前卡片 / 编辑 / 转换为笔记 / Save node as template）与插件项（编辑卡片 / 复制正文 / 取消卡片）及原生"移除"；AC 的样式/分组/浮动功能未见异常；截图 `docs/assets/context-menu.png` |
| 6 | `.canvas` 拷贝到另一 vault 仍可用 | ✅ | 新建隔离 vault `portable-vault`，只放入插件三件套与该画布副本；启用后卡片数据/外观/点击弹窗/正文渲染全部正常（截图 `docs/assets/portable-vault.png`）。注意：新 vault 需先打开"第三方插件"（Obsidian 对全新 vault 的默认安全限制），这不是插件问题 |
| 7 | 弹窗内 Ctrl+Z 只影响编辑框；画布撤销整步回退一次编辑会话，不会静默丢正文 | ✅ | 画布 history 内部结构实测（`history.data/current`、`push/replace/undo`）；实现为"编辑会话结束时 push 一次快照"：编辑后 Ctrl+Z 整步回到编辑前，Ctrl+Shift+Z 重做；随后撤销更早的拖拽只回退位置、正文保留；`copy-card-body` 正文原文写入剪贴板 |
| 8 | 63 节点 / 47 边量级画布操作流畅 | ✅ | 用户 63 节点 / 47 边画布只读验证：63 个节点全部正常挂载；插件 `refresh()` ≈0ms，`apply()` ≈1.9ms（给 63 个节点做类名同步）；无卡片时不添加任何类、不拦截事件，零干扰；截图 `docs/assets/large-canvas.png` |

### 2.1 v1.1 新增验收

| # | 验收标准 | 结果 | 证据 |
|---|---|---|---|
| 9 | "搜索卡片正文"能用正文里的词命中卡片，并跳转到所属画布打开该卡片 | ✅ | 命令 `canvas-cards:search-cards` 打开搜索弹窗；输入正文独有的"风险与阻塞"→ 状态"共 1 张卡片"、结果为"项目会议要点 / Canvas Cards 测试"；点击结果后活动叶切到测试画布、卡片被选中、卡片弹窗以阅读模式打开；截图 `docs/assets/card-search.png` |
| 10 | "导出为笔记"生成同目录笔记，frontmatter 记录来源画布与节点 id，正文完整 | ✅ | 选中卡片执行 `canvas-cards:export-card` → 画布同目录生成 `项目会议要点.md`，frontmatter `canvas-cards-source: "[[Canvas Cards 测试.canvas]]"`、`canvas-cards-node: "733d0e2cfb1550c3"`（YAML 转义）、`exported`；正文含 `# 标题` 与完整 Markdown；测试后已删除该导出文件 |
| 11 | 正文含图片嵌入的卡片显示封面缩略图；`showThumbnails` 关闭后恢复纯标题卡片 | ✅ | 临时卡片正文 `![[fig-01.png]]` → `nodeEl` 加 `canvas-cards-has-thumb`、`--canvas-cards-thumb` 为资源 URL、容器 `background-image` 为渐变+封面、标题白色左下；`showThumbnails=false` 后类与背景移除，恢复后重新出现；截图 `docs/assets/card-thumbnail.png`；测试卡片已从画布删除 |

---

## 3. 功能逐项验证

| 功能 | 验证方式 | 结果 |
|---|---|---|
| 新建卡片（命令） | `canvas-cards:create-card` → 节点创建于视口中心，300×96 | ✅ |
| 新建卡片避让 | 连续建卡，命中已有节点时 +28px 步进（最多 8 次） | ✅ |
| 转换为卡片 | 右键/命令给现有 text 节点加卡片数据 | ✅ |
| 取消卡片 | 隐藏正文（`card:false`），正文保留、可复制 | ✅ |
| 单击打开弹窗 | 捕获阶段点击 + 5px 位移守卫；拖拽不触发 | ✅ |
| 角落按钮打开 | 每张卡注入 `.canvas-cards-corner`（`interactive-child`，`id-card` 图标）；点击打开弹窗、不触发原生拖拽/双击编辑；hover/focus 淡入 | ✅ |
| 打开方式设置 | `trigger=click`：点卡片本体或角落按钮都打开；`trigger=icon`：只有角落按钮打开，卡片本体保持 Canvas 原生点击行为；切换即时生效 | ✅ |
| 双击行为 | 不进入原生编辑；标题改名走弹窗标题输入框 | ✅ |
| 弹窗阅读模式 | MarkdownRenderer：标题/列表/引用/任务清单/`[[wikilink]]` | ✅ |
| 弹窗编辑模式 | textarea 原始 Markdown，切回阅读即时渲染 | ✅ |
| 自动保存 | 正文 400ms 防抖 + 标题 300ms 防抖 + 关闭时落盘 | ✅ |
| 撤销隔离 | 画布 Ctrl+Z 不会被正文自动保存污染（会话快照） | ✅ |
| 全屏 | 92vw×92vh；Esc 两段式（先退全屏再关闭） | ✅ |
| 复制正文 | `canvas-cards:copy-card-body` → 剪贴板原文 | ✅ |
| 右键菜单 | 仅在卡片/文本节点追加；与 AC、原生菜单共存 | ✅ |
| 设置页 | 外观（极简/按钮）与打开方式（单击/仅角落图标）即时生效；保存状态开关 | ✅ |
| 中英双语 | 跟随 Obsidian 语言（`moment.locale()`） | ✅ |
| 禁用插件降级 | 标题仍在、正文保留、无报错 | ✅ |
| 缩放 / 重建 | `leaf.rebuildView()` 后数据与卡片类重新应用 | ✅ |
| 应用重启 | 插件自启、卡片与设置全部保留 | ✅ |
| 搜索卡片正文 | 扫描全部 `.canvas` 的 `canvasCard`，按标题/正文匹配；结果片段、↑/↓/Enter、点击跳转定位 | ✅ |
| 导出为笔记 | 同目录唯一命名 `.md`，frontmatter（来源画布/节点 id/时间）+ 标题 + 正文 | ✅ |
| 缩略图封面 | 正文首图 `![[...]]` / `![](...)` 解析为封面；设置项开关即时生效 | ✅ |

---

## 4. 已知限制（v1 有意为之）

1. **桌面端专用**：`isDesktopOnly: true`；移动端 Canvas 未验证。
2. **正文不参与 Obsidian 全局搜索/图谱**：正文存于 `.canvas` 的 `canvasCard` 字段，Canvas 索引只覆盖标题；v1.1 提供"搜索卡片正文"命令与"导出为笔记"弥补，全局搜索面板本身未集成。
3. **弹窗编辑器为纯 textarea**：无实时预览分栏、无 Obsidian 编辑器补全；v1 取舍见 `docs/DESIGN.md` D10。
4. **撤销为会话级**：正文修改不按敲键入 Canvas 历史；一次编辑会话 = 一个撤销步。
5. **双击不进原生编辑**：卡片节点双击不再编辑正文（正文在弹窗内编辑）。
6. **Publish 不支持 Canvas**：与插件无关，Obsidian 官方限制。
7. **跨 vault 使用**：需在新 vault 中开启第三方插件（Obsidian 对全新 vault 的默认安全限制）。
8. **未知字段安全性**：卡片数据作为未知字段随 `.canvas` 保存；若在无插件环境被其他工具整体重写，字段可能丢失（风险见 `docs/DESIGN.md` §8）。

---

## 5. 手工冒烟清单（用户复核用）

1. 打开 `Canvas Cards 测试.canvas`，确认两张白底圆角卡片、标题居中。
2. 单击"项目会议要点" → 弹窗阅读模式渲染标题/列表/引用/任务清单；点标题栏可改名。
3. 悬停卡片，右上角出现 `id-card` 小按钮；点它同样打开弹窗（不移动卡片）。
4. 设置 → Canvas Cards → 打开方式切"仅角落图标"：再点卡片本体不再弹窗，只能点右上角按钮打开（截图 `docs/assets/corner-button.png`）。
5. 点工具栏编辑图标 → 修改正文 → 关闭弹窗 → 重开确认已保存。
6. 点全屏 → 按 Esc 一次应退全屏、再按一次关闭。
7. 拖拽卡片 → 位置移动且不弹窗；Ctrl+Z 回退位置、正文不丢。
8. 右键卡片 → 看到"编辑卡片 / 复制正文 / 取消卡片"与 AC 菜单共存。
9. 命令面板执行 `Canvas Cards: Create card` → 视口中心出现新卡片。
10. 禁用插件 → 卡片恢复为普通文本节点（标题仍在），重新启用后外观恢复。
11. 设置 → 第三方插件 → Canvas Cards → 外观切"按钮" → 卡片即时变为按钮样式。
12. 命令面板执行 `Canvas Cards: Search card bodies` → 输入正文里的词（如"风险与阻塞"）→ 选中结果应跳到测试画布并打开该卡片。
13. 选中一张卡片 → 右键"导出为笔记"（或命令 `Export card to note`）→ 画布同目录出现同名 `.md`，frontmatter 含来源画布与节点 id。
14. 给卡片正文首行加 `![[fig-01.png]]` 并重新打开画布 → 卡片显示图片封面；关闭设置"显示缩略图"后恢复纯标题卡片。
15. 设置 → 缩略图开关/打开方式等切换后无需重启，立即生效。

---

## 6. 相关文档与截图

- 设计：`docs/DESIGN.md`（决策 D1–D24、数据模型、交互、架构、里程碑、风险）
- M0 运行时勘察：`docs/research/m0-runtime-notes.md`
- Obsidian 内部机制勘察：`docs/research/canvas-internals-local.md`
- 生态竞品调研：`docs/research/canvas-card-prior-art.md`
- 截图：`docs/assets/`
  - `cards-canvas.png` — 画布上的卡片
  - `card-modal.png` — 弹窗阅读模式
  - `card-editor.png` — 弹窗编辑模式
  - `card-fullscreen.png` — 全屏
  - `button-appearance.png` — 按钮外观
  - `corner-button.png` — 角落按钮（打开方式=仅角落图标）
  - `card-search.png` — 搜索卡片正文
  - `card-thumbnail.png` — 图片封面缩略图
  - `context-menu.png` — 右键菜单（与 Advanced Canvas 共存）
  - `after-restart.png` — 重启后恢复
  - `large-canvas.png` — 63 节点大画布（性能验证）
  - `portable-vault.png` — 复制到另一 vault 后可用
