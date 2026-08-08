export interface Move {
    from: {x: number, y: number};
    to:   {x: number, y: number};
}

// 计分规则：一次消除 matchCount 个方块，在第 chain 轮连锁 → 得分 = 数量 × 轮次
export function calcScore(matchCount: number, chain: number): number {
    return matchCount * chain;
}

export function createBoard(rows: number, cols: number, colorCount: number): number[][] {
    // 返回 rows 行 cols 列的二维数组，每格是 0 ~ colorCount-1 的随机整数
    // 约束：不能出现初始三连（横或竖连续 3 个同色）
    if (colorCount < 3) throw new Error('colorCount 必须 >= 3');
    let board: number[][] = [] ;
    for(let i = 0; i < rows; i++){
        board[i] = [];
        for(let j = 0; j < cols; j++){
            while(true){
                let color = Math.floor(Math.random() * colorCount);
                // 检查是否与相邻的方块形成三连
                if (i >= 2 && board[i - 1][j] === color && board[i - 2][j] === color) {
                    continue;
                }
                if (j >= 2 && board[i][j - 1] === color && board[i][j - 2] === color) {
                    continue;
                }
                board[i][j] = color;
                break;
            }
        }
    }
    return board;
}


export function findMatches(board: number[][]): Map<number, Set<number>> {
    // 外层 key 是 x，内层 Set 存 y
    const matches = new Map<number, Set<number>>();
    board.forEach((row, i) => {
        row.forEach((color, j) => { 
            if (color === -1) return; // 空格不参与匹配（修复：消除后残留 -1 被误判为三连）
            if (i >= 2 && board[i - 1][j] === color && board[i - 2][j] === color) {
                addMatches(matches, i, j);
                addMatches(matches, i - 1, j);
                addMatches(matches, i - 2, j);
            }
            if (j >= 2 && board[i][j - 1] === color && board[i][j - 2] === color) {
                addMatches(matches, i, j);
                addMatches(matches, i, j - 1);
                addMatches(matches, i, j - 2);
            }
        });
    });
    return matches;
}

export function removeMatches(board: number[][] , matches: Map<number, Set<number>>) : number {
    let count = 0 ;
    matches.forEach((ys, x) => {
        ys.forEach((y) => {
            board[x][y] = -1;
            count++;
        });
    });
    return count;
}

// 填充顶部的空格
    const isInvalidPosition = -2;
export function collapseAndRefill(board: number[][],colorCount: number): Move[] {
    let rows = board.length;
    let cols = board[0].length;
    let moves: Move[] = [];
    for(let j = cols - 1; j >= 0; j--){
        for(let i = rows - 1; i >= 0; i--){
            if(board[i][j] === -1){
                // 找到上方最近的非 -1 方块
                let k = i - 1;
                while(k >= 0 && board[k][j] === -1){
                    k--;
                }
                if(k >= 0){
                    board[i][j] = board[k][j];
                    board[k][j] = -1;
                    moves.push({from: {x: k, y: j}, to: {x: i, y: j}});
                }
            }
        }
    }
    // 填充顶部的空格
    for(let j = 0; j < cols; j++){
        for(let i = 0; i < rows; i++){
            if(board[i][j] === -1){
                board[i][j] = Math.floor(Math.random() * colorCount);
                moves.push({from: {x: isInvalidPosition, y: j}, to: {x: i, y: j}});
            }
        }
    }
    return moves;
}

export function canMatchAfterSwap(board: number[][] , x1: number, y1: number, x2: number, y2: number): boolean {
    // 检查交换后是否形成三连
    const boardCopy = board.map(row => row.slice());
    swapInBoard(boardCopy, x1, y1, x2, y2);
    const matches = findMatches(boardCopy);
    const canSwap = matches.size > 0;
    return canSwap;
}

export function hasValidMove(board: number[][]): boolean {
    const rows = board.length;
    const cols = board[0].length;
    for (let i = 0; i < rows; i++) {
        for (let j = 0; j < cols; j++) {
            // 尝试与右方格子交换
            if (j + 1 < cols && canMatchAfterSwap(board, i, j, i, j + 1)) {
                return true;
            }
            // 尝试与下方格子交换
            if (i + 1 < rows && canMatchAfterSwap(board, i, j, i + 1, j)) {
                return true;
            }
        }
    }
    return false;
}

function swapInBoard(board: number[][] , x1: number, y1: number, x2: number, y2: number) {
    const temp = board[x1][y1];
    board[x1][y1] = board[x2][y2];
    board[x2][y2] = temp;
}

function addMatches(matches: Map<number, Set<number>>, x: number, y: number) {
  if (!matches.has(x)) {
    matches.set(x, new Set<number>());
  }
  matches.get(x)!.add(y); // Set 自动去重 y
}