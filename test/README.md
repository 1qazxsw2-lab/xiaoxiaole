# 逻辑层单元测试

三消核心逻辑（`assets/scripts/BoardLogic.ts`）的单元测试，共 23 个用例。

## 设计说明

- **零依赖**：不引入 Jest 等框架，测试脚手架只有两个函数（`test` / `assert`），Node 直接运行
- **为什么可以这样做**：BoardLogic 不 import 任何 Cocos 模块（纯 TypeScript、纯数据结构），因此可以脱离引擎在 Node 环境独立测试——这正是逻辑层/表现层分离架构的直接收益
- **覆盖范围**：createBoard（3）/ findMatches（5）/ removeMatches（2）/ collapseAndRefill（4）/ 完整连锁流程（2）/ calcScore（2）/ canMatchAfterSwap（3）/ hasValidMove（2）

## 运行

```bash
node test/board.test.js
```

输出 `全部通过：23 通过 / 0 失败` 即为通过；有用例失败时进程以非零码退出，可接入 CI。

## 修改 BoardLogic.ts 后重新编译

测试跑的是编译产物 `test/build/BoardLogic.js`，改动 TS 源码后需要重新编译：

```bash
tsc assets/scripts/BoardLogic.ts --outDir test/build --module commonjs --target es2017 --skipLibCheck
node test/board.test.js
```

（任意全局或项目内 TypeScript ≥ 5.x 均可）
