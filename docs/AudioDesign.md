# 三消游戏 · 音频系统设计文档

> 适用项目：开心消消乐（XiaoXiaoLe）/ Cocos Creator 3.8.8 + TypeScript
> 设计立场：**事件驱动 + 声音预算 + 自适应音乐参数**，全部落地为 Cocos 原生实现
> （FMOD / Wwise 是更强的同类方案，留作「正式发行」时的升级路径，见文末）

---

## 1. 声音身份（Sonic Identity）

用三个形容词定义游戏「应该听起来像什么」，所有后续决策都围绕它收敛：

| 维度 | 定义 | 落地含义 |
|------|------|---------|
| **明快（Crisp）** | 短促、干净、不拖泥带水 | 所有 SFX 控制在 0.3s 内，去尾、无长混响 |
| **愉悦（Playful）** | 糖果感、跳跃感 | 消除音用上行音程 / 木琴 / 玻璃质感；combo 升调 |
| **轻盈（Light）** | 不抢戏、不疲劳 | 背景乐低音量、无歌词、可无限循环 |

---

## 2. 音效清单（命名事件 + 触发点）

游戏代码**只调用 `AudioManager.inst.play(AudioEvent.XXX)`**，绝不写死资源路径。
每个事件对应一个 `@property` 拖入的 `AudioClip`，替换音效无需改代码。

| 事件名 | 触发时机（代码位置） | 设计说明 | 建议素材 |
|--------|----------------------|----------|----------|
| `SELECT` | `GameManager.onCellTouched` 选中首格 | 极轻的「滴」/ 软木塞，确认选择 | 短木琴单音 0.08s |
| `SWAP` | 第二次相邻点击、交换开始 | 「嗖」的位移感，与方块移动同步 | 上扫 whoosh 0.2s |
| `MATCH` | 交换就位后确认可消除 | 清脆「啵」/ 糖果破碎，主消除反馈 | 玻璃/木琴 0.25s |
| `BIG_MATCH` | 单次死亡方块 ≥5（大连消/连锁） | 比 MATCH 更厚、带一点上扬尾音 | 复合音 + 微闪 0.4s |
| `INVALID` | 交换就位后确认不可消除 | 低沉「噗」/ 否决感，配合回弹 | 下行短音 0.2s |
| `SHUFFLE` | 死局重开 / 洗牌 | 「哗啦」的洗牌感 | 颗粒噪声扫 0.5s |
| `MUSIC_BG` | `GameManager.start` 启动 | 循环背景乐，见第 3 节 | 60–90s 无缝循环 |

### Combo 升级（自适应参数在 SFX 层的体现）
`MATCH` / `BIG_MATCH` 的播放速率随死亡方块数升高：
```
rate = min(1.6, 1 + 0.1 * max(0, diedCount - 3))
```
死亡越多 → 音高越高 → 玩家「听到」自己打出了连锁。这是把「玩法状态」翻译成「听感」的最小闭环。

---

## 3. 自适应音乐设计

三消没有传统「战斗张力」，但**连锁（chain）就是它的张力曲线**。
设计一条 `Excitement`（兴奋度，0–1）参数：

| Excitement | 来源 | 音乐表现 |
|-----------|------|---------|
| 0.0 | 静止 / 选块 | 仅基础层（Base Layer） |
| 0.3 | 单次消除 | 基础层 + 轻打击点进入 |
| 0.6 | 2 连连锁 | 加和声层 |
| 1.0 | 3+ 连连锁 | 全编制 + 高频亮片 |

**当前实现（Cocos 原生，轻量）**：背景乐用独立循环 `AudioSource`；连锁兴奋度目前通过
`BIG_MATCH` 音效 + 升调体现，不强行切音乐层（避免无分层素材时硬切的违和感）。

**正式发行升级（FMOD/Wwise）**：把背景乐做成「Stem 分层」——
Base / Percussion / Harmony / Sparkle 四条 stem，由 `Excitement` 参数实时横向下文（re-sequencing），
而非简单上下层叠，更省内存、过渡更顺。届时只需在 `AudioManager` 增加
`setExcitement(v)` 并把音乐换成多 stem 事件即可，**游戏代码无需改动**。

