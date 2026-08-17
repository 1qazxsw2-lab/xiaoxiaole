# XiaoXiaoLe · 得分飘字特效规格（Score Float FX）

> 适用：Cocos Creator 3.8 + TypeScript，Web/H5 试玩广告
> 现状：目前**没有任何飘字特效**，仅在 `GameManager.addScore` 里静默累加 `scoreLabel`。
> 本文档定义"每次消除时弹出得分飘字"的视觉与实现规格。**不依赖任何外部资源**（纯 tween / Label / UIOpacity / Graphics）。
> 配套文档：`ui-spec.md`（UI 视觉圣经，配色见其 §3.2）。

---

## 1. 触发时机（When）

- **每次发生消除**时触发：即 `GameManager.addScore` 中检测到 `died > 0`（本次 `changes` 存在 `isDeath` 的 `CellModel`）。
- **连锁（combo）分批飘**：现有 `GameModel.crushRounds` 已记录每一轮死亡的 `time` 与 `count`。飘字应**按 `crushRounds[].time` 时间戳分批弹出**，与 `MATCH/BIG_MATCH` 音效对齐，形成"啵—啵—啵"连续奖励感，而非只飘一次。
- **每段飘字数值**：该轮死亡块数 × 得分系数（见 §4）。

---

## 2. 出现位置（Where）

- **首选：消除中心**。取本轮所有死亡 `CellModel` 的网格坐标包围盒中心，按棋盘本地坐标换算后，转换到 **UI 层（Canvas / UI 相机）坐标**，在中心点上方弹出。
  - 棋盘本地坐标公式（与 `CellView.toPixel` 一致）：
    ```
    localX = centerCol * CELL_WIDTH  + CELL_WIDTH  / 2   // CELL_WIDTH = 100
    localY = centerRow * -CELL_HEIGHT - CELL_HEIGHT / 2   // CELL_HEIGHT = 100
    ```
  - 世界坐标：`blockBoardNode.getWorldPosition()` 叠加上述本地偏移（注意 `blockBoard` 是普通节点，非 UI 相机）。
  - 转 UI 坐标：用 `camera.convertToUINode(worldPos, uiContainerNode, outVec3)`（Cocos 3.x API），把结果作为飘字节点在 UI 容器下的 `position`。
- **回退：分数区**。若无法取得死亡中心（极端情况），则在 HUD `scoreLabel` 正上方固定偏移处弹出。
- 飘字节点挂在**独立的 UI 容器节点**（如 `ScoreFloatLayer`，位于 Canvas 下、棋盘之上），不受棋盘相机裁剪影响。

---

## 3. 动画（Animation）

三段式：**弹出 → 上浮保持 → 淡出**。总时长 ≈ **0.75s**，轻快不拖沓。

| 阶段 | 属性 | 起 → 终 | 时长 | 缓动 (Easing) |
|------|------|---------|------|----------------|
| 弹出 | `scale` | 0.6 → 1.0 | 0.18s | `backOut`（带回弹） |
| 上浮 | `position.y` | +0 → +70px | 0.6s | `quadOut`（先快后缓） |
| 保持 | `UIOpacity.opacity` | 255（不变） | 0.40s | — |
| 淡出 | `UIOpacity.opacity` | 255 → 0 | 0.25s | `quadIn` |

- **组合**：弹出与上浮同步开始；淡出在上浮进行到 0.40s 后并行启动（见 §6 伪代码 `parallel`）。
- **轻微横向抖动（可选）**：大消除（count≥5）可加 `position.x` ±8px 的正弦微抖，增强"爆发"感；普通消除不加。
- **缩放收尾（可选）**：淡出末端 `scale` 1.0 → 1.12，让文字"膨胀消散"。
- 与棋盘 `toDie`（缩放消失）同属"Q 弹"手感，缓动风格保持统一。

---

## 4. 文本内容（Text）

- **格式**：`"+" + 本轮得分`，如 `"+30"`、`"+90"`。
- **得分系数建议**（当前 `GameManager.addScore` 仅 `score += died`，数值偏小）：
  - 建议引入常量 `SCORE_PER_BLOCK = 10`，本轮得分 = `died × 10`；
  - 连锁奖励：`+ died × 10 × comboMultiplier`（如第 2 轮 ×1.2，第 3 轮 ×1.5），让连锁飘字更大更爽。
  - 例：3 连消除 → `"+30"`（契合试玩广告"一碰就 +30"的爽感）。
- 文本**右对齐或居中**于飘字节点；数字用 `Label` + 等宽/粗体。

---

## 5. 字号与颜色（Typography & Color）

- **字号**：**44px Bold**（设计分辨率 720×1280），大消除可放大到 **52px**。
- **默认配色**（在彩色棋盘上保证可读）：
  - 填充 `Label.color` = `#FFFFFF`（白）
  - 描边 `Label.Outline` = `#3A2A6E`（深紫，源于 `ui-spec.md` §3.2 的 BLUE 派生），宽度 **5px**
  - 阴影 `Label.Shadow` = `#1A1240`（更深紫），偏移 (2, −2)，模糊 4
