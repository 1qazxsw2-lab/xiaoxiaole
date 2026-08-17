# GameModel 回归测试方案

> 三消游戏 XiaoXiaoLe · 新核心逻辑（`assets/scripts/model/GameModel.ts` 命令队列架构）回归测试
> 负责人：严守真（质量保障 / 测试） · 适用：solo 应届生作品集项目

---

## 0. 关键结论（先读）

- **新核心并不是"纯 TS 不 import cc"**。实测 `GameModel.ts` / `CellModel.ts` 仍 `import { Vec2, v2 } from 'cc'`。
  运行时真正用到的只是 `v2(x, y)`（构造坐标对象）；`Vec2` 仅作类型标注，会被擦除。
- 因此"脱离引擎跑测试"的做法是：**用最小 `cc` 运行时存根（只实现 `v2`）替换引擎依赖**，
  而不是真的加载 Cocos。存根放在 `test/stubs/cc.js`，通过 `test/stubs/cc-resolver.mjs` 这个
  ESM loader 在 Node 里把裸说明符 `cc` 重定向到它——**无需安装任何依赖、不修改 `assets/` 源码、不修改 `package.json`**。
- 测试用 **Node 22 原生 TS 能力**（`--experimental-transform-types`）直接加载 `.ts`，免去 `tsc` 编译步骤。
  本机 `node v22.22.2` 已满足；环境内没有 `tsc`、没有 `node_modules`，所以这条路径是"零安装"的。

---

## 1. 覆盖点（对应交付要求）

| # | 要求 | 用例 | 验证方式 |
|---|------|------|----------|
| 1 | 无连锁时 `crushRounds` 应为空（守历史回归） | 3 个用例 | ① 预置残留轮次后任意 `selectCell` 必须先清空；② 无效交换（回弹）后 `crushRounds` 为空；③ 成功级联后的"下一次操作"必须重置为空（直接守住"没连锁却响连锁声"） |
| 2 | 连锁轮次计数正确（`crushRounds.length == N`） | 2 个用例 | 用循环补块色固化出"交换后恰好 2 轮 / 3 轮级联"的确定布局，断言 `length` 与每轮 `{time,count}`、时间戳递增 |
| 3 | `findMatches` 哨兵扫描正确性 | 5 个用例 | 行三连 / 列三连 / 右·底边界三连 / 四连只算一组（4 格，非 6）/ 横竖交叉（十字 5 格） |
| 4 | `down()` 无空格 + 新方块 `setVisible` 时序 | 3 个用例 | 消除后棋盘填满无 `null`、尺寸不变；满棋盘不产生新方块；新方块 `setVisible(0,false)` 必须排在 `setVisible(curTime,true)` 之前（`startY<0` 从上方落入） |
| 5 | `hasValidMove` 死局= false / 有解= true | 3 个用例 | 经独立全交换校验 + 模型双重确认的无解 4×4 布局返回 `false`；存在有效交换返回 `true`；且不修改原棋盘 |
| 6 | 还原连锁得分（占位） | 1 个待对接用例 | 见第 4 节 |

**合计：17 个用例，16 通过 / 0 失败 / 1 占位。**

---

## 2. 如何运行

### 2.1 前置条件
- Node ≥ 22.6（本机 `v22.22.2`）。低于此版本无原生 TS transform，需回退到第 2.2 节的"编译后运行"。
- 无需 `npm install`、无需 Cocos 引擎。

### 2.2 直接运行（推荐，零安装）

在项目根目录执行：

```bash
node --experimental-loader ./test/stubs/cc-resolver.mjs \
     --experimental-transform-types test/gameModel.test.ts
```

输出示例（成功）：

```
✓ crushRounds：selectCell 入口必须先清空上一次残留（直接守住历史 bug）
✓ crushRounds：一次无效交换（无匹配→换回）后应为空
...
✓ hasValidMove：不修改原棋盘
• 连锁得分：数量×轮次加成（占位·待工程组对接 GameModel.calcCascadeScore）（待对接：...）

全部通过：16 通过 / 0 失败 / 1 占位
```

- 用例失败时进程以**非零退出码**退出（`process.exit(1)`），可作为 CI 通过/失败信号。
- `--experimental-loader` 与 `--experimental-transform-types` 会打印 ExperimentalWarning 到 stderr，属正常，不影响 stdout 判定与退出码。

### 2.3 原理（为什么这样能脱离引擎）
- `cc-resolver.mjs`：ESM 解析 loader，拦截裸说明符 `'cc'`，重定向到 `test/stubs/cc.js`。
- `cc.js`：运行时存根，仅 `module.exports = { v2, Vec2 }`；`v2` 返回 `{x, y}` 普通对象（满足 `Vec2` 运行时只读 `.x/.y` 的需求），`Vec2` 仅用于通过 ESM 命名导出链接检查。
- `cc.d.ts`：类型存根，给"需要把模型编译成 JS / IDE 类型检查"的场景用，运行期不需要。
- loader 同时为模型源码的**无扩展名相对导入**（`./CellModel`）补上 `.ts`，交给 `--experimental-transform-types` 转译（enum 等语法被正确处理）。

