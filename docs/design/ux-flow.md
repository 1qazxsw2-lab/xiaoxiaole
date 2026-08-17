# XiaoXiaoLe · UX 流程与界面状态机（GDD：UX）

- **版本 / 状态**：v0.1 设计稿（待工程 + 美术评审）
- **适用平台**：Cocos Creator 3.8 + TS，Web / H5 试玩广告向（solo 作品集）
- **对齐代码**：`GameManager.ts`、`model/GameModel.ts`（§4 状态 / §5 胜负）、`ConstValue.ts`（画布与棋盘尺寸）
- **配套文档**：`docs/design/gdd-level.md`（关卡数值与胜负规则，本文件 UX 以其为准）

---

## 0. 画布与基础约定

- **设计分辨率**：竖屏 **720 × 1280**（H5 试玩广告主流比例；横屏广告可等比旋转，不在本稿范围）。
- **棋盘像素**：`GRID_WIDTH×CELL_WIDTH = 6×100 = 600` 宽，`GRID_HEIGHT×CELL_HEIGHT = 7×100 = 700` 高（`ConstValue.ts` 现有值）。
- **布局锚点**：棋盘以 `blockBoard` 节点为锚，居中偏下；顶部约 0–340px 为 HUD / 标题区；底部留白。
- **实现建议**：单场景（Game 场景）+ 覆盖式节点（MainMenu / PauseOverlay / WinOverlay / LoseOverlay），用 `node.active` 切换，避免多场景跳转带来的加载抖动（H5 尤佳）。所有覆盖层默认 `active = false`。
- **触摸区**：交互按钮最小 **120×120 px**（≈44pt），满足可访问性与误触容错。

---

## 1. 界面状态机（文字状态图）

```
[BOOT / 启动]
   └─(引擎 onLoad 完成)─> MainMenu

[MainMenu]  (主菜单，level 未载入)
   ├─ 点击「开始试玩 / Start」──> Game(level = 1)
   └─(可选)「关卡选择」────────> LevelSelect ──(选关)──> Game(level = n)
        （solo 作品集可省略 LevelSelect，直接进 L1）

[Game]  (status = PLAYING，HUD 常驻)
   ├─ 点击「暂停」按钮 ─────────> Pause        (覆盖层，整场景冻结)
   ├─ status → WIN  (分≥目标) ─> Win          (覆盖层)
   ├─ status → LOSE (步尽且分<目标) ─> Lose    (覆盖层)
   └─ 点击棋盘方块 ────────────── (交互，不切屏；isProcessing 期间忽略)

[Pause]  (覆盖层，游戏逻辑冻结)
   ├─「继续」──────────────────> Game   (恢复)
   ├─「重玩本关」──────────────> Game(level = 当前, loadLevel 重置)
   ├─「返回主菜单」────────────> MainMenu
   └─「静音」toggle ──────────── (不切屏，切 AudioManager 静音)

[Win]  (覆盖层)
   ├─ 有下一关:「下一关」──────> Game(level + 1, loadLevel)
   ├─ 最后一关:「再玩一次」────> Game(level = 1) 或 MainMenu
   └─「返回主菜单」────────────> MainMenu

[Lose]  (覆盖层)
   ├─「再试一次」──────────────> Game(level = 当前, loadLevel 重置)
   ├─(可选 IAA)「看广告 +5 步」─> Game(resume, movesLeft += 5, 关 Lose)
   └─「返回主菜单」────────────> MainMenu

[任意覆盖层打开时]：底层棋盘不再接收触摸（覆盖层拦截）；
                     主菜单 / 结算层打开时 Game 逻辑处于非 PLAYING，selectCell 守卫兜底。
```

> 状态切换的「真相源」是 `GameModel.status`（PLAYING/WIN/LOSE）+ 一组覆盖层 `active` 标志，二者由 `GameManager` 统一驱动，避免 UI 与逻辑状态分离（设计红线：无状态漂移）。

---

## 2. 屏幕清单与 UI 元素

### 2.1 主菜单 MainMenu

- **布局意图**：品牌名 + 单一强 CTA（开始），降低试玩广告入口摩擦；副按钮「关卡选择 / 静音」弱化处理。
- **UI 元素**：
  | 元素 | 类型 | 建议节点名 | 文本 / 资源 | 回调 |
  |---|---|---|---|---|
  | 标题 | Label | `titleLabel` | 「消消乐 XiaoXiaoLe」 | — |
  | 开始按钮 | Button | `startBtn` | 「开始试玩」 | `startLevel(1)` |
  | 关卡选择 | Button(可选) | `levelSelectBtn` | 「关卡」 | `openLevelSelect()` |
  | 静音 | Button(可选) | `muteBtn` | 「♪ / 🔇」 | `AudioManager.toggleMute()` |
  | 装饰 | Sprite | `decoSprite` | 示例方块拼图 | — |