- **变体（可选，增强反馈）**：
  - **金色变体**（大消除 / 连锁）：填充 `#FFE36E`，描边 `#7A3B00` —— 呼应 `ACCENT_GOLD`。
  - **按方块色着色**：取本轮主色块 `type` 软化为飘字色（RED→`#FF5370`、GREEN→`#2ECC71`、BLUE→`#4D8BFF`、YELLOW→`#FFD23F`），与消除块同色，强化"这块消了得分"的因果感。
- **同屏上限**：建议 ≤ **8** 个飘字；超出时合并为更大的 `"+N"` 或忽略最旧者，避免 UI 拥挤。

---

## 6. 工程实现提示（Implementation Notes · Cocos）

> 仅用引擎内置能力：`tween` / `Label` / `UIOpacity` / `Graphics` / `NodePool`，**不引入贴图、字体、粒子等外部资源**。

### 6.1 预制体 `ScoreFloat`（`ScoreFloatLayer` 下）
- 节点结构：`Node(ScoreFloat)` → 挂 `Label`（开 Outline + Shadow）+ `UIOpacity`。
- 背景可选：`Graphics` 画一个半透明圆角胶囊托底（提升任意底色上的可读性），**非必须**。

### 6.2 管理器 `ScoreFloatMgr.ts`（挂在 `ScoreFloatLayer` 节点）
- 持有 `NodePool` 复用飘字节点，避免频繁 `instantiate`/`destroy` 造成 GC 卡顿。
- 对外暴露 `spawn(text, uiPos: Vec3, colorHex?: string)`。

### 6.3 伪代码（示意，非交付代码）
```ts
// ScoreFloatMgr.ts（挂 UI 容器节点上）
import { _decorator, Component, Label, Node, UIOpacity, tween, Vec3, NodePool, instantiate, Prefab, Color } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('ScoreFloatMgr')
export class ScoreFloatMgr extends Component {
    @property(Prefab) floatPrefab: Prefab = null;
    private pool = new NodePool();

    /** text: "+30"；uiPos: UI 容器下的本地坐标；colorHex: 可选十六进制 */
    spawn(text: string, uiPos: Vec3, colorHex?: string) {
        let node = this.pool.get();
        if (!node) node = instantiate(this.floatPrefab);
        node.setParent(this.node);
        node.setPosition(uiPos.x, uiPos.y, 0);
        node.setScale(0.6, 0.6, 1);

        const label = node.getComponent(Label)!;
        label.string = text;
        if (colorHex) label.color = new Color().fromHEX(colorHex);

        const ui = node.getComponent(UIOpacity)!;
        ui.opacity = 255;

        const endY = uiPos.y + 70;
        tween(node)
            .to(0.18, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' })
            .parallel(
                tween(node).to(0.6, { position: new Vec3(uiPos.x, endY, 0) }, { easing: 'quadOut' }),
                tween(ui).delay(0.4).to(0.25, { opacity: 0 }, { easing: 'quadIn' })
            )
            .call(() => this.pool.put(node))
            .start();
    }
}
```

### 6.4 接入 `GameManager`（不改棋盘逻辑，仅扩展计分回调）
```ts
// 在 GameManager.addScore 中，died > 0 时：
// 1) 计算死亡块中心 UI 坐标（见 §2 公式 + camera.convertToUINode）
// 2) 按 crushRounds 时间戳分批调用 scoreFloatMgr.spawn("+" + roundScore, uiPos, color)
// 3) 普通消除：一次 spawn；连锁：对每轮 round 用 scheduleOnce(spawn, round.time) 对齐音效
```
- `GameManager` 需新增一个 `@property(ScoreFloatMgr)` 或 `@property(Node) scoreFloatLayer` 引用，在 `start()` 里取到 `ScoreFloatMgr` 实例。
- 坐标换算依赖 `blockBoard` 节点与世界/UI 相机；若项目 UI 与棋盘共用同一相机，可省去 `convertToUINode`，直接把本地坐标加 `blockBoard` 的世界位置。

---

## 7. 性能与边界（Performance & Edge Cases）

- **对象池**：预置池容量 ~16，满足 6×7 棋盘最大同屏死亡数（≤42，但飘字分批、短时存在，16 足够周转）。
- **零 GC 压力**：复用 `NodePool`，淡出后 `put` 回池，不 `destroy`。
- **可访问性**：飘字为纯视觉反馈，**不得**作为唯一得分提示——分数仍同步写入 `scoreLabel`（既有的 HUD），满足色盲/读屏用户。
- **试玩广告适配**：动画总时长 ≤ 0.8s，保证快速连续消除时反馈跟手；H5 低端机无额外 DrawCall 压力（Label 合批）。

---

### 对接清单（给工程组）
1. 新增 `ScoreFloat` 预制体 + `ScoreFloatMgr.ts`（§6.1–6.2）。
2. `GameManager` 增加 `scoreFloatMgr` 引用，在 `addScore` 的 `died>0` 分支触发（§6.4）。
3. 坐标换算：死亡中心 → UI 坐标（§2）。
4. 建议引入 `SCORE_PER_BLOCK=10` 与连锁系数，使飘字呈现 `"+30"` 量级（§4）。
5. 颜色默认白+深紫描边；可选金色/方块同色变体（§5）。
