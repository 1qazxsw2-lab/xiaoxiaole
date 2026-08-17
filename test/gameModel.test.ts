// =============================================================================
// GameModel 回归测试（Node 环境，零依赖，不加载 Cocos 引擎）
// -----------------------------------------------------------------------------
// 运行（项目根目录）：
//   node --experimental-loader ./test/stubs/cc-resolver.mjs \
//        --experimental-transform-types test/gameModel.test.ts
//
// 约定（沿用 test/board.test.js 的「纯函数 + 断言」零依赖框架）：
//   - test(name, fn)          ：运行一个用例，统计 pass/fail
//   - assert(cond, msg)       ：条件断言
//   - assertEq(a, b, msg)     ：相等断言（即「返回结果函数 + 比较结果函数」模式：
//                               先拿到被测结果，再与期望值比较）
//   - assertSetEq(a, b, msg)  ：集合相等断言
//
// 关于「脱离引擎」：GameModel / CellModel 源码 `import { Vec2, v2 } from 'cc'`，
// 运行时只用到 v2（构造坐标对象）。本测试用 test/stubs/ 下的 cc.js（最小运行时存根）
// + cc-resolver.mjs（ESM loader，把裸说明符 'cc' 重定向到该存根），从而无需 Cocos 引擎。
// 详见 docs/qa/test-plan.md。
// =============================================================================

import GameModel from '../assets/scripts/model/GameModel';
import { CellType, ANITIME } from '../assets/scripts/model/ConstValue';
import { v2 } from 'cc';

// ---------- 简易测试框架 ----------
let pass = 0, fail = 0, pending = 0;
function test(name: string, fn: () => void): void {
    try { fn(); console.log('✓ ' + name); pass++; }
    catch (e: any) { console.log('✗ ' + name + ' — ' + e.message); fail++; }
}
const PENDING = Symbol('pending');
function markPending(reason: string): never {
    const e: any = new Error(reason);
    e[PENDING] = true;
    throw e;
}
// 占位用例：当前 API 未落地时记为「待对接」（不计入失败，便于 CI 保持绿）。
function todoTest(name: string, fn: () => void): void {
    try { fn(); console.log('✓ ' + name); pass++; }
    catch (e: any) {
        if (e && e[PENDING]) { console.log('• ' + name + '（待对接：' + e.message + '）'); pending++; }
        else { console.log('✗ ' + name + ' — ' + e.message); fail++; }
    }
}
function assert(cond: any, msg?: string): void { if (!cond) throw new Error(msg || '断言失败'); }
function assertEq(a: any, b: any, msg?: string): void {
    if (a !== b) throw new Error((msg || '') + `：期望 ${JSON.stringify(b)}，实际 ${JSON.stringify(a)}`);
}
function assertSetEq(a: Set<string>, b: Set<string>, msg?: string): void {
    const miss = [...b].filter(k => !a.has(k));
    const extra = [...a].filter(k => !b.has(k));
    if (miss.length || extra.length) {
        throw new Error((msg || '') + `：缺少 [${miss}]，多余 [${extra}]（期望 ${[...b].join(',')}）`);
    }
}

// ---------- 棋盘辅助 ----------
const COLOR: Record<string, CellType> = {
    red: CellType.RED, blue: CellType.BLUE, green: CellType.GREEN, yellow: CellType.YELLOW,
};
// 用颜色字符串二维数组（layout[y][x]）覆盖棋盘类型，便于构造确定用例
function applyLayout(m: GameModel, layout: string[][]): void {
    for (let y = 0; y < layout.length; y++)
        for (let x = 0; x < layout[y].length; x++)
            m.cells[y][x]!.type = COLOR[layout[y][x]];
}
// findMatches 返回的 Vec2[] 转成 "x_y" 字符串集合（结果函数）
function matchKeySet(matches: { x: number; y: number }[]): Set<string> {
    return new Set(matches.map(p => `${p.x}_${p.y}`));
}
// 循环补块色：R,B,G,R,B,G... 按调用顺序分配给各列顶部空缺。
// 这样顶部行得到 R,B,G,R...（相邻不同色，不形成横向三连），单列补块也是 R,B,G 交替
// （不形成竖向三连），级联必然终止且完全确定——用来构造可复现的多轮级联用例。
function makeCyclingFill(): () => CellType {
    const pool = [CellType.RED, CellType.BLUE, CellType.GREEN];
    let i = 0;
    return () => pool[i++ % 3];
}
function typeSnapshot(m: GameModel): string {
    return m.cells.map(r => r.map(c => c ? c.type : 'null').join(',')).join('|');
}

