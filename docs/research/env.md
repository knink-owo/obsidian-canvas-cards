# Obsidian Canvas 环境勘察报告

- 勘察时间：2026-10-19（Asia/Shanghai）
- 工作目录：`D:\Projects\ob-canvas`
- 性质：只读探查；未启动/重启 Obsidian，未修改任何 vault，未安装全局依赖。
- 隐私：只读取了 `.canvas` 的 JSON 结构和最多 200 字符的文本样例；未读取/输出无关笔记正文。

## 0. 结论速览

1. **Obsidian 已安装，版本 1.14.4**，但实际路径是 `C:\Users\ink14\AppData\Local\Programs\Obsidian`，任务里假设的 `C:\Users\ink14\AppData\Local\Obsidian\resources\app.asar` **不存在**（`stat` 退出码 1）。
2. 该安装的 `app.asar` 只有 480,128 字节，是 Electron 宿主壳；真正的应用代码在 **`resources\obsidian.asar`（27,477,966 字节）**。两个 asar 中都**没有任何路径名包含 canvas 的文件**；Canvas 功能全部打包在 `obsidian.asar` 的 `app.js`（3,942,126 字节）里。
3. **没有随应用分发的 canvas TypeScript 声明**：`obsidian.asar` 中唯一的 `.d.ts` 是 `lib/readability.d.ts`，`app.asar` 中为 0 个。不能依赖内置 `.d.ts`，需要自己声明 Canvas 文件类型。
4. `.canvas` 是**普通 UTF-8 JSON**，顶层为 `nodes` / `edges` / 可选 `metadata`；本次在 vault 中实际观察到 `text`、`file`、`group` 三种节点，未观察到 `link`。
5. vault 中的 `.canvas` 已被 **Advanced Canvas 7.1.0** 写入自定义字段：`styleAttributes`（10 个 text 节点、9 条 edge）与 `toFloating`（9 条 edge）。这些字段在 Obsidian 1.14.4 的 `app.js` 中**完全不存在**，实现读写时必须保留未知字段，不能重建成“干净 schema”。
6. 工具链齐备：Node v24.19.0、pnpm 9.15.9、git 2.56.0.windows.2、npm 11.17.0；devkit 自检 `1.0.0`，退出码 0。

## 1. Obsidian 安装位置与版本

### 1.1 实际安装

| 项目 | 值 |
|---|---|
| 安装目录 | `C:\Users\ink14\AppData\Local\Programs\Obsidian` |
| 主程序 | `C:\Users\ink14\AppData\Local\Programs\Obsidian\Obsidian.exe`（239,103,760 字节） |
| 版本（exe FileVersion） | `1.14.4` |
| 版本（exe ProductVersion） | `1.14.4.0` |
| 应用代码 asar | `C:\Users\ink14\AppData\Local\Programs\Obsidian\resources\obsidian.asar`，27,477,966 字节，mtime `2026-10-03 00:00:34 +0800` |
| 宿主 asar | `C:\Users\ink14\AppData\Local\Programs\Obsidian\resources\app.asar`，480,128 字节，mtime `2026-10-03 00:00:34 +0800` |
| resources 其他 | `canvas.ico`（14,243 字节，图标，非代码）；`app.asar.unpacked` 仅含 `btime`、`get-fonts` 原生模块 |

两个 asar 内的 `package.json` 版本也都是 `1.14.4`（`obsidian.asar` 的包名是 `obsidian-dev`，`app.asar` 的包名是 `obsidian`）。

### 1.2 任务中假设的路径

```text
C:\Users\ink14\AppData\Local\Obsidian\resources\app.asar
```