---

## 4. 音频预算（性能 / 资源）

### 声音数（Voice Count）预算
| 平台 | 最大 SFX 声音数 | 策略 |
|------|----------------|------|
| 移动端（小游戏） | **12** | 超额回收最旧声音（见 `maxVoices`） |
| PC / 模拟器 | 24 | 同上 |

`AudioManager` 用**声音池**复用 `AudioSource`，永不超出 `maxVoices`，从根上杜绝低端机卡顿。

### 资源格式 / 内存
| 类别 | 格式 | 策略 |
|------|------|------|
| SFX（< 1s） | **ADPCM**（或压缩到内存） | 短音效全部解压进内存，零延迟 |
| 背景乐（长） | **Vorbis** + 流式（stream） | 边播边读，不占常驻内存 |

### CPU 预算
- 单帧音频 DSP 成本 < 1.5ms（移动端目标硬件实测）
- 本项目无空间音频射线（2D 三消），该预算项暂不使用

### 事件优先级（声音抢占顺序）
| 优先级 | 类型 | 抢占策略 |
|--------|------|----------|
| 0（高） | UI / SELECT / INVALID | 永不抢占 |
| 1 | MATCH / BIG_MATCH / SHUFFLE | 抢占最安静的 |
| 2（低） | 背景乐 | 常驻，受主音量约束 |

---

## 5. 工程集成方案（架构对齐）

### 分层原则（与现有 MVC 一致）
```
GameManager（Controller）── 唯一允许触发声音的地方
   ├─ 调 model.selectCell()        （纯逻辑，绝不发声）
   ├─ 按返回结果判定 matched / diedCount
   └─ 调 AudioManager.inst.play(事件名)   ← 所有声音入口
CellView / GridView（View）── 只演 cmd 动画，不发声
GameModel（Model）────────── 纯数据，不 import 任何音频
AudioManager（新增）──────── 事件→clip 映射 + 声音池 + 音乐
```
**关键**：音频是「状态反应」，必须放在知道「发生了什么」的 Controller 层。
`GameModel` 保持引擎无关（可单测），`CellView` 保持纯动画壳，二者都不碰声音。

### 结果判定（不污染 GameModel）
`selectCell` 返回 `changeModels: CellModel[]`，其中被消除的格子 `isDeath === true`。
Controller 用 `changes.filter(m => m.isDeath).length` 即可区分：
- `> 0` → 有效消除 → `MATCH` / `BIG_MATCH`
- `=== 0` → 无效回弹 → `INVALID`

无需给 `GameModel` 加任何字段，逻辑层保持纯净。

### 挂载步骤（Editor）
1. 场景里新建空节点，命名为 `AudioManager`，挂 `AudioManager` 组件。
2. 在 Inspector 把各 `AudioClip` 拖入对应属性（`selectClip` / `swapClip` / … / `bgClip`）。
3. `AudioManager.ts` 首次打开由 Creator 自动生成 `.meta`。
4. `GameManager` 已通过 `AudioManager.inst` 引用，无需额外连线。

---

## 6. 后续扩展路径

| 阶段 | 内容 | 是否改游戏代码 |
|------|------|----------------|
| 现在 | 命名事件 + 声音池 + combo 升调 + 背景乐 | 否（已完成） |
| 素材到位后 | 替换各 clip 为专业录制音效 | 否（仅拖资源） |
| 音乐分层 | `setExcitement(v)` 驱动 Base/Perc/Harmony/Sparkle 横切 | 否（仅 AudioManager 内部） |
| 正式发行 | 迁移到 FMOD / Wwise，事件名不变 | 否（仅 AudioManager 内部替换实现） |

> 设计铁律：**游戏代码永远只认「事件名」，不认「资源路径」**。
> 这正是中间件（FMOD/Wwise）的核心思想在 Cocos 原生下的等价落地。
