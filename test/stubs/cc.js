'use strict';
/*
 * cc 模块最小「运行时」存根（仅用于 Node 测试环境，脱离 Cocos 引擎）。
 *
 * GameModel / CellModel 在源码里 `import { Vec2, v2 } from 'cc'`：
 *   - Vec2 在运行时从未被当作值使用（只出现在类型标注上），会被 TS 擦除；
 *   - 真正在运行时用到的是 `v2(x, y)` —— 用来构造一个带 x / y 的坐标对象。
 *
 * 因此本存根只需提供 `v2` 即可，无需引入任何 Cocos 引擎代码。
 * 通过 NODE_PATH 注入（见 docs/qa/test-plan.md 的运行命令），让编译/转译后的
 * `require('cc')` 解析到本文件。
 */
function v2(x, y) {
    return { x: x === undefined ? 0 : x, y: y === undefined ? 0 : y };
}

// 仅为满足 ESM 命名导出链接而存在：源码里 `import { Vec2, v2 } from 'cc'` 中
// Vec2 只作为类型标注使用（运行时从不 new Vec2），这里提供一个占位值即可通过链接检查。
function Vec2(x, y) {
    this.x = x;
    this.y = y;
}

module.exports = { v2: v2, Vec2: Vec2 };