该路径不存在（`stat` 返回 `No such file or directory`，退出码 1）。`C:\Users\ink14\AppData\Local\Obsidian\` 本身也不存在；实际安装走 `...\Local\Programs\Obsidian\`。另有一个更新器目录 `C:\Users\ink14\AppData\Local\obsidian-updater\installer.exe`（341,331,008 字节），只是安装包缓存。

## 2. Vault 与 .canvas 文件

### 2.1 obsidian.json

- 路径：`C:\Users\ink14\AppData\Roaming\obsidian\obsidian.json`
- 顶层：`{"vaults": {...}, "cli": true}`
- 共 6 个 vault（只列路径）：

| vault id | 路径 | 备注 |
|---|---|---|
| `20cfad3881b3e817` | `D:\Blog\myblog\quartz` | |
| `14905dc7315e433c` | `D:\Obsidian\万年历` | |
| `d071e229c198e07a` | `D:\Obsidian\all-in-one` | `"open": true`，当前打开的 vault |
| `19d25d349c688ae2` | `D:\Obsidian\临时` | |
| `772a6b6dc9784bdb` | `D:\Projects\Maze-garden\迷宫花园` | |
| `6bbbd124e43c299f` | `D:\Projects\prompts-and-skills\src\prompts+skills` | |

### 2.2 .canvas 扫描

扫描方式：`timeout 25 find <vault> -maxdepth 6 -type f -name "*.canvas" -not -path "*/.obsidian/*" -not -path "*/.git/*"`，退出码 0。只扫描了 `D:\Obsidian\all-in-one`、`D:\Obsidian\万年历`、`D:\Projects\Maze-garden\迷宫花园`；后两者未命中。

`D:\Obsidian\all-in-one` 中共 7 个 `.canvas`（4 个活跃 + 3 个 `.trash`）：

| 文件 | 字节 | nodes | edges | 类型 |
|---|---:|---:|---:|---|
| `D:\Obsidian\all-in-one\学习路径.canvas` | 667 | 3 | 2 | text ×1, file ×2 |
| `D:\Obsidian\all-in-one\项目空间.canvas` | 139 | 1 | 0 | text ×1 |
| `D:\Obsidian\all-in-one\2-领域-Areas\论文\llm-agent-memory-survey\未命名.canvas` | 88 | 0 | 0 | 空画布 |
| `D:\Obsidian\all-in-one\2-领域-Areas\论文\基于大语言模型的智能体的记忆机制综述\智能体记忆综述.canvas` | 22,996 | 63 | 47 | group ×6, text ×47, file ×10 |
| `D:\Obsidian\all-in-one\.trash\Home.canvas` | 761 | 5 | 0 | text ×5 |
| `D:\Obsidian\all-in-one\.trash\未命名.canvas` | 88 | 0 | 0 | 空画布 |
| `D:\Obsidian\all-in-one\.trash\未命名 1.canvas` | 23,999 | 60 | 59 | file ×60 |

聚合统计（7 个文件）：132 个节点（text 54、file 72、group 6），108 条边。

## 3. .canvas Schema（实测）

### 3.1 顶层

```json
{
  "nodes": [],
  "edges": [],
  "metadata": { "version": "1.0-1.0", "frontmatter": {}, "startNode": "<node-id>" }
}
```

- `nodes`、`edges` 始终存在（空画布也为 `[]`）。
- `metadata` **可选**：3 个旧文件没有；新文件有 `metadata.version`（均为 `"1.0-1.0"`）、`metadata.frontmatter`（均为 `{}`）。
- `.trash\未命名 1.canvas` 的 `metadata` 还出现了 `startNode`，值为节点 id（Advanced Canvas 的演示/起点扩展，非 Obsidian 基础字段）。
- 文件编码 UTF-8，缩进为 Tab，无 JSON 注释，无尾随逗号；可以严格 `JSON.parse`。

### 3.2 节点通用字段

所有节点（132/132）都有：

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | string | 16 位小写十六进制，如 `d54fa3b84b010085` |
| `type` | string | `text` / `file` / `group`（本次实测）；格式还定义 `link` |
| `x`, `y` | number | 画布坐标，可为负、可为 0 |
| `width`, `height` | number | 节点尺寸；实测为整数，group 可达 2880×3000 |

### 3.3 各类型完整字段（实测）

#### text（54 个）

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `id` | 是 | string | |
| `type` | 是 | string | 固定 `"text"` |
| `text` | 是 | string | Markdown 文本，可含换行、标题、列表、粗体；实测最长 1,022 字符（仅本 vault） |
| `x`, `y`, `width`, `height` | 是 | number | 实测 width 250–433，height 50–396 |
| `color` | 否 | string | 调色板编号字符串，如 `"1"`、`"3"`、`"4"`、`"5"` |
| `styleAttributes` | 否 | object | 实测均为 `{}`；来自 Advanced Canvas，不是 1.14.4 原生字段 |

#### file（72 个）

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `id` | 是 | string | |
| `type` | 是 | string | 固定 `"file"` |
| `file` | 是 | string | vault 相对路径，使用 `/`，无前导 `/`；如 `2-领域-Areas/技术/人工智能/rag/RAG简述.md` |
| `subpath` | 否 | string | 61/72 个存在；标题锚点，如 `#8 局限与未来方向（Limitations and Future Directions）` |
| `x`, `y`, `width`, `height` | 是 | number | |
| `color` | 否 | string | 本次未观察到，但格式支持 |

