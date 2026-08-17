import { GRID_HEIGHT, GRID_WIDTH } from "./ConstValue";

/**
 * 关卡配置（gdd-level §3）。
 * 难度旋钮只有四个：颜色种类数 / 步数 / 目标分 / 可选种子。不引入特殊方块 / 障碍。
 */
export interface LevelConfig {
    level: number;          // 关序号，从 1 起
    cellTypeNum: number;    // 颜色种类：3 或 4（受 BASIC_CELL_TYPES 长度约束，当前最大 4）
    moves: number;          // 步数上限
    targetScore: number;    // 目标分（基于 gdd-level §2 公式）
    seed?: number;          // 可选：固定初始布局，保证试玩广告每局一致
}

/** 五关难度曲线（gdd-level §3 表格，原样落地） */
export const LEVELS: LevelConfig[] = [
    { level: 1, cellTypeNum: 3, moves: 20, targetScore: 700 },
    { level: 2, cellTypeNum: 3, moves: 18, targetScore: 850 },
    { level: 3, cellTypeNum: 4, moves: 25, targetScore: 1000 },
    { level: 4, cellTypeNum: 4, moves: 22, targetScore: 1000 },
    { level: 5, cellTypeNum: 4, moves: 20, targetScore: 1050 },
];

/** 取第 n 关配置（越界则夹取到首/尾关，保证永不崩溃） */
export function getLevelConfig(n: number): LevelConfig {
    const idx = Math.max(1, Math.min(LEVELS.length, Math.floor(n))) - 1;
    return LEVELS[idx];
}

/** 总关数（供“是否有下一关”判断） */
export const LEVEL_COUNT = LEVELS.length;

/** 预留：棋盘尺寸引用，避免未来扩展时遗漏宽高约束 */
export const BOARD = { rows: GRID_HEIGHT, cols: GRID_WIDTH };
