# XiaoXiaoLe · 关卡系统设计文档（GDD：关卡系统）

- **版本 / 状态**：v0.1 设计稿（待工程评审 + 实测调参）
- **适用平台**：Cocos Creator 3.8 + TypeScript，Web / H5 试玩广告向（solo 作品集）
- **对齐代码**：`assets/scripts/model/GameModel.ts`、`GameManager.ts`、`model/ConstValue.ts`、`view/GridView.ts`、`view/CellView.ts`、`audio/AudioManager.ts`
- **硬约束**：不引入特殊方块 / 障碍 / 新颜色资产；难度只靠「颜色种类数 + 步数 + 目标分 + 初始布局」四个旋钮。

---

## 0. 设计支柱（Design Pillars）

1. **一眼可读（Readable）**：目标分、剩余步数、当前分数常驻 HUD，玩家 1 秒内理解「该干嘛」。
2. **即时满足（Satisfying）**：连锁消除给正反馈与加分放大；首关必赢，拉高试玩广告完成率。
3. **短时可控（Bounded）**：单关在 20–30s 内可决出胜负，适配 H5 试玩广告时长与收口转化。

> 设计红线自查：无主导策略（唯一目标=达标，手段无捷径可钻）、无经济失衡（单一分数货币）、无认知过载（HUD 仅 3 个数字 + 1 目标）、无支柱漂移（全部服务于「短时可玩的爽快三消」）。

---

## 1. 模式选择：步数限定 + 目标分（混合模式）

### 1.1 为何是混合模式（冷静期分析）

| 备选模式 | 问题 | 对试玩广告的适配度 |
|---|---|---|
| 纯限时（Timer） | H5 在低端机 / 切后台时时间易抖动；「还剩几秒」焦虑感强，首因体验差 | 低 |
| 纯目标分（无步数） | 玩家可无限刷分，单关时长不可控，广告无法稳定收口到「看完即转化」 | 低 |
| **步数限定 + 目标分** | 步数给清晰失败边界与可控时长；目标分给正向进度与低挫败；天然「再来一次」钩子 | **高** |

**结论**：步数提供「可控时长 + 明确成败」，目标分提供「正向进度 + 低挫败」，二者结合最适合 15–30s 试玩广告。步数同时是现成的 IAA 钩子（失败屏「看广告 +5 步」），对作品集商业化叙事是加分项（可选接入，见 ux-flow.md §2.5）。

### 1.2 规则定义

- **一步（Move）** = 一次「有效交换」：交换后全盘产生至少一处三连消除。
  - **无效交换（回弹）不消耗步数**（与现有 `selectCell` 回弹分支一致）。
- **胜（WIN）**：分数 ≥ 目标分。
- **负（LOSE）**：步数耗尽 **且** 分数 < 目标分。
- **胜优先于负**：同一步既用尽步数又达标 → 判 **WIN**（见 §4.5 边缘情况 1）。
- **死局（无解）**：由现有 `hasValidMove()` 检测，触发免费洗牌（不消耗步数，见 §4.5 边缘情况 4）。

---

## 2. 计分公式（与目标分对齐）

现有 `GameManager.addScore` 为 `score += died`（1 分/块、无连锁加成）。本 GDD 建议改为**连锁感知计分**，让「目标分」有技巧上限、奖励 cascade，数值更有意义。

```
常量（单位）：
  BASE_PER_BLOCK   = 10      // 分 / 被消除方块
  CHAIN_STEP_BONUS = 0.30    // 倍率 / 连锁轮次（无单位）

单步得分（单位：分，integer）：
  R        = crushRounds.length          // 本次消除的连锁轮数（0 基）
  moveScore = Σ_{k=0}^{R-1} [ crushRounds[k].count × BASE_PER_BLOCK × (1 + CHAIN_STEP_BONUS × k) ]
  score     = score + round(moveScore)
```

- `crushRounds[k].count` 由 `GameModel.processCrush()` 在每轮消除时压入（现有逻辑，未改动语义）。
- `Σ count` 恒等于本步死亡方块总数，与现有 `died` 一致；连锁越深，后续轮次倍率越高（1 → 1.3 → 1.6 …）。
- **兼容性说明**：若工程组坚持维持旧计分（1 分/块、无连锁），则下表的 `目标分` 需整体 ÷10（即 70 / 85 / 100 / 100 / 105）。本 GDD 默认采用新公式。