#### group（6 个）

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `id` | 是 | string | |
| `type` | 是 | string | 固定 `"group"` |
| `label` | 否 | string | 组标题；实测 6/6 都有 |
| `x`, `y`, `width`, `height` | 是 | number | |
| `color` | 否 | string | 5/6 个存在，如 `"3"`、`"4"`、`"1"` |
| `background` | 否 | string | 实测未出现；1.14.4 的 `app.js` 支持该字段 |
| `backgroundStyle` | 否 | string | 实测未出现；`app.js` 中出现 2 次，支持 `cover` 等值 |

#### link（未实测）

本次 7 个文件中没有 `link` 节点，因此无法给出本机实证。按 Obsidian Canvas 格式，link 节点应为 `{"id","type":"link","url","x","y","width","height"}`；若插件要完整支持，需要自行构造测试文件后在 Obsidian 中验证（不要修改真实 vault）。

### 3.4 边（edges，108 条）

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `id` | 是 | string | 16 位十六进制 |
| `fromNode` | 是 | string | 起点节点 id |
| `fromSide` | 是 | string | `top` / `right` / `bottom` / `left` |
| `toNode` | 是 | string | 终点节点 id |
| `toSide` | 是 | string | 同上 |
| `label` | 否 | string | 可含换行；实测最长 11 字符，如 `"不同视角"`、`"有效性\n效率\n可解释性"` |
| `color` | 否 | string | 格式支持，本次未出现 |
| `fromEnd`, `toEnd` | 否 | string | 1.14.4 的 `app.js` 有读取逻辑（箭头端点），本次数据未出现 |
| `styleAttributes` | 否 | object | 实测 9 条，均为 `{}`；Advanced Canvas 扩展 |
| `toFloating` | 否 | boolean | 实测 9 条，均为 `false`；Advanced Canvas 扩展 |
| `fromFloating` | 否 | boolean | 插件代码中出现，本次数据未出现 |

### 3.5 实测样例（长文本截断到 200 字符）

```json
{"id":"0c5a27dc9e08aec9","type":"group","x":-1520,"y":-600,"width":2880,"height":3000,"label":"基于大语言模型的智能体的记忆机制综述"}
```

```json
{
  "id": "2ec249056ba2eb39",
  "type": "text",
  "text": "### **外部知识**\n\n基于大语言模型的智能体的一个重要特征是，它们可以直接用自然语言进行交流和控制。因此，基于大语言模型的智能体可以轻松地以文本形式纳入外部知识（例如维基百科[3]）来辅助决策。\n\n**代表性研究。** 在 ReAct [200] 中，智能体需要通过多个推理步骤回答关于通用知识的问题。如果在这些步骤中缺乏信息，它们可以利用维基百科 API 获取外部知识。GITM [232] ",
  "x": 440,
  "y": 407,
  "width": 265,
  "height": 60
}
```

```json
{"id":"742e3e80c35fc601","type":"file","file":"2-领域-Areas/论文/基于大语言模型的智能体的记忆机制综述/子/狭义定义.md","x":-400,"y":-465,"width":260,"height":60}
```