### 2.2 游戏内 Game（HUD）

- **布局意图**：顶部信息条常驻；棋盘居中；暂停按钮右上角固定。
- **UI 元素**：
  | 元素 | 类型 | 建议节点名 | 文本 / 资源 | 绑定来源 |
  |---|---|---|---|---|
  | 关卡 | Label | `levelLabel` | 「第 1 关」 | `model.level` |
  | 剩余步数 | Label+图标 | `movesLabel` | 「步数 20」(大号) | `model.movesLeft`（有效消除即时 −1） |
  | 当前分数 | Label | `scoreLabel` | 「0」(大号) | `model.score`（动画结束刷新） |
  | 目标分 | Label+图标 | `targetLabel` | 「目标 700」 | `model.targetScore` |
  | 暂停按钮 | Button | `pauseBtn` | 「⏸」 | `openPause()` |
  | 棋盘 | Node | `blockBoard`(现有) | 6×7 棋盘 | `GridView` 现有 |

### 2.3 暂停 Pause（覆盖层）

- **布局意图**：半透明遮罩 + 居中面板；冻结整场景（`director.pause()` 或节点暂停），恢复后继续。
- **UI 元素**：
  | 元素 | 类型 | 建议节点名 | 文本 | 回调 |
  |---|---|---|---|---|
  | 遮罩 | Sprite | `pauseMask` | 半透明黑 | 拦截触摸 |
  | 面板 | Sprite | `pausePanel` | — | — |
  | 标题 | Label | `pauseTitle` | 「已暂停」 | — |
  | 继续 | Button | `resumeBtn` | 「继续」 | `closePause()` → 恢复 |
  | 重玩 | Button | `retryBtn` | 「重玩本关」 | `loadLevel(当前); closePause()` |
  | 主页 | Button | `homeBtn` | 「返回主菜单」 | `showMainMenu()` |
  | 静音 | Button | `muteToggle` | 「静音 / 取消」 | `AudioManager.toggleMute()` |

> **暂停实现注意**：动画 / 计时（`scheduleOnce`）随场景暂停一并冻结；恢复后胜负结算 `scheduleOnce` 继续触发，行为正确。建议 `pauseBtn` 在 `isProcessing`（消除动画中）置灰，避免动画被截断观感。

### 2.4 胜利结算 Win（覆盖层）

- **布局意图**：正向强化；明确「过关」与「下一关」CTA；展示本关得分。
- **UI 元素**：
  | 元素 | 类型 | 建议节点名 | 文本 | 回调 |
  |---|---|---|---|---|
  | 遮罩 | Sprite | `winMask` | 半透明（暖色） | 拦截触摸 |
  | 标题 | Label | `winTitle` | 「过关！」 | — |
  | 得分 | Label | `winScoreLabel` | 「得分 860」 | `model.score` |
  | 星评(可选) | Sprite×3 | `starNodes` | 按剩余步数给星 | — |
  | 下一关 | Button | `nextBtn` | 「下一关」 | `loadLevel(level+1)`（无下一关则改「再玩一次」） |
  | 主页 | Button | `homeBtn` | 「返回主菜单」 | `showMainMenu()` |

### 2.5 失败结算 Lose（覆盖层）

- **布局意图**：低挫败；提供「再试一次」即时重开；可选 IAA「看广告 +5 步」作为商业化钩子（作品集加分项）。
- **UI 元素**：
  | 元素 | 类型 | 建议节点名 | 文本 | 回调 |
  |---|---|---|---|---|
  | 遮罩 | Sprite | `loseMask` | 半透明 | 拦截触摸 |
  | 标题 | Label | `loseTitle` | 「步数用完」 | — |
  | 得分 | Label | `loseScoreLabel` | 「得分 640 / 目标 700」 | `model.score` / `targetScore` |
  | 再试 | Button | `retryBtn` | 「再试一次」 | `loadLevel(当前)` |
  | 看广告(可选) | Button | `adBtn` | 「看广告 +5 步」 | `movesLeft += 5; closeLose(); resume` |
  | 主页 | Button | `homeBtn` | 「返回主菜单」 | `showMainMenu()` |

---

## 3. 接口清单（工程组 / 美术组）

### 3.1 工程组（GameManager 需新增的 `@property` 绑定与方法）