---

## 3. 五关难度曲线

难度旋钮：颜色种类（3 色更易、4 色基线）、步数、目标分、初始布局（通过 `cellTypeNum` 与可选种子实现，无需新美术资产）。

| 关 | 颜色数 `cellTypeNum` | 步数 `moves` | 目标分 `targetScore` | 初始布局差异 | 设计意图 |
|---|---|---|---|---|---|
| L1 | 3 | 20 | 700 | 3 色（更密集的相邻，连锁更频） | 教学 / 必赢，建立爽感 |
| L2 | 3 | 18 | 850 | 3 色 | 略收紧，仍宽松 |
| L3 | 4 | 25 | 1000 | 4 色（难度跳变） | 引入完整 4 色基线 |
| L4 | 4 | 22 | 1000 | 4 色 | 步数收紧，需稳定发挥 |
| L5 | 4 | 20 | 1050 | 4 色 | 终关：需高于平均的连锁效率 |

**预估可赚分与「紧张度」校验**（用于判断曲线合理性，非硬编码）：

```
单步均分估算（经验值，需实测）：
  3 色 ≈ 75 分/步（连锁频繁）
  4 色 ≈ 50 分/步（基线）

可赚分 ≈ moves × 单步均分
紧张度 = targetScore / 可赚分   （<1 宽松，≈1 临界，>1 需超常发挥）
```

| 关 | 可赚分估算 | 紧张度 | 判定 |
|---|---|---|---|
| L1 | ~1500 | 0.47 | 极宽松（首关必赢 ✅） |
| L2 | ~1350 | 0.63 | 宽松 |
| L3 | ~1250 | 0.80 | 舒适 |
| L4 | ~1100 | 0.91 | 偏紧，需稳定 |
| L5 | ~1000 | 1.05 | 临界，需良好连锁（终关天花板） |

> **调参须知（v1 待 playtest）**：以上为首发调参假设。验收标准建议——L1–L3（试玩广告实际展示段）胜率 ≥ 85%；若 L5 实测胜率 < 40%，优先把目标分降到 1000 或步数 +2。目标分只需改 `LevelConfig` 表，无需动逻辑。

**数据载体（建议，工程组落地）**：在 `model/` 下新增 `Levels.ts`（或并入 `ConstValue.ts` 末尾），导出 `LevelConfig[]`：

```ts
// 建议结构（伪代码，落地由工程组实现）
export interface LevelConfig {
  level: number;        // 关序号，从 1 起
  cellTypeNum: number;  // 颜色种类：3 或 4（受 BASIC_CELL_TYPES 长度约束，当前最大 4）
  moves: number;        // 步数上限
  targetScore: number;  // 目标分（基于 §2 公式）
  seed?: number;        // 可选：固定初始布局，保证试玩广告每局一致（见 §3.1）
}

export const LEVELS: LevelConfig[] = [
  { level: 1, cellTypeNum: 3, moves: 20, targetScore: 700 },
  { level: 2, cellTypeNum: 3, moves: 18, targetScore: 850 },
  { level: 3, cellTypeNum: 4, moves: 25, targetScore: 1000 },
  { level: 4, cellTypeNum: 4, moves: 22, targetScore: 1000 },
  { level: 5, cellTypeNum: 4, moves: 20, targetScore: 1050 },
];
```

### 3.1 初始布局差异（可选增强，不阻塞 v1）

- **颜色数差异**（已实现）：通过 `cellTypeNum` 切换 3 / 4 色，零新增资产。
- **种子化初始盘**（可选，推荐用于试玩广告稳定性）：当前 `init()` 用 `Math.random()`，每局布局不同。若希望广告每局体验一致，可引入轻量种子随机（如 `mulberry32`），在 `LevelConfig.seed` 存在时用种子初始化。`GameModel.init` 增加 `seed?` 参数即可，**不改动现有消除 / 下落逻辑**。

---

## 4. GameModel 需新增的状态字段与流程

### 4.1 新增状态字段（建议挂在 `GameModel`，逻辑层单一真相源）