```json
{"id":"fcc863251440e09d","styleAttributes":{},"toFloating":false,"fromNode":"23ed197188d295b7","fromSide":"top","toNode":"da32a03149b9e342","toSide":"bottom"}
```

### 3.6 插件写入的自定义字段（重要）

结论：`styleAttributes` 与 `toFloating` 来自 **Advanced Canvas 7.1.0**（vault 内已安装，`minAppVersion: 1.13.0`），不是 Obsidian 1.14.4 原生字段。

证据：

- `obsidian.asar` 的 `app.js` 中 `styleAttributes`、`toFloating` 出现次数均为 **0**；`backgroundStyle`、`fromEnd`、`toEnd` 有原生实现。
- `D:\Obsidian\all-in-one\.obsidian\plugins\advanced-canvas\main.js` 中 `styleAttributes` 出现 25 次、`toFloating` 4 次、`fromEnd`/`toEnd` 各 1 次。
- 插件代码中的用法示例：`styleAttributes: { border: "invisible" }`；浮动边写入 `fromFloating: true` / `toFloating: true`。
- 现有 `.canvas` 中这些字段分别是 `{}` 和 `false`，说明只是插件初始化/默认值，但真实用户可能写入非空值（如 `border` 样式）。

**实现含义**：读写 `.canvas` 时必须保留 `id` 以及未知字段（尤其 `styleAttributes`、`toFloating`、`fromFloating`），用“读取 JSON → 修改目标字段 → 写回”的方式，不能按固定 schema 重建节点/边，否则会静默丢失 Advanced Canvas 的样式/浮动边信息。

## 4. ASAR 解析（零依赖 Node 脚本）

脚本：`D:\Projects\ob-canvas\.tmp-research\env\asar-scan.mjs`

实现要点：读取前 16 字节；`u32@8` = header pickle payload size，`u32@12` = header JSON 字节长度，JSON 从偏移 16 开始；递归 `files` 目录树，只输出路径、大小、`unpacked` 标记，不读取/dump 条目内容。若偏移 12 解析失败，回退到 `u32@4` + 偏移 8。

运行：

```powershell
node .tmp-research/env/asar-scan.mjs "C:\Users\ink14\AppData\Local\Programs\Obsidian\resources\app.asar" --needle=canvas
node .tmp-research/env/asar-scan.mjs "C:\Users\ink14\AppData\Local\Programs\Obsidian\resources\obsidian.asar" --needle=canvas
```

结果（均退出码 0）：

| asar | 字节 | header JSON 字节 | 条目总数 | 路径含 `canvas` | `.d.ts` 数 |
|---|---:|---:|---:|---:|---:|
| `app.asar` | 480,128 | 10,453 | 40 | **0** | 0 |
| `obsidian.asar` | 27,477,966 | 95,908 | 368 | **0** | **1**（`lib/readability.d.ts`） |

- `obsidian.asar` 顶层：`app.css, app.js, enhance.js, help.html, help.js, i18n, i18n.js, icon.png, index.html, lib, main.js, package.json, public, quicklook, quicklook.css, quicklook.js, sandbox, sim.js, starter.html, starter.js, worker.js`
- 最大条目：`app.js` 3,942,126 字节；`lib/mermaid.min.js` 2,964,042；`app.css` 668,223。
- **Canvas 代码没有独立文件**，全部在 `app.js` 内；`canvas.ico` 只是 resources 目录下的图标。
- 结果文件：
  - `D:\Projects\ob-canvas\.tmp-research\env\asar-app-canvas.json`
  - `D:\Projects\ob-canvas\.tmp-research\env\asar-obsidian-canvas.json`

### 4.1 是否有内置 canvas TypeScript 声明？

**没有。** 两个 asar 中没有任何 canvas 相关 `.d.ts`。`obsidian.asar` 仅有 `lib/readability.d.ts`；`app.asar` 无 `.d.ts`。`app.asar.unpacked` 也只有 `btime`、`get-fonts` 的原生模块 JS。

