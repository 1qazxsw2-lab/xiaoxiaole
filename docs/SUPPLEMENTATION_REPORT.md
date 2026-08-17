# 三消游戏「XiaoXiaoLe」功能补充 · 汇编报告

- **主理人**：游承峰（游戏开发工作室 · 统筹）
- **评审强度**：lean（solo 开发，轻量协作，产物落明确路径）
- **日期**：2026-08-13
- **范围**：全量补充包（关卡 / 手势 / 计分 / 提示 / 存档 / UI外壳 / 飘字 + 音频·测试·构建规格）

---

## 一、编排方式

采用游戏开发工作室七阶段流水线，本次落在 **Phase 4（预制作）→ Phase 5（制作）**。主理人只编排、不建造，派六个专业成员分工产出，最终汇编。

分工两波：
- **Wave 1（规格/配置/测试，5 名）**：设计、美术、音频、质检、发布 —— 只产文档/配置/测试，不碰核心代码，零冲突。
- **Wave 2（落地，1 名）**：工程组，按 Wave 1 规格落地代码。

---

## 二、成员贡献与交付物

| 成员 | 职责 | 交付物 | 路径 |
|---|---|---|---|
| 设计 strategist | 关卡 + UX | 关卡系统 GDD、UX 流程状态机 | `docs/design/gdd-level.md`、`docs/design/ux-flow.md` |
| 美术 director | UI + 特效 | UI 视觉圣经、飘字规格 | `docs/art/ui-spec.md`、`docs/art/score-float-spec.md` |
| 音频 director | 音频 | 真实音频资产规格书 | `docs/audio/audio-spec.md` |
| 质检 lead | 测试 | 新核心回归测试（17 用例） | `test/gameModel.test.ts`、`docs/qa/test-plan.md` |
| 发布 lead | 构建 | Web/试玩广告构建方案 | `docs/release/build-web-playable.md` |
| 工程 lead | 代码 | 落地全部 7 项功能 | `assets/scripts/` 下新增/修改文件 |

---

## 三、工程落地（代码）

**新增文件**
- `assets/scripts/model/Levels.ts` —— 5 关数值表 `LEVELS`、`getLevelConfig(n)`、`LEVEL_COUNT`
- `assets/scripts/ui/UIManager.ts` —— 主菜单/暂停/胜/负 四覆盖层 + `UI_COLOR` 十六进制常量
- `assets/scripts/fx/ScoreFloatMgr.ts` —— 得分飘字（NodePool + tween + Label + UIOpacity，零外部资源）

**修改文件**
- `model/ConstValue.ts` —— 新增 `GameStatus` 枚举、`BASE_PER_BLOCK=10`、`CHAIN_STEP_BONUS=0.30`、`SCORE_PER_BLOCK=10`
- `model/GameModel.ts` —— 纯逻辑层加关卡状态 / 计分 / 提示 / 胜负守卫（核心 `findMatches/processCrush/down` 原封不动）
- `GameManager.ts` —— 集成全部 7 项，严守「只调 model / 播动画 / 触发 AudioManager / 更新 HUD」

**七个功能落点**
1. **关卡系统**：`GameModel` 新增 `level/movesLeft/targetScore/score/status`，`score` 上移为单一真相源；有效消除即时 −1 步；动画结束 `evaluate()` 结算，胜优先于负。
2. **连锁得分还原**：`commitMoveScore()` 含 `BASE_PER_BLOCK=10` + 轮次加成；`calcCascadeScore()` 为测试口径 `Σ(count×轮次序号)=9`。
3. **滑动手势**：`blockBoard` 节点触摸事件算方向选相邻格交换，与双击并存。
4. **提示系统**：空闲 5s 调 `findHint()` 高亮可消除对，任意输入取消。
5. **最高分存档**：`sys.localStorage`（键 `xxl_highscore`），主菜单/结算展示。
6. **UI 外壳**：`UIManager` 管理四覆盖层 `active` 切换，配色取自 `ui-spec.md`；不动 `blockBoard`。
7. **得分飘字**：`ScoreFloatMgr` 按 `crushRounds` 时间戳分批弹出 `+N`，与连锁音对齐。

**架构铁律遵守**：`GameModel` 仅 `import { Vec2, v2 }`（与原有 `CellModel` 同模式）；视图只消费 cmd；`AudioManager` 仅 `play(AudioEvent.X)`，未改 pitch/playbackRate；未引入特殊方块/障碍；`package.json` 未动。

---

## 四、验证结果

- **零依赖回归测试**：`node --experimental-loader ./test/stubs/cc-resolver.mjs --experimental-transform-types test/gameModel.test.ts` → **17 通过 / 0 失败 / 0 占位**（含"无连锁不误播连锁声"历史回归）。
- **TS 语法自检**：10 个 .ts 全部 `0 diagnostics`。
- **架构**：命令队列未破坏；`GameModel` 仍为纯逻辑。

---

## 五、需在 Cocos 编辑器手动完成（代码无法落地的部分）

1. **UI 节点**：Canvas 下建 `MainMenu / PauseOverlay / WinOverlay / LoseOverlay`（默认 `active=false`），按 `ui-spec.md §4` 放 Label/Button/Sprite。
2. **UIManager 引用**：挂组件并绑定 4 个 overlay、各 Label、各 Button、遮罩 Sprite（详见 `UIManager.ts` 的 `@property`）。
3. **GameManager 引用**：绑定 `uiManager`、`scoreFloatMgr`、`levelLabel/movesLabel/targetLabel`（原有 `blockPrefab/blockBoard/scoreLabel` 保留）。
4. **ScoreFloat 预制体**：建带 `Label`+`UIOpacity` 的 Node，拖到 `ScoreFloatMgr.floatPrefab`，挂到 `ScoreFloatLayer` 节点。
5. **滑动手势触达**：给 `blockBoard` 加 `UITransform`（600×700）使其成为可触摸区域。
6. **关卡入口**：`start()` 检测到 `uiManager` 时先 `showMainMenu()`，未配置则 `startLevel(1)` 兜底。

---

## 六、已知风险 / 待办

- **计分口径分离**：`calcCascadeScore`（测试）=9 不含 ×10；真实计分 `commitMoveScore` 含 ×10 + 连锁加成。二者分离、互不干扰。
- **音频**：仍为 Python 合成占位单音高；真实音效/BGM 待采买后按 `audio-spec.md` 同名替换（保留 `.meta`）。
- **构建**：`package.json` 脚本 **NO-GO**（待 Cocos CLI 验证）；编辑器可直接构建 Web。
- **暂停**：用 `isPaused` 标志冻结输入，未 `director.pause()`，保证 Web 下覆盖层按钮可点。

---

## 七、下一步建议

1. **最高优先级**：编辑器内按第五节接 UI 节点 + Prefab + Inspector，否则新功能不可见。
2. 试玩 L1–L3 调参（设计组建议胜率 ≥85%）。
3. 采买真实音频，替换占位。
4. 跑一次 Web 构建，验证体积/运行（参考 `build-web-playable.md`）。