// =============================================================================
// 1) 无连锁时 crushRounds 应为空（守住历史回归：selectCell 未清空导致「没连锁却响连锁声」）
// =============================================================================
test('crushRounds：selectCell 入口必须先清空上一次残留（直接守住历史 bug）', () => {
    const m = new GameModel();
    m.init({ rows: 4, cols: 4, cellTypeNum: 3 });
    // 模拟旧 bug：上一次操作残留了轮次数据
    (m as any).crushRounds = [{ time: 0, count: 3 }, { time: 1, count: 5 }];
    // 任意一次 selectCell（哪怕只是首次点击记录位置）都应先清空 crushRounds
    const ret = m.selectCell(v2(0, 0));
    assertEq(ret.length, 0, '首次点击应返回空变更');
    assertEq(m.crushRounds.length, 0, 'selectCell 未清空 crushRounds（历史回归未守住）');
});

test('crushRounds：一次无效交换（无匹配→换回）后应为空', () => {
    const m = new GameModel();
    m.init({ rows: 3, cols: 3, cellTypeNum: 3 });
    // 无初始匹配、且交换相邻格不会产生三连的布局
    applyLayout(m, [
        ['red', 'blue', 'red'],
        ['green', 'red', 'green'],
        ['blue', 'green', 'blue'],
    ]);
    assertEq(m.findMatches().length, 0, '布局不应有初始匹配');
    // 第一次点击 (0,0)，第二次点击相邻 (0,1) → 交换但无三连 → 回弹
    m.selectCell(v2(0, 0));
    m.selectCell(v2(0, 1));
    assertEq(m.crushRounds.length, 0, '无匹配的交换不应产生连锁轮次');
    // 回弹应把两个格子都记入动画（moveToAndBack → 含 moveTo 指令）
    assert(m.changeModels.length >= 2, '回弹应记录两个被交换格子');
    const hasMove = m.changeModels.some(c => c.cmd.some(cmd => cmd.action === 'moveTo'));
    assert(hasMove, '回弹动画缺少 moveTo 指令');
});

test('crushRounds：成功级联后，下一次操作必须重置为空（不残留→不误播连锁声）', () => {
    const m = new GameModel();
    m.init({ rows: 5, cols: 4, cellTypeNum: 3 });
    applyLayout(m, [
        ['blue', 'green', 'blue', 'green'],
        ['green', 'blue', 'blue', 'red'],
        ['blue', 'blue', 'red', 'blue'],
        ['blue', 'green', 'green', 'red'],
        ['green', 'blue', 'green', 'green'],
    ]);
    m.getRandomCellType = makeCyclingFill();
    m.selectCell(v2(1, 0));
    m.selectCell(v2(2, 0));
    assertEq(m.crushRounds.length, 2, '前置：此处应产生 2 轮级联');
    // 下一次操作（仅记录一次点击，不构成交换）必须清空轮次
    m.selectCell(v2(4, 4));
    assertEq(m.crushRounds.length, 0, '级联后的下一次操作仍残留轮次（历史回归）');
});

