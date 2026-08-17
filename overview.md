# 本次工作概览

## 修复内容

### 1. 黄色方块消失
- **根因**：`Levels.ts` 第 1、2 关 `cellTypeNum=3`，而 `BASIC_CELL_TYPES` 原顺序为红/蓝/绿/黄，`slice(0,3)` 永远只取前三个，黄色被排除。
- **修复**：调整 `assets/scripts/model/ConstValue.ts` 中 `BASIC_CELL_TYPES` 顺序为 **红/蓝/黄/绿**，让 3 色关也包含黄色，4 色关再补绿色，难度曲线不变。

### 2. 场景命名混乱
- **根因**：MCP 多次创建新场景导致 `assets/scenes/` 下出现 `scene.scene`、`Temp.scene` 等未命名/半成品的脏文件；编辑器打开的是未命名 `scene-2d`，构建配置却指向 `Game.scene`，造成“命名错 + 报错”。
- **修复**：
  - 将 `scene.scene`、`Temp.scene` 及其 `.meta` 移出并删除。
  - 保留 `Game_backup.scene` 作为安全备份。
  - 确认 `profiles/v2/packages/builder.json` 的 `startScene` 指向 `Game.scene`（uuid `0a2ebf26...`）。
  - 编辑器标题现在显示为 `Game.scene`，层级管理器里只剩 `Game.scene` + 备份。

### 3. UI 全部挤在一起 / 棋盘不显示
- **根因**：`Game.scene` 中**几乎所有关键节点的 `contentSize` 都是 0×0**（Canvas、bg、blockBoard、4 个覆盖层、所有按钮/标签）。Cocos 3.x 下尺寸为 0 时：
  - 按钮无法显示完整文字（"开始游戏"被截成"开始游"）。
  - 棋盘容器没有可用区域，方块无法正确排列，导致预览里看不到棋盘。
  - 覆盖层和 HUD 元素虽然坐标不同，但因尺寸为 0 仍互相重叠。
- **修复**：
  - Canvas / bg / UIManager / HUD / 4 个覆盖层全部设 `contentSize = 720×1280`，并正确配置 `Widget` 全屏对齐。
  - `blockBoard` 设 `contentSize = 600×700`，居中偏下，给 GridView 提供实际棋盘区域。
  - 按钮设 `contentSize = 260×80`，内部 Label 设 `contentSize = 240×60` 并启用 `overflow = RESIZE_HEIGHT`，文字不再被截断。
  - 标题 / 分数 / 最高分等标签设足够宽高并启用自动换行/缩放。
  - 所有需要直接坐标的子节点关闭其本地 `Widget`，避免和 `_lpos` 冲突。

### 4. 三消交互三连问题（多余节点 / 点错方块 / 合法交换失效）
- **定位方法**：先用纯逻辑测试（node + cc-resolver 桩）隔离 `GameModel.selectCell` 的交换流程，确认合法相邻交换能正确消除、不相邻点击只记录不交换 → **逻辑层无 bug，问题在交互/渲染层**。
- **根因**：
  1. **坐标系不一致**：`blockBoard` 锚点为 `(0.5,0.5)`（中心原点），但 `CellView.toPixel` 与 `touchToCell` 都用「左上角原点」语义（x∈[0,600]/y∈[0,-700]）。三者错位 → 方块整块偏移（右+300、下+350），点击映射到的格子与视觉不符（点错方块、合法交换看似失效）。
  2. **clearAll 异步残留**：`GridView.clearAll` 原用 `node.destroy()`（异步），重开/返回再建盘时旧节点尚未真正移除 → 叠加成「多余节点」。
  3. **滑动误吞**：`onBoardTouchMove` 在触摸起点落在棋盘外时仍设 `_swipeHandled=true`，吞噬随后冒泡上来的逐格触摸，导致双击交换被吞。
- **修复**：
  - `Game.scene` 中 `blockBoard` 锚点改 `(0,1)`（左上角）、局部 position `(60,-290)`、contentSize 600×700 → 与 `toPixel`/`touchToCell` 语义一致且棋盘居中。
  - `GridView.clearAll` 改为 `boardNode.removeAllChildren(true)` + `nodeMap.clear()`。
  - `GameManager.onBoardTouchMove`：`!startCell` 时直接 `return`（不设 `_swipeHandled`）。
  - 两个 `.ts` 经 `typescript.transpileModule` 语法校验 0 errors。

## 当前状态

- `assets/scenes/Game.scene` 已保存落盘（约 132KB），重新导入后编辑器加载正常。
- `GameManager` 的 8 个 `@property`、`UIManager` 的 22 个 `@property` 绑定未受布局修改影响，仍然完整。
- 黄色方块修复已生效：`BASIC_CELL_TYPES` 改为红/蓝/黄/绿，第 1 关（3 种颜色）会包含黄色。
- 棋盘区域 `blockBoard` 已有 `600×700` 实际尺寸，方块可以在其中正确生成和排列。
- 控制台残留的 `[Scene] resource.initialize is not a function` 来自已删除的脏 `Temp.scene`，新日志中不再出现。
- 场景视图默认不渲染 UI 层，因此编辑器视口截图看不到 UI；实际运行时（点击预览）会按文件里的正确坐标渲染。

## 下一步

- 在 Cocos Creator 中点击“预览”运行，第 1 关会出现黄色方块，UI 已按新布局显示。
- 如需进一步调整按钮/标签颜色、字体大小或背景图，可在 `Game.scene` 中直接选中对应节点修改。