| 字段 | 类型 | 初值 | 说明 |
|---|---|---|---|
| `level` | `number` | `1` | 当前关序号 |
| `movesLeft` | `number` | `0` | 剩余步数（每有效消除 −1） |
| `targetScore` | `number` | `0` | 目标分（来自 `LevelConfig`） |
| `score` | `number` | `0` | 当前累计分（**建议从 `GameManager` 上移到此处**，消除单一真相源；`GameManager` 仅读 `model.score` 刷新 Label） |
| `status` | `GameStatus` | `PLAYING` | 关卡状态机：见下 |

```ts
// 建议新增枚举（放 ConstValue.ts 或 GameModel.ts）
export enum GameStatus {
  PLAYING = 'playing',
  WIN  = 'win',
  LOSE = 'lose',
}
```

### 4.2 新增 / 调整方法（伪代码，逻辑层）

```ts
// —— GameModel 内新增 ——

/** 载入一关：写入关卡参数并（重）生成有解棋盘 */
loadLevel(cfg: LevelConfig): void {
  this.level = cfg.level;
  this.movesLeft = cfg.moves;
  this.targetScore = cfg.targetScore;
  this.score = 0;
  this.status = GameStatus.PLAYING;
  this.setCellTypeNum(cfg.cellTypeNum);
  do {
    this.init({ rows: GRID_HEIGHT, cols: GRID_WIDTH, cellTypeNum: cfg.cellTypeNum });
  } while (!this.hasValidMove());   // 复用现有「保证有解」逻辑
}

/** 把本步连锁回合折算成分数并累加（读取 crushRounds） */
commitMoveScore(): number {
  let s = 0;
  const R = this.crushRounds.length;
  for (let k = 0; k < R; k++) {
    s += this.crushRounds[k].count * BASE_PER_BLOCK * (1 + CHAIN_STEP_BONUS * k);
  }
  this.score += Math.round(s);
  return this.score;
}

/** 依据分数 / 步数回写 status（胜优先于负） */
evaluate(): void {
  if (this.score >= this.targetScore) this.status = GameStatus.WIN;
  else if (this.movesLeft <= 0)       this.status = GameStatus.LOSE;
}
```

### 4.3 `selectCell` 流程中「扣步数」与「胜负判定」的位置

**扣步数不在 `selectCell` 内部**（因 `selectCell` 在第一次点击时返回 `[]`，不应扣步）。扣步数发生在 **Controller 的 `onCellTouched` 判定 `matched === true` 的分支**，即 `GameManager.ts` 现有 `if (!matched) { … }` 的 **else 分支**（当前代码第 64–67 行附近）。此处是现有代码唯一区分「有效消除 / 无效回弹」的位置，天然对齐。

```ts
// GameManager.onCellTouched —— 在现有分支上接线（伪代码，标注插入点）

const changes = this.model.selectCell(v2(model.x, model.y));
if (changes.length > 0) {
  const matched = changes.some(m => m.isDeath);

  if (!matched) {
    // —— 现有「无效交换回弹」分支：不扣步数，原样保留 ——
    ...
  } else {
    // ——★ 插入点 A：有效消除，扣 1 步并立即刷新 HUD ——
    this.model.movesLeft -= 1;
    this.updateMoves();          // 读 model.movesLeft 刷新 movesLabel（即时反馈）

    this.clearSelection();
    this.isProcessing = true;
    AudioManager.inst?.play(AudioEvent.SWAP);
    // …… 现有连锁音排程（crushRounds）保持不变 ……

    const duration = this.view.playChanges(changes);
    this.scheduleOnce(() => {
      // ——★ 插入点 B：动画结束后累加分数 + 写 status + 切屏 ——
      this.model.commitMoveScore();   // 用 §2 公式累分
      this.updateScore();             // 读 model.score 刷新 scoreLabel
      this.isProcessing = false;
      this.model.evaluate();          // 回写 status（WIN / LOSE / 仍 PLAYING）

      if (this.model.status === GameStatus.WIN)  { this.showWin();  return; }
      if (this.model.status === GameStatus.LOSE) { this.showLose(); return; }
      if (!this.model.hasValidMove()) {          // 仍 PLAYING 且死局 → 免费洗牌
        AudioManager.inst?.play(AudioEvent.SHUFFLE);
        this.restartBoard();
      }
    }, duration);
  }
} else {
  // —— 现有「仅选中记录」分支：原样保留 ——
  ...
}
```

### 4.4 胜负压判定时序（关键）