// =============================================================================
// 2) 连锁轮次计数正确（一次操作产生 N 轮级联时 crushRounds.length == N）
// =============================================================================
test('crushRounds.length：一次操作产生 2 轮级联时应为 2', () => {
    const m = new GameModel();
    m.init({ rows: 5, cols: 4, cellTypeNum: 3 });
    applyLayout(m, [
        ['blue', 'green', 'blue', 'green'],
        ['green', 'blue', 'blue', 'red'],
        ['blue', 'blue', 'red', 'blue'],
        ['blue', 'green', 'green', 'red'],
        ['green', 'blue', 'green', 'green'],
    ]);
    m.getRandomCellType = makeCyclingFill();
    m.selectCell(v2(1, 0));
    m.selectCell(v2(2, 0));
    assertEq(m.crushRounds.length, 2, '轮次计数错误');
    // 校验每轮 {time, count}：第 1 轮 3 个（time=0.3=TOUCH_MOVE），第 2 轮 3 个（time=1.0=DIE 后）
    assertEq(m.crushRounds[0].count, 3, '第 1 轮消除数量');
    assertEq(m.crushRounds[1].count, 3, '第 2 轮消除数量');
    assertEq(m.crushRounds[0].time, ANITIME.TOUCH_MOVE, '第 1 轮时间戳');
    assert(m.crushRounds[1].time > m.crushRounds[0].time, '轮次时间戳应递增');
});

test('crushRounds.length：一次操作产生 3 轮级联时应为 3', () => {
    const m = new GameModel();
    m.init({ rows: 5, cols: 4, cellTypeNum: 3 });
    applyLayout(m, [
        ['red', 'green', 'blue', 'blue'],
        ['red', 'blue', 'green', 'green'],
        ['blue', 'red', 'blue', 'blue'],
        ['green', 'blue', 'red', 'green'],
        ['red', 'red', 'green', 'green'],
    ]);
    m.getRandomCellType = makeCyclingFill();
    m.selectCell(v2(1, 2));
    m.selectCell(v2(1, 3));
    assertEq(m.crushRounds.length, 3, '3 轮级联计数错误');
    assertEq(m.crushRounds[0].count, 4, '第 1 轮数量');
    assertEq(m.crushRounds[1].count, 6, '第 2 轮数量');
    assertEq(m.crushRounds[2].count, 3, '第 3 轮数量');
    // 时间戳必须严格递增（级联按时间轴展开）
    for (let i = 1; i < m.crushRounds.length; i++)
        assert(m.crushRounds[i].time > m.crushRounds[i - 1].time, `第 ${i + 1} 轮时间戳未递增`);
});

// =============================================================================
// 3) findMatches 哨兵扫描正确性（行/列三连、边界、四连只算一组）
// =============================================================================
test('findMatches：检测横向三连', () => {
    const m = new GameModel();
    m.init({ rows: 3, cols: 3, cellTypeNum: 3 });
    applyLayout(m, [
        ['red', 'red', 'red'],
        ['blue', 'green', 'blue'],
        ['green', 'blue', 'green'],
    ]);
    assertSetEq(matchKeySet(m.findMatches()), new Set(['0_0', '1_0', '2_0']), '横向三连坐标');
});

test('findMatches：检测纵向三连', () => {
    const m = new GameModel();
    m.init({ rows: 3, cols: 3, cellTypeNum: 3 });
    applyLayout(m, [
        ['red', 'blue', 'green'],
        ['red', 'green', 'blue'],
        ['red', 'blue', 'green'],
    ]);
    assertSetEq(matchKeySet(m.findMatches()), new Set(['0_0', '0_1', '0_2']), '纵向三连坐标');
});

test('findMatches：右边界/底边界三连被正确识别', () => {
    // 右边界：6 宽棋盘第 0 行 x=3,4,5 三连
    const mr = new GameModel();
    mr.init({ rows: 3, cols: 6, cellTypeNum: 3 });
    applyLayout(mr, [
        ['blue', 'green', 'blue', 'red', 'red', 'red'],
        ['green', 'blue', 'green', 'blue', 'green', 'blue'],
        ['blue', 'green', 'blue', 'green', 'blue', 'green'],
    ]);
    assertSetEq(matchKeySet(mr.findMatches()), new Set(['3_0', '4_0', '5_0']), '右边界三连');

    // 底边界：7 高棋盘第 0 列 y=4,5,6 三连
    const mb = new GameModel();
    mb.init({ rows: 7, cols: 3, cellTypeNum: 3 });
    applyLayout(mb, [
        ['red', 'blue', 'green'],
        ['blue', 'green', 'blue'],
        ['green', 'blue', 'green'],
        ['blue', 'green', 'blue'],
        ['red', 'blue', 'green'],
        ['red', 'green', 'blue'],
        ['red', 'blue', 'green'],
    ]);
    assertSetEq(matchKeySet(mb.findMatches()), new Set(['0_4', '0_5', '0_6']), '底边界三连');
});