因此：

- 不能从安装目录提取官方 Canvas 类型；
- 需要插件内自定义 `CanvasData` / `CanvasNode` / `CanvasEdge` 接口；
- 运行时 Canvas API 属于内部实现（`app.js` 内的 `Canvas`、`CanvasNode` 等被压缩混淆），不建议依赖，文件级 JSON 读写更稳。

## 5. 工具链

| 工具 | 版本 | 退出码 |
|---|---|---|
| node | `v24.19.0` | 0 |
| pnpm | `9.15.9` | 0 |
| git | `2.56.0.windows.2` | 0 |
| npm | `11.17.0` | 0 |

Node 24 满足 devkit 的 `node >= 20` 要求。

### 5.1 devkit

目录：`C:\Users\ink14\.dsh\skills\obsidian-plugin-dev`（存在；含 `SKILL.md`、`scripts/`、`reference/` 6 个文档）

```powershell
cd C:\Users\ink14\.dsh\skills\obsidian-plugin-dev
node scripts/devkit.mjs --version
```

输出：

```text
1.0.0
```

退出码：**0**。脚本与依赖已随 skill vendored，无需 `npm install`。

同机的完整 devkit 源码位于 `D:\Projects\dsh-obsidian-devkit`（包名 `@knink-owo/dsh-obsidian-plugin-devkit`，版本 `1.0.0`，含 `src/`、`lib/`、`skill/`、`dev-vault/`、`node_modules/typescript`）。

## 6. 可复用的本地资源

`D:\Projects` 顶层（只看一层）：`CourseGraph`、`INK-DesignLanguage`、`Maze-garden`、`NJUPT-SOMAST`、`Obsidian相关`、`Others`、`QQ`、`Thousand Year Old Vampire`、`Topic selection flow`、`dsh-obsidian-devkit`、`gitee`、`ict`、`ict-acl-recovery`、`move-cloud`、`ob-canvas`、`prompts-and-skills`、`search`、`web-video-maker`。

与本任务直接相关的：

- `D:\Projects\dsh-obsidian-devkit`：完整的 Obsidian 插件开发工具链源码/模板（scaffold、build、validate、deploy、smoke、e2e），不是空模板目录。
- `D:\Projects\Obsidian相关\万年历`：只有这一层目录，内容未深入检查，判断为笔记/项目资料而非插件模板。
- **没有**发现现成的 `obsidian-plugin-*` 模板目录或已初始化的插件工程（除 devkit 自带模板外）。

`D:\Projects\ob-canvas` 状态：

- 开始勘察时没有源码、`package.json`、`manifest.json` 或 git 仓库，只有 `.tmp-research\` 与 `docs\` 两个目录（应为任务脚手架）。
- 当前新增：`docs\research\env.md`（本报告）、`.tmp-research\env\`（`asar-scan.mjs`、`summarize-canvas.mjs`、扫描结果 JSON）。
- `.tmp-research\` 下还有并行任务产生的 `a-advanced-canvas\`、`repos\`、`community-plugins.json`、`fetch.js`，**不是本次产物，未改动**。

## 7. 对插件实现的事实性建议

1. **以文件 JSON 为唯一稳定接口**：`.canvas` 是纯 JSON，直接用 `app.vault.adapter.read()` / `write()`（或 `vault.read`）读写；不要依赖 `app.js` 内被压缩的 Canvas 内部类。
2. **Schema 按“保留式修改”实现**：保留所有未知键；只在目标节点/边上增删字段。尤其保留 `styleAttributes`、`toFloating`、`fromFloating`、`metadata.startNode`。
3. **路径规则**：`file` 字段是 vault 相对路径、`/` 分隔、无前导 `/`；`subpath` 是 `#标题` 形式，标题中可含空格/中文/括号。节点 id 为 16 位小写 hex，插件生成 id 时应保持同形态（可用 `crypto.randomBytes(8).toString('hex')`）。
4. **文本是 Markdown**，不是纯文本；text 节点可能很长（本 vault 最长 1,022 字符），不要按单行处理。边 `label` 也可能含换行。
5. **边端点**：`fromSide`/`toSide` 为 `top|right|bottom|left`；`fromEnd`/`toEnd` 在 1.14.4 原生支持但本 vault 未使用；`toFloating`/`fromFloating` 由 Advanced Canvas 使用。
6. **画布打开时的写入风险**：Obsidian 编辑器可能持有内存状态并覆盖磁盘。插件若要写当前打开的 `.canvas`，应优先通过 Canvas 视图/内部 API 修改，或至少在写入前检测 mtime / 在非编辑状态写入；本次未验证该行为（约束禁止启动 Obsidian）。
7. **类型声明自备**：本机没有 canvas `.d.ts`；建议在插件内定义 `CanvasFileData`、`CanvasNodeData`（text/file/link/group 联合）、`CanvasEdgeData`，并把未知字段用索引签名保留。
8. **不要假设 `link` 节点**：本 vault 未出现，需另造测试画布验证；同理 `background`/`backgroundStyle` 虽被 1.14.4 支持但本 vault 未使用。