```ts
// —— GameManager 新增绑定（示例，落地由工程组实现）——
@property(Label) levelLabel: Label = null;     // §2.2
@property(Label) movesLabel: Label = null;     // §2.2（即时刷新）
@property(Label) scoreLabel: Label = null;     // 现有，改读 model.score
@property(Label) targetLabel: Label = null;    // §2.2
@property(Node)  pauseBtn: Node = null;        // §2.2
@property(Node)  mainMenu: Node = null;        // §2.1 覆盖层
@property(Node)  pauseOverlay: Node = null;    // §2.3
@property(Node)  winOverlay: Node = null;      // §2.4
@property(Node)  loseOverlay: Node = null;     // §2.5

// —— 新增方法（与 gdd-level.md §4.3 接线）——
startLevel(level: number)        // 取 LevelConfig → model.loadLevel → 建盘 → 关覆盖层
openPause() / closePause()       // 切 pauseOverlay.active + director.pause/resume
showWin() / showLose()           // 切对应覆盖层.active（由 model.evaluate 结果驱动）
loadLevel(cfg)                   // 调 model.loadLevel，重建表现层（替换现有 restartBoard 的局部重置）
updateMoves() / updateScore() / updateLevel()  // 读 model 字段刷新 HUD
```

- **事件接线**：所有 Button 用 `button.click` → 上述方法；覆盖层 `active` 由 `GameManager` 统一控制，禁止 UI 节点自行改状态。
- **状态真相源**：`model.status`（PLAYING/WIN/LOSE）+ 覆盖层 `active`；切屏前先 `evaluate()`。
- **不要**：在 UX 层重复保存分数 / 步数（红色线：单一真相源在 `GameModel`）。

### 3.2 美术组（产出清单与规格）

| 资源 | 规格 | 备注 |
|---|---|---|
| 主菜单背景 / 标题字 | 720×1280，@2x | 品牌名 + 示例方块 |
| HUD 信息条 | 顶部条，关/步/分/目标 四槽位 | 步数、分数用**大号数字**（≥36px） |
| 步数 / 目标 图标 | 各 1 套（≥120×120） | 颜色之外用图标，照顾色盲（可访问性） |
| 暂停 / 胜 / 负 面板 | 各 1 套半透明遮罩 + 面板 | 暖色（胜）/ 中性（暂停）/ 冷色（负） |
| 按钮 NineSlice | 默认 + 按压态 | 最小 120×120 触摸区 |
| 星评图标（可选） | 3 连星（空/满） | 按剩余步数给星 |
| 字体 | 中文无衬线，常规 ≥28px，数字 ≥36px | H5 低端机可读性 |

---

## 4. 输入与可访问性（Accessibility）

- **可读性**：HUD 文本 ≥28px，关键数字（步数 / 分数）≥36px；高对比配色。
- **非色依赖**：HUD 的「步数 / 目标」除数字外配图标；棋盘方块本身靠色，但 HUD 信息不依赖色盲可辨。
- **触摸容错**：所有按钮 ≥120×120px；`isProcessing` 期间屏蔽棋盘输入（已有锁）。
- **动效可选降级**：`ANITIME`（ConstValue）已是常量，可在设置里提供「快进 / 减少动画」开关（作品集可访问性加分项）。
- **音频**：静音开关贯通 `AudioManager.toggleMute()`，主菜单 / 暂停均可达。

---

## 5. 与 GameManager 的接线点（端到端）

```
startLevel(1)
  └─ model.loadLevel(LEVELS[0])      // gdd-level §4.2
  └─ view.buildAll(model.getCells())
  └─ updateLevel/Moves/Score/Target() // 刷新 HUD
  └─ 关所有覆盖层

玩家有效消除
  └─ onCellTouched: matched===true
       ├─ model.movesLeft -= 1; updateMoves()        // 即时扣步
       └─ scheduleOnce(duration):
            ├─ model.commitMoveScore(); updateScore() // 累分
            ├─ model.evaluate()                       // 写 status
            ├─ WIN  → showWin()
            ├─ LOSE → showLose()
            └─ 仍 PLAYING & !hasValidMove → restartBoard()

showWin/showLose
  └─ 对应 overlay.active = true；底层 selectCell 守卫防误触

nextBtn / retryBtn / homeBtn
  └─ loadLevel(...) / showMainMenu() → 重置覆盖层 active
```

---

## 6. 一致性自检（设计红线）

- ✅ **状态单一真相源**：分数 / 步数 / 关卡参数只在 `GameModel`，UX 只读不写。
- ✅ **无认知过载**：主菜单 1 CTA；游戏内 HUD 4 项；结算层 2–3 按钮。
- ✅ **无支柱漂移**：所有界面服务「短时可玩的爽快三消」，契合试玩广告向。
- ✅ **无实现越界**：本稿不触碰 `.ts` 逻辑；仅规定节点名 / 绑定 / 方法签名供工程组落地。
- ⚠️ **待评审**：暂停用整场景 `director.pause()` 是否影响覆盖层按钮触摸——需在 Web 构建实测（必要时改为仅暂停 `GameManager` 节点 + tween 手动暂停）。