- **扣步数**：有效交换当帧（`插入点 A`），HUD 步数即时 −1。
- **加分 + 胜负判定**：等本步消除动画播完（`scheduleOnce(duration)` 内，`插入点 B`）再结算——避免「还没看到消除就弹胜负面板」的割裂感。
- **`selectCell` 入口守卫**（建议加，防胜负已定后误触）：

```ts
selectCell(pos: Vec2): CellModel[] {
  if (this.status !== GameStatus.PLAYING) return [];   // 胜负已定 → 屏蔽输入
  // …… 现有逻辑不变 ……
}
```

### 4.5 边缘情况（≥3 类，工程组务必处理）

1. **步数刚好用尽且本步达标** → 判 **WIN**（胜优先）。`evaluate()` 先判 `score >= targetScore` 再判 `movesLeft <= 0`，顺序保证此行为。
2. **步数用尽且棋盘死局但分未达** → 直接 **LOSE**，不洗牌（洗牌只在 `status === PLAYING` 时触发）。`evaluate()` 先写 LOSE，`showLose()` 后不再进入 `hasValidMove` 分支。
3. **消除动画播放期间玩家连点** → `isProcessing` 已锁输入；动画结束后 `status` 已非 PLAYING，`selectCell` 守卫再兜底，连点被忽略。
4. **死局洗牌不消耗步数、不影响胜负** → 仅在 `status === PLAYING` 且 `movesLeft > 0` 且 `!hasValidMove()` 时洗牌；洗牌后继续本关，不重写 `targetScore` / `score`。
5. **关卡切换（下一关 / 重玩 / 返回再进）** → 必须经由 `loadLevel(cfg)` 重置 `movesLeft / targetScore / score / status`，禁止跨关残留（现有 `restartBoard` 只重盘不重置关卡参数，需改为调用 `loadLevel` 或显式重置字段）。
6. **暂停期间** → 不消耗步数、不接收棋盘输入；恢复后从原状态继续（`status` 仍为 PLAYING，`movesLeft` 不变）。见 ux-flow.md §2.3。
7. **目标分已达标但仍有步数** → 本设计选择「达标即结算 WIN」（契合试玩广告短时长）；若未来想「继续刷分」，把 `evaluate()` 的 WIN 判定改为由结算按钮触发即可，逻辑层无需大改。

---

## 5. 工程交接清单（关键字段 / 符号映射）

| 现有符号 | 文件 | 本 GDD 用法 |
|---|---|---|
| `selectCell(pos)` | GameModel | 入口加 `status` 守卫；内部**不改**扣步逻辑 |
| `changes.some(m => m.isDeath)` | GameManager.onCellTouched | 判定有效消除 → 扣步 + 累加分的触发点 |
| `crushRounds` | GameModel | 连锁计分输入（`commitMoveScore` 读取） |
| `hasValidMove()` | GameModel | 死局检测 → 免费洗牌 |
| `init({rows,cols,cellTypeNum})` | GameModel | `loadLevel` 调它生成有解盘 |
| `setCellTypeNum(num)` | GameModel | `loadLevel` 切 3 / 4 色 |
| `ANITIME` | ConstValue | 动画时长；暂停冻结 tween 的依据 |
| `AudioEvent` | AudioManager | 胜负可加 `WIN` / `LOSE` 事件（可选） |

**必须新增**：`GameStatus` 枚举、`GameModel.level/movesLeft/targetScore/score/status`、`loadLevel()`、`commitMoveScore()`、`evaluate()`；`GameManager` 上的 HUD 绑定属性与 `showWin/showLose/openPause` 等方法（见 ux-flow.md §3、§5）。

**禁止改动**：`findMatches / processCrush / down / exchangeCell` 等核心三消逻辑（本 GDD 不触碰消除规则本身）。

---

## 6. 一致性自检（设计红线）

- ✅ **无主导策略**：目标唯一（达标），无特殊方块可钻捷径。
- ✅ **无经济失衡**：单一分数货币，产出=消除，消耗仅步数，闭环稳定。
- ✅ **无认知过载**：HUD 仅「关 / 步 / 分 / 目标」四项，1 秒可读。
- ✅ **无支柱漂移**：全部服务于「短时可玩的爽快三消」，契合试玩广告向。
- ⚠️ **待验证**：L5 紧张度 1.05 需实测，详见 §3 调参须知。
```