## 8. 命令与退出码记录

| # | 命令（要点） | 退出码 | 结果 |
|---|---|---|---:|---|
| 1 | `pwd; node --version; pnpm --version; git --version; npm --version` | 0 | 工作目录与 4 个版本号 |
| 2 | `stat ...\Local\Obsidian\resources\app.asar` | **1** | 假设路径不存在 |
| 3 | `cat ...\Roaming\obsidian\obsidian.json` | 0 | 6 个 vault 路径，`cli: true` |
| 4 | `powershell (Get-Item Obsidian.exe).VersionInfo` | 0 | `1.14.4` / `1.14.4.0` |
| 5 | `node scripts/devkit.mjs --version`（skill 目录） | 0 | `1.0.0` |
| 6 | `timeout 25 find ... -maxdepth 6 -name "*.canvas"`（3 个 vault） | 0 | 7 个 canvas（all-in-one） |
| 7 | `node summarize-canvas.mjs <4 个活跃 canvas>` | 0 | `canvas-small.json` / `canvas-large.json` |
| 8 | `node summarize-canvas.mjs <3 个 .trash canvas>` | 0 | `canvas-trash.json` |
| 9 | `node asar-scan.mjs app.asar --needle=canvas` | 0 | 0 命中，40 条目 |
| 10 | `node asar-scan.mjs obsidian.asar --needle=canvas` | 0 | 0 命中，368 条目，1 个 `.d.ts` |
| 11 | 聚合 7 个 canvas 的字段/类型统计（Node 内联脚本） | 0 | 132 节点 / 108 边 |
| 12 | 检查 `advanced-canvas` manifest 与 `main.js` 字符串 | 0 | 7.1.0；`styleAttributes` 25 次、`toFloating` 4 次 |
| 13 | `Get-ChildItem` 检查 `D:\Projects`、`ob-canvas`、skill、devkit | 0 | 见第 6 节 |

说明：第 10 项首次尝试时 DSH bash 运行时在沙箱内初始化失败（`CreateFileMapping ... Win32 error 5`，`EXECUTOR_UNAVAILABLE`，退出码 256），随后改用 PowerShell 7 执行同一 Node 命令成功；这是执行器临时故障，不是权限拒绝，也未做提权。

## 9. 未做/未验证

- 未启动 Obsidian，因此未验证：Canvas 打开时插件写文件的覆盖行为、`link` 节点实际渲染、`fromEnd`/`toEnd` 箭头字段、`background`/`backgroundStyle` 的真实落盘格式。
- 未修改任何 vault；未安装任何依赖；未执行 `pnpm install`。
- 未读取 `advanced-canvas` 的完整源码，只做了字段字符串与局部上下文核对。
- `.canvas` 的 schema 结论基于本机 1 个 vault 的 7 个文件 + Obsidian 1.14.4 `app.js`；跨版本/跨插件组合需另行验证。
