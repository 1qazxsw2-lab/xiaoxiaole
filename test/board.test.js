// 消消乐逻辑层单元测试（Node 环境，零依赖，无引擎依赖）
// 运行：node test/board.test.js
// 重新编译逻辑层：见 test/README.md
const {
    createBoard, findMatches, removeMatches,
    collapseAndRefill, canMatchAfterSwap, hasValidMove, calcScore
} = require('./build/BoardLogic.js');

// ---------- 简易测试框架 ----------
let pass = 0, fail = 0;
function test(name, fn) {
    try { fn(); console.log('✓ ' + name); pass++; }
    catch (e) { console.log('✗ ' + name + ' — ' + e.message); fail++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || '断言失败'); }
function assertEq(a, b, msg) { if (a !== b) throw new Error((msg || '') + `：期望 ${b}，实际 ${a}`); }
// 检查棋盘无横/竖三连
function noTriple(board) {
    for (let i = 0; i < board.length; i++)
        for (let j = 0; j < board[i].length; j++) {
            const c = board[i][j];
            if (i >= 2 && board[i-1][j] === c && board[i-2][j] === c) return false;
            if (j >= 2 && board[i][j-1] === c && board[i][j-2] === c) return false;
        }
    return true;
}
function matchSetSize(matches) {
    let n = 0;
    matches.forEach(ys => n += ys.size);
    return n;
}

// ---------- createBoard ----------
test('createBoard：500 次随机均满足尺寸/值域/无初始匹配', () => {
    for (let t = 0; t < 500; t++) {
        const rows = 1 + Math.floor(Math.random() * 10);
        const cols = 1 + Math.floor(Math.random() * 10);
        const colors = 3 + Math.floor(Math.random() * 4);
        const board = createBoard(rows, cols, colors);
        assertEq(board.length, rows, '行数');
        board.forEach(row => assertEq(row.length, cols, '列数'));
        board.forEach(row => row.forEach(c => assert(c >= 0 && c < colors, `值域越界: ${c}`)));
        assert(noTriple(board), '出现初始三连');
    }
});
test('createBoard：colorCount < 3 抛异常', () => {
    let threw = false;
    try { createBoard(4, 4, 2); } catch (e) { threw = true; }
    assert(threw, 'colorCount=2 未抛异常');
    threw = false;
    try { createBoard(4, 4, 0); } catch (e) { threw = true; }
    assert(threw, 'colorCount=0 未抛异常');
});
test('createBoard：小棋盘边界不崩（1x1 / 2x2 / 1xN）', () => {
    assertEq(createBoard(1, 1, 3).length, 1);
    assertEq(createBoard(2, 2, 3).length, 2);
    assertEq(createBoard(1, 5, 3)[0].length, 5);
    assert(noTriple(createBoard(2, 2, 3)), '2x2 出现三连（不可能）');
});

// ---------- findMatches ----------
test('findMatches：检测横向三连', () => {
    const board = [[0, 0, 0], [1, 2, 3]];
    const m = findMatches(board);
    assertEq(matchSetSize(m), 3, '应匹配 3 格');
    assert(m.has(0) && m.get(0).has(0) && m.get(0).has(1) && m.get(0).has(2), '匹配位置错误');
});
test('findMatches：检测纵向三连', () => {
    const board = [[0, 1, 2], [0, 3, 4], [0, 5, 6]];
    const m = findMatches(board);
    assertEq(matchSetSize(m), 3, '应匹配 3 格');
    assert(m.has(0) && m.get(0).has(0) && m.get(1).has(0) && m.get(2).has(0), '匹配位置错误');
});
test('findMatches：长连（4/5 连）全部计入', () => {
    assertEq(matchSetSize(findMatches([[0, 0, 0, 0], [1, 2, 3, 4]])), 4, '横 4 连');
    assertEq(matchSetSize(findMatches([[0, 0, 0, 0, 0], [1, 2, 3, 4, 5]])), 5, '横 5 连');
});
test('findMatches：无匹配返回空', () => {
    const m = findMatches([[0, 1, 0], [1, 0, 1]]);
    assertEq(m.size, 0, '应无匹配');
});
test('findMatches：横竖交叉同时检出', () => {
    const board = [[0, 0, 0], [1, 0, 2], [3, 0, 4]];
    const m = findMatches(board);
    assertEq(matchSetSize(m), 5, '十字应 5 格');
});

// ---------- removeMatches ----------
test('removeMatches：置 -1 并返回数量', () => {
    const board = [[0, 0, 0], [1, 2, 3]];
    const m = findMatches(board);
    assertEq(removeMatches(board, m), 3, '返回数量');
    assertEq(board[0][0], -1, '未置 -1');
    assertEq(board[0][1], -1, '未置 -1');
});
test('removeMatches：清除后无残留匹配', () => {
    const board = [[0, 0, 0], [1, 2, 3]];
    removeMatches(board, findMatches(board));
    assertEq(findMatches(board).size, 0, '仍有匹配');
});

