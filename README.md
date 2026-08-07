# 🍬 消消乐（三消小游戏）

基于 **Cocos Creator 3.8 + TypeScript** 独立开发的三消小游戏，从零实现完整游戏闭环。

**▶️ 在线试玩**：【部署后填入试玩链接】

## 功能

- 点击交换、无效交换回弹动画
- 三连及以上自动消除（放大 + 淡出动画）
- 下落补位 + 连锁消除（多轮串联，动画串行播放）
- 计分系统：单次消除 `数量 × 连锁轮数` 加成
- 无解棋盘自动重开（保证开局必有可行交换）
- 输入锁：动画播放期间禁止操作，杜绝乱序

## 架构设计：逻辑 / 表现 分离

```
┌─────────────────────────┐       ┌──────────────────────────┐
│  BoardLogic.ts（纯逻辑） │       │  GameManager.ts（表现层） │
│  - createBoard           │ 指令  │  - 消费 Move[] 指令       │
│  - findMatches           │──────▶│  - Promise 化 tween 动画  │
│  - removeMatches         │ Move[] │  - async/await 串行连锁  │
│  - collapseAndRefill     │       │  - 输入锁 isProcessing    │
│  - canMatchAfterSwap     │       │  - 计分 HUD              │
│  - hasValidMove          │       └──────────────────────────┘
│  - calcScore             │
└─────────────────────────┘
```

**核心思想**：规则与表现完全解耦。

- 逻辑层是**纯函数**，不依赖引擎 —— 可在 node 环境直接跑**单元测试**
- 表现层只消费逻辑层输出的**统一指令**（移动/下落/新建），动画编排不掺业务判断
- 修改规则不影响表现，换 UI 不影响规则

## 技术亮点

- **单元测试**：`temp/test/board.test.js`，23 个用例全绿（node 环境，无引擎依赖）
  - 500 次随机棋盘生成校验（尺寸/值域/无初始三连）
  - 消除-下落-连锁完整流程：终局无空格、无残留匹配
  - 计分规则、合法交换判定、边界情况
- **指令化**：`collapseAndRefill` 输出 `Move[]`（from/to/新建标记），表现层统一消费，消灭"逻辑与动画各写一套"的平行实现
- **动画串行**：Promise 化的 tween（`animateTo`/`animateSwap`/`animateEliminate`），`await Promise.all` 保证多块动画播完才进入下一轮
- **状态管理**：`isProcessing` 输入锁 + try/finally 释放，动画期间禁止交互

## 项目结构

```
assets/scripts/
├── BoardLogic.ts      # 纯逻辑层：棋盘生成/匹配/消除/下落/计分（可单测）
└── GameManager.ts     # 表现层：节点管理/动画编排/输入/计分 HUD
temp/test/
└── board.test.js      # node 单测（23 用例）
```

## 运行

1. 使用 **Cocos Creator 3.8.8** 打开项目，打开 `assets/scenes/Game.scene` 预览
2. 运行单测：`node temp/test/board.test.js`

## 操作

点击选中方块（高亮放大），再点击相邻方块交换；凑齐 3 个及以上同色即消除并连锁计分。