test('findMatches：四连只算「一组」共 4 格，不重复计为 6', () => {
    const m = new GameModel();
    m.init({ rows: 3, cols: 4, cellTypeNum: 3 });
    applyLayout(m, [
        ['red', 'red', 'red', 'red'],
        ['blue', 'green', 'blue', 'green'],
        ['green', 'blue', 'green', 'blue'],
    ]);
    const ms = m.findMatches();
    assertEq(ms.length, 4, '四连应返回 4 格（而非 6 或更多）');
    assertSetEq(matchKeySet(ms), new Set(['0_0', '1_0', '2_0', '3_0']), '四连坐标');
});

test('findMatches：横竖交叉（十字）合并计为 5 格', () => {
    const m = new GameModel();
    m.init({ rows: 3, cols: 3, cellTypeNum: 3 });
    applyLayout(m, [
        ['blue', 'red', 'blue'],
        ['red', 'red', 'red'],
        ['blue', 'red', 'blue'],
    ]);
    assertSetEq(matchKeySet(m.findMatches()),
        new Set(['1_0', '0_1', '1_1', '2_1', '1_2']), '十字 5 格');
});

// =============================================================================
// 4) down() 后无空格（棋盘填满）且新方块有正确的 setVisible 时序（先隐藏后显示）
// =============================================================================
test('down()：消除后棋盘被填满，无空格(-1/null)', () => {
    const m = new GameModel();
    m.init({ rows: 6, cols: 6, cellTypeNum: 4 });
    // 人为制造若干空缺（模拟消除后的空洞）
    m.cells[2][0] = null;
    m.cells[3][1] = null;
    m.cells[5][4] = null;
    m.curTime = ANITIME.DIE; // 模拟级联中途时刻，使新方块 setVisible 时序有意义
    m.down();
    let nullCount = 0;
    m.cells.forEach(row => row.forEach(c => { if (!c) nullCount++; }));
    assertEq(nullCount, 0, 'down() 后仍存在空格');
    assertEq(m.cells.length, 6, '行数被破坏');
    m.cells.forEach(r => assertEq(r.length, 6, '列数被破坏'));
});

test('down()：满棋盘调用不产生任何新方块', () => {
    const m = new GameModel();
    m.init({ rows: 5, cols: 5, cellTypeNum: 4 });
    const ids = new Set(m.cells.flat().filter(Boolean).map(c => c!.objectCount));
    m.curTime = ANITIME.DIE;
    m.down();
    const newCells = m.cells.flat().filter(c => c && !ids.has(c.objectCount));
    assertEq(newCells.length, 0, '满棋盘不应生成新方块');
});

test('down()：新方块 setVisible 时序为「先隐藏(0,false)后显示(curTime,true)」', () => {
    const m = new GameModel();
    m.init({ rows: 6, cols: 6, cellTypeNum: 4 });
    m.cells[2][0] = null;
    m.cells[4][3] = null;
    const beforeIds = new Set(m.cells.flat().filter(Boolean).map(c => c!.objectCount));
    m.curTime = ANITIME.DIE; // 0.2，>0，使「显示」时间晚于「隐藏」时间
    m.down();
    const newCells = m.cells.flat().filter(c => c && !beforeIds.has(c.objectCount)) as any[];
    assert(newCells.length > 0, '应生成新方块用于验证时序');
    for (const cell of newCells) {
        const cmds = cell.cmd;
        const hide = cmds.find((c: any) => c.action === 'setVisible' && c.isVisible === false);
        const show = cmds.find((c: any) => c.action === 'setVisible' && c.isVisible === true);
        assert(hide, '新方块缺少 setVisible(false) 隐藏指令');
        assert(show, '新方块缺少 setVisible(true) 显示指令');
        // 先隐藏、后显示：在 cmd 队列中 hide 必须排在 show 之前，且 hide 时间 <= show 时间
        assert(cmds.indexOf(hide) < cmds.indexOf(show), '显示早于隐藏（时序错误）');
        assert(hide.playTime <= show.playTime, '隐藏时间应不晚于显示时间');
        assert(cell.startY < 0, '新方块应从棋盘上方落入（startY<0）');
    }
});