// ---------- collapseAndRefill ----------
test('collapseAndRefill：底部空格被上方方块填充（下落）', () => {
    const board = [[1, 2], [3, -1]];   // (1,1) 底部空格，(0,1) 上方有方块 2
    const moves = collapseAndRefill(board, 3);
    assertEq(board[1][1], 2, '下落未发生');
    assert(board[0][1] >= 0 && board[0][1] < 3, '源格应被新建填充');
    assert(moves.some(mv => mv.from.x === 0 && mv.from.y === 1 && mv.to.x === 1 && mv.to.y === 1), '缺少下落指令');
});
test('collapseAndRefill：新建指令 from.x === -2 标记', () => {
    const board = [[-1, 0], [1, 2]];
    const moves = collapseAndRefill(board, 3);
    assert(moves.some(mv => mv.from.x === -2 && mv.to.x === 0 && mv.to.y === 0), '缺少新建指令');
    assert(board[0][0] >= 0 && board[0][0] < 3, '新建方块值域错误');
});
test('collapseAndRefill：执行后棋盘无空格(-1)', () => {
    for (let t = 0; t < 100; t++) {
        const board = createBoard(6, 6, 4);
        removeMatches(board, findMatches(board));
        collapseAndRefill(board, 4);
        board.forEach(row => row.forEach(c => assert(c !== -1, '残留空格')));
    }
});
test('collapseAndRefill：下落+新建后棋盘尺寸不变', () => {
    const board = createBoard(6, 6, 4);
    removeMatches(board, findMatches(board));
    collapseAndRefill(board, 4);
    assertEq(board.length, 6, '行数变化');
    board.forEach(r => assertEq(r.length, 6, '列数变化'));
});

// ---------- 完整流程 ----------
test('完整流程：消除-下落-连锁循环后无空格无匹配', () => {
    for (let t = 0; t < 50; t++) {
        const board = createBoard(7, 6, 4);
        let guard = 0;
        while (guard++ < 100) {
            const m = findMatches(board);
            if (m.size === 0) break;
            removeMatches(board, m);
            collapseAndRefill(board, 4);
        }
        board.forEach(row => row.forEach(c => assert(c !== -1, '终局有空格')));
        assertEq(findMatches(board).size, 0, '终局仍有匹配');
        assertEq(board.length, 7, '行数变化');
    }
});
test('完整流程：随机消除后棋盘尺寸不变', () => {
    for (let t = 0; t < 50; t++) {
        const board = createBoard(8, 5, 3);
        let guard = 0;
        while (guard++ < 100 && findMatches(board).size > 0) {
            removeMatches(board, findMatches(board));
            collapseAndRefill(board, 3);
        }
        assertEq(board.length, 8);
        board.forEach(r => assertEq(r.length, 5));
    }
});

// ---------- calcScore ----------
test('calcScore：基础消除 数量 x 1', () => {
    assertEq(calcScore(3, 1), 3, '3 连第 1 轮');
    assertEq(calcScore(4, 1), 4, '4 连第 1 轮');
});
test('calcScore：连锁加成 数量 x 轮次', () => {
    assertEq(calcScore(3, 2), 6, '3 连第 2 轮');
    assertEq(calcScore(4, 3), 12, '4 连第 3 轮');
    assertEq(calcScore(3, 5), 15, '3 连第 5 轮');
});

// ---------- canMatchAfterSwap ----------
test('canMatchAfterSwap：可形成三连的交换返回 true', () => {
    const board = [
        [0, 1, 2],
        [0, 3, 4],
        [1, 5, 0]
    ];
    assert(canMatchAfterSwap(board, 2, 0, 2, 2), '交换后应形成竖三连');
});
test('canMatchAfterSwap：无效交换返回 false', () => {
    const board = [
        [0, 1, 2],
        [0, 3, 4],
        [1, 5, 0]
    ];
    assert(!canMatchAfterSwap(board, 0, 0, 0, 1), '交换后无三连却返回 true');
});
test('canMatchAfterSwap：不修改原棋盘', () => {
    const board = [
        [0, 1, 2],
        [0, 3, 4],
        [1, 5, 0]
    ];
    canMatchAfterSwap(board, 2, 0, 2, 2);
    assertEq(board[2][0], 1, '原棋盘被修改');
    assertEq(board[2][2], 0, '原棋盘被修改');
});

// ---------- hasValidMove ----------
test('hasValidMove：随机棋盘通常有解', () => {
    for (let t = 0; t < 20; t++) {
        const board = createBoard(7, 6, 4);
        assert(hasValidMove(board), '随机棋盘无可行交换');
    }
});
test('hasValidMove：无解棋盘返回 false', () => {
    const board = [[0, 1], [1, 0]];
    assert(!hasValidMove(board), '2x2 交替棋盘竟有解');
});

// ---------- 汇总 ----------
console.log(`\n全部通过：${pass} 通过 / ${fail} 失败`);
if (fail > 0) process.exit(1);