### 2.4 备选：先编译再运行（类旧 `BoardLogic` 流程，需 `tsc`）
若 CI 环境不便使用 Node 实验性 flag，可走项目既有 `test/README.md` 的编译路线：

```bash
# 需要任意 TypeScript ≥ 5.x（本机当前未安装，需先 npx i -D typescript）
npx tsc assets/scripts/model/GameModel.ts \
        assets/scripts/model/CellModel.ts \
        assets/scripts/model/ConstValue.ts \
        test/stubs/cc.d.ts \
        --outDir test/build --module commonjs --target es2017 --skipLibCheck --esModuleInterop
node test/gameModel.test.js   # 把测试改为 require('./build/.../GameModel.js')，并把 cc 解析交给 cc.js
```

> 注意：`cc.d.ts` 必须加入编译输入，否则 `import 'cc'` 找不到模块声明。编译产物的 `require('cc')` 在 Node 下可用 `NODE_PATH=./test/stubs node test/gameModel.test.js` 解析到 `cc.js`（CJS require 认 NODE_PATH；ESM 不认，所以此路线用编译后的 `.js` + CJS 更稳）。

---

## 3. CI 接入建议

1. **加 npm script**（在 `package.json` 的 `scripts` 增加，不引入新依赖）：
   ```json
   "scripts": {
     "test:model": "node --experimental-loader ./test/stubs/cc-resolver.mjs --experimental-transform-types test/gameModel.test.ts"
   }
   ```
   运行 `npm run test:model`，退出码即为测试结果。
2. **门禁**：CI 中 `npm run test:model` 失败即阻断合并（本测试失败会 `exit(1)`）。
3. **Node 版本**：在 CI 镜像固定 Node ≥ 22.6；或在流水线注释标明实验性 flag，待 Node 稳定支持后去掉 `--experimental-loader/--experimental-transform-types`。
4. **与旧测试共存**：`test/board.test.js`（测已废弃的 `BoardLogic.js`）保留作为历史对照，新核心以 `test/gameModel.test.ts` 为准；建议在新核心稳定后归档旧测试。
5. **测试稳定性**：本套件为纯逻辑、确定性（补块色用循环固定序列，无随机），无 flaky。若后续引入真实随机棋盘的模糊测试，需固定 `Math.random` 种子或断言"终局无空格/无匹配"的不变式而非精确轮次。

---

## 4. 连锁得分：占位与工程组对接点

当前 `GameModel` **尚未实现连锁得分 API**。测试第 6 项 `连锁得分：数量×轮次加成（占位）` 为**待对接占位**：

- 它先构造一个已知的 2 轮级联（与第 2 节同一布局），用 `crushRounds` 数据按预期公式算出期望得分：
  `expected = Σ round_i.count × (i+1)`（i 为 1-based 轮次序号）。
  对当前固化布局：`3×1 + 3×2 = 9`。
- 若 `GameModel` 已落地 `calcCascadeScore()`，取消该用例里的 `markPending(...)`，改为：
  `assertEq((m as any).calcCascadeScore(), expected, '连锁得分（数量×轮次）');`
  该用例即从"占位"变为"生效断言"，CI 会验证连锁加成。

**给工程组的交接点**：
1. 在 `GameModel` 上新增方法 `calcCascadeScore(): number`，建议在 `processCrush()` 末尾基于已收集的 `crushRounds` 计算
   （`crushRounds` 已有每轮 `count` 与 `time`，轮次序号即数组下标 +1）。
2. 确认加成口径：`数量 × 轮次`（即第 N 轮每个消除方块得分 ×N）。如需其它口径（如 `数量 × 轮次 × 基础分`），同步更新测试里的 `expected` 公式与注释。
3. 恢复后运行 `npm run test:model`，占位用例应自动转为通过；若口径不一致，用例会失败并精确指出期望/实际差值。

---

## 5. 文件清单

```
test/gameModel.test.ts        # 新增：GameModel 回归测试套件（本方案主体）
test/stubs/cc.js              # 新增：cc 运行时最小存根（仅 v2）
test/stubs/cc.d.ts            # 新增：cc 类型存根（编译/IDE 用）
test/stubs/cc-resolver.mjs    # 新增：ESM loader，把 'cc' 重定向到 cc.js 并补全 .ts 扩展名
docs/qa/test-plan.md          # 新增：本方案
test/board.test.js            # 既有：测已废弃的 BoardLogic.js（保留对照，建议后续归档）
```

> 约束遵守：未修改 `assets/scripts/` 下任何游戏代码，仅新增 `test/` 与 `docs/qa/` 文件。