// =============================================================================
// 5) hasValidMove：死局返回 false、有解返回 true，且不修改原棋盘
// =============================================================================
test('hasValidMove：死局（无解棋盘）返回 false', () => {
    const m = new GameModel();
    m.init({ rows: 4, cols: 4, cellTypeNum: 3 });
    // 经独立全交换校验 + 模型双重确认的无解布局（无初始匹配、任意相邻交换均不形成三连）
    applyLayout(m, [
        ['red', 'red', 'green', 'green'],
        ['blue', 'blue', 'green', 'green'],
        ['green', 'blue', 'red', 'blue'],
        ['green', 'green', 'red', 'blue'],
    ]);
    assertEq(m.findMatches().length, 0, '死局不应有初始匹配');
    assert(!m.hasValidMove(), '无解棋盘竟被判定为有可行交换（误判有解）');
});

test('hasValidMove：存在有效交换时返回 true', () => {
    const m = new GameModel();
    m.init({ rows: 3, cols: 3, cellTypeNum: 3 });
    applyLayout(m, [
        ['red', 'red', 'blue'],
        ['green', 'blue', 'red'],
        ['blue', 'green', 'green'],
    ]);
    assertEq(m.findMatches().length, 0, '前置：不应有初始匹配');
    // 交换 (x=2,y=0)<->(x=2,y=1) 后第 0 行变为 red,red,red → 形成三连
    assert(m.hasValidMove(), '存在可形成三连的交换却被判定为无解');
});

test('hasValidMove：不修改原棋盘', () => {
    const m = new GameModel();
    m.init({ rows: 3, cols: 3, cellTypeNum: 3 });
    applyLayout(m, [
        ['red', 'red', 'blue'],
        ['green', 'blue', 'red'],
        ['blue', 'green', 'green'],
    ]);
    const before = typeSnapshot(m);
    m.hasValidMove();
    assertEq(typeSnapshot(m), before, 'hasValidMove 修改了棋盘');
});

// =============================================================================
// 6) 还原的连锁得分：数量×轮次 加成（占位 · 待工程组对接 calcCascadeScore）
// =============================================================================
todoTest('连锁得分：数量×轮次加成（占位·待工程组对接 GameModel.calcCascadeScore）', () => {
    // 构造一个已知 2 轮级联，用 crushRounds 数据算出「期望得分」。
    const m = new GameModel();
    m.init({ rows: 5, cols: 4, cellTypeNum: 3 });
    applyLayout(m, [
        ['blue', 'green', 'blue', 'green'],
        ['green', 'blue', 'blue', 'red'],
        ['blue', 'blue', 'red', 'blue'],
        ['blue', 'green', 'green', 'red'],
        ['green', 'blue', 'green', 'green'],
    ]);
    m.getRandomCellType = makeCyclingFill();
    m.selectCell(v2(1, 0));
    m.selectCell(v2(2, 0));
    assertEq(m.crushRounds.length, 2, '前置：2 轮级联');

    // 期望公式：score = Σ round_i.count * (i+1)，i 为 1-based 轮次序号
    const expected = m.crushRounds.reduce((s, r, i) => s + r.count * (i + 1), 0);
    assertEq(expected, 9, '期望得分应为 3*1 + 3*2 = 9');

    // 待工程组恢复连锁得分 API 后，取消下面这行 pending() 即可让断言生效：
    const api = (m as any).calcCascadeScore;
    if (typeof api === 'function') {
        assertEq(api.call(m), expected, '连锁得分（数量×轮次）');
    } else {
        // 占位：当前 GameModel 尚未实现 calcCascadeScore，记为待对接，不阻断 CI。
        markPending('GameModel.calcCascadeScore 尚未实现（期望 3*1 + 3*2 = 9）');
    }
});

// =============================================================================
// 汇总
// =============================================================================
console.log(`\n全部通过：${pass} 通过 / ${fail} 失败 / ${pending} 占位`);
if (fail > 0) process.exit(1);
