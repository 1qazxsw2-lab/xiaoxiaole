/** 方块类型（预留特殊方块） */
export enum CellType {
    EMPTY = 'empty',
    RED = 'red',
    BLUE = 'blue',
    GREEN = 'green',
    YELLOW = 'yellow',
    BIRD = 'bird',
}

/** 方块基础数量 */
export const CELL_BASENUM = 4;

/**
 * 基础方块颜色池：随机生成时从中取前 cellTypeNum 种作为可用颜色。
 * 顺序刻意把 YELLOW 排在第 3 位 —— 这样 3 色关（cellTypeNum=3）也会包含黄色，
 * 4 色关再补 GREEN，难度曲线（3→4）保持不变。
 */
export const BASIC_CELL_TYPES: CellType[] = [
    CellType.RED,
    CellType.BLUE,
    CellType.YELLOW,
    CellType.GREEN,
];

/** 方块状态 */
export enum CellStatus {
    COMMON = 'common',
    CLICK = 'click',
    LINE = 'line',
    COLUMN = 'column',
    WRAP = 'wrap',
    BIRD = 'bird',
}

/** 网格行列数 */
export const GRID_WIDTH = 6;
export const GRID_HEIGHT = 7;

/** 方块大小 */
export const CELL_WIDTH = 100;
export const CELL_HEIGHT = 100;

/** 网格大小 */
export const GRID_PIXEL_WIDTH = GRID_WIDTH * CELL_WIDTH;
export const GRID_PIXEL_HEIGHT = GRID_HEIGHT * CELL_HEIGHT;


// ********************   时间表  animation time **************************
export const ANITIME = {
  TOUCH_MOVE: 0.3,// 触摸移动时间
  DIE: 0.2,// 死亡时间
  DOWN: 0.5,// 下落时间
}

// ********************   关卡状态机  (gdd-level §4.1)  **************************
/** 关卡运行状态：PLAYING / WIN / LOSE。状态真相源位于 GameModel，UX 仅读取。 */
export enum GameStatus {
  PLAYING = 'playing',
  WIN  = 'win',
  LOSE = 'lose',
}

// ********************   计分常量  (gdd-level §2 / score-float-spec §4)  **************************
/** 每个被消除方块的基础分（游戏真实计分用，见 GameManager 按 crushRounds 每轮累加）。 */
export const BASE_PER_BLOCK = 10;
/** 连锁轮次加成：第 k 轮（0 基）倍率 = 1 + CHAIN_STEP_BONUS * k（k=0 → 1.0，无加成；k=1 → 1.3 …）。 */
export const CHAIN_STEP_BONUS = 0.30;
/** 飘字文案用基础分（= BASE_PER_BLOCK，命名对齐 score-float-spec §4）。 */
export const SCORE_PER_BLOCK = 10;
