import { Vec2, v2 } from 'cc';
import CellModel from "./CellModel";
import { CellType, CellStatus, CELL_BASENUM, BASIC_CELL_TYPES, GRID_WIDTH, GRID_HEIGHT, ANITIME, GameStatus } from "./ConstValue";
import { LevelConfig } from "./Levels";

/** GameModel 初始化参数（全部可选，缺省时使用默认棋盘） */
export interface GameInitOptions {
    rows?: number;        // 行数
    cols?: number;        // 列数
    cellTypeNum?: number; // 可用颜色种类数
}

/**
 * GameModel —— 纯逻辑层（不依赖任何 Cocos 渲染组件）
 *
 * 对应原 BoardLogic 的全部功能，并改用“命令队列”架构：
 *  - 维护棋盘数据（cells: CellModel[][]，0 索引，cells[y][x]）
 *  - 处理交换、三连消除检测、下落补充、以及可消除性判断
 *  - 把动画指令写进每个 CellModel.cmd，由 View 层按时间轴播放
 *
 * 与 BoardLogic 不同的地方（也是本重构的核心）：
 *  - 用 CellModel 对象代替纯数字，方便记录动画指令
 *  - 一次 selectCell 调用同步算出本次操作产生的全部指令，天然支持并行动画
 *
 * 未引入 BoardLogic 之外的功能（无特殊方块、无障碍物、无 mask）。
 * 但保留了 CellType / CellStatus 枚举与 status 字段，作为后续扩展的入口。
 */
export default class GameModel {
    cells: (CellModel | null)[][];   // 棋盘：cells[y][x]，0 索引
    lastPos: Vec2;                   // 上一次点击的格子（用于判断相邻交换）
    cellTypeNum: number;             // 当前可用颜色种类数
    cellCreateType: CellType[];      // 可随机生成的基础颜色池
    changeModels: CellModel[];       // 本次操作发生改变的格子（返回给 View）
    crushRounds: { time: number; count: number; cells: Vec2[] }[];  // 本次消除每一轮“死亡”的时间戳、数量与坐标（供音频/飘字按时间轴排连锁）
    curTime: number;                 // 动画时间轴游标
    gridWidth: number;               // 列数
    gridHeight: number;              // 行数

    // ===== ① 关卡状态层（gdd-level §4.1，状态真相源在 Model，UX 仅读取）=====
    level: number;                   // 当前关序号
    score: number;                   // 当前得分
    targetScore: number;             // 目标分
    movesLeft: number;               // 剩余步数
    status: GameStatus;              // 关卡运行状态：PLAYING / WIN / LOSE

    constructor() {
        this.cells = [];
        this.lastPos = v2(-1, -1);
        this.cellTypeNum = CELL_BASENUM;
        this.cellCreateType = [];
        this.changeModels = [];
        this.crushRounds = [];
        this.curTime = 0;
        this.gridWidth = GRID_WIDTH;
        this.gridHeight = GRID_HEIGHT;
        // 关卡状态层初始化
        this.level = 1;
        this.score = 0;
        this.targetScore = 0;
        this.movesLeft = 0;
        this.status = GameStatus.PLAYING;
    }

    /** 初始化棋盘：随机填充颜色，保证初始棋盘没有任何三连 */
    init(options?: GameInitOptions): void {
        this.cells = [];
        this.setCellTypeNum(options?.cellTypeNum ?? this.cellTypeNum);
        this.gridWidth = options?.cols ?? GRID_WIDTH;
        this.gridHeight = options?.rows ?? GRID_HEIGHT;

        for (let y = 0; y < this.gridHeight; y++) {
            this.cells[y] = [];
            for (let x = 0; x < this.gridWidth; x++) {
                const cell = new CellModel();
                this.cells[y][x] = cell;
                cell.setXY(x, y);
                cell.setStartXY(x, y);
                // 逐格抽取颜色，跳过会与左侧 / 上方已放置方块形成三连的颜色
                let flag = true;
                while (flag) {
                    flag = false;
                    cell.init(this.getRandomCellType());
                    if (x >= 2 && this.cells[y][x - 1]!.type === cell.type && this.cells[y][x - 2]!.type === cell.type) {
                        flag = true;
                    }
                    if (y >= 2 && this.cells[y - 1][x]!.type === cell.type && this.cells[y - 2][x]!.type === cell.type) {
                        flag = true;
                    }
                }
            }
        }
    }

    /** 返回棋盘尺寸 */
    getGridSize(): { rows: number; cols: number } {
        return { rows: this.gridHeight, cols: this.gridWidth };
    }

    /** 返回棋盘数据（View 初始化时用来创建节点） */
    getCells(): (CellModel | null)[][] {
        return this.cells;
    }

    /** 清空所有格子的动画指令（新一轮操作前调用，避免累加旧指令） */
    cleanCmd(): void {
        for (let y = 0; y < this.gridHeight; y++) {
            for (let x = 0; x < this.gridWidth; x++) {
                const model = this.cells[y][x];
                if (model) model.cmd = [];
            }
        }
    }

    /**
     * 检测全盘的所有三连及以上消除点。
     * @returns 所有处于三连（横或竖）中的格子相关内容，返回坐标集合
     */
    findMatches(): Vec2[] {
        const matched = new Set<string>();
        // 横向扫描
        for (let y = 0; y < this.gridHeight; y++) {
            let runStart = 0;
            for (let x = 1; x <= this.gridWidth; x++) {
                const sameAsPrev = x < this.gridWidth && this.sameColor(x, y, x - 1, y);
                if (!sameAsPrev) {
                    if (x - runStart >= 3) {
                        for (let k = runStart; k < x; k++) matched.add(`${k}_${y}`);
                    }
                    runStart = x;
                }
            }
        }
        // 纵向扫描
        for (let x = 0; x < this.gridWidth; x++) {
            let runStart = 0;
            for (let y = 1; y <= this.gridHeight; y++) {
                const sameAsPrev = y < this.gridHeight && this.sameColor(x, y, x, y - 1);
                if (!sameAsPrev) {
                    if (y - runStart >= 3) {
                        for (let k = runStart; k < y; k++) matched.add(`${x}_${k}`);
                    }
                    runStart = y;
                }
            }
        }
        // 把 "x_y" 字符串转回 Vec2
        const result: Vec2[] = [];
        matched.forEach(key => {
            const idx = key.indexOf('_');
            result.push(v2(Number(key.slice(0, idx)), Number(key.slice(idx + 1))));
        });
        return result;
    }

    /** 判断两个格子是否同色且都有效（null / 未初始化视为不同） */
    private sameColor(x1: number, y1: number, x2: number, y2: number): boolean {
        const a = this.cells[y1]?.[x1];
        const b = this.cells[y2]?.[x2];
        if (!a || !b || a.type === null || b.type === null) return false;
        return a.type === b.type;
    }

    /**
     * Controller 主入口：玩家点击某个格子。
     * 第一次点击只记录位置；第二次点击若与第一次相邻，则尝试交换并消除。
     * @returns 本次操作发生改变的格子（含交换 / 消除 / 下落 / 新生成），供 View 播放动画
     */
    selectCell(pos: Vec2): CellModel[] {
        this.changeModels = [];
        this.crushRounds = [];   // 清空上一次操作的连锁轮次，避免残留轮次在下次有效消除时重播（表现为“没连锁却响连锁声”）
        this.cleanCmd();   // 清空上一次操作残留的动画指令

        const lastPos = this.lastPos;
        const delta = Math.abs(pos.x - lastPos.x) + Math.abs(pos.y - lastPos.y);
        if (delta !== 1) {
            // 非相邻点击：仅记录本次点击，等待下一次
            this.lastPos = pos;
            return [];
        }
        if (!this.inBounds(pos.x, pos.y) || !this.inBounds(lastPos.x, lastPos.y)) {
            this.lastPos = v2(-1, -1);
            return [];
        }

        const curClickCell = this.cells[pos.y][pos.x];
        const lastClickCell = this.cells[lastPos.y][lastPos.x];
        if (!curClickCell || !lastClickCell) { this.lastPos = v2(-1, -1); return []; }

        // 交换两个格子
        this.exchangeCell(lastPos, pos);

        // 判断是否产生了消除（交换后全盘是否有包含本次交换格子的三连）
        const matches = this.findMatches();
        const hasMatch = matches.some(p =>
            (p.x === pos.x && p.y === pos.y) || (p.x === lastPos.x && p.y === lastPos.y));

        if (!hasMatch) {
            // 无法消除：换回原位，并播放“来回”回弹动画
            this.exchangeCell(lastPos, pos);
            curClickCell.moveToAndBack(lastPos);
            lastClickCell.moveToAndBack(pos);
            this.pushToChangeModels(curClickCell);
            this.pushToChangeModels(lastClickCell);
            this.lastPos = v2(-1, -1);
            return this.changeModels;
        }

        // 可以消除：先把交换动作记为动画，再进入消除循环
        this.lastPos = v2(-1, -1);
        this.curTime = 0;
        curClickCell.moveTo(lastPos, this.curTime);
        lastClickCell.moveTo(pos, this.curTime);
        this.pushToChangeModels(curClickCell);
        this.pushToChangeModels(lastClickCell);
        this.curTime += ANITIME.TOUCH_MOVE;

        this.processCrush();
        return this.changeModels;
    }

    /** 消除主循环：反复检测消除点 → 消除 → 下落补充，直到棋盘稳定（无新消除） */
    processCrush(): void {
        let matches = this.findMatches();
        while (matches.length > 0) {
            // 记录本轮“死亡”的时间戳、数量与坐标，供音频系统按时间轴逐轮播放连锁音（纯逻辑数据，不触碰任何 cc 音频）
            this.crushRounds.push({ time: this.curTime, count: matches.length, cells: matches.map(p => v2(p.x, p.y)) });
            for (const p of matches) {
                const model = this.cells[p.y][p.x];
                if (!model) continue;
                this.pushToChangeModels(model);
                model.toDie(this.curTime);
                this.cells[p.y][p.x] = null;
            }
            this.curTime += ANITIME.DIE;
            this.down();
            this.curTime += ANITIME.DOWN;
            matches = this.findMatches();
        }
    }

    /** 下落 + 顶部补充新方块。所有移动都记录为 moveTo 动画指令。 */
    down(): void {
        for (let x = 0; x < this.gridWidth; x++) {
            // 1) 现有方块下沉到底部空缺（从下往上扫描，逐个压实）
            let writeY = this.gridHeight - 1;
            for (let y = this.gridHeight - 1; y >= 0; y--) {
                const model = this.cells[y][x];
                if (model) {
                    if (writeY !== y) {
                        this.cells[writeY][x] = model;
                        this.cells[y][x] = null;
                        model.setXY(x, writeY);
                        model.moveTo(v2(x, writeY), this.curTime);
                        this.pushToChangeModels(model);
                    }
                    writeY--;
                }
            }
            // 2) 顶部剩余空行补充新方块（从棋盘上方依次落入）
            let above = 0;
            for (let y = writeY; y >= 0; y--) {
                const model = new CellModel();
                model.init(this.getRandomCellType());
                model.setStartXY(x, -(above + 1));   // 起点在棋盘上方，制造“落入”效果
                model.setXY(x, y);
                // 关键：生成瞬间先隐藏，等下落开始时（下方 setVisible 的 this.curTime 此刻已累加 = DIE）再显示，
                // 否则新方块会提前出现在棋盘上方、在消除动画播放期间就“堆”在外面。
                // 这一步对齐参考项目 GameModel.createNewCell 的 setVisible(0,false) + setVisible(curTime,true)。
                model.setVisible(0, false);
                model.setVisible(this.curTime, true);
                model.moveTo(v2(x, y), this.curTime);
                this.cells[y][x] = model;
                this.pushToChangeModels(model);
                above++;
            }
        }
    }

    /** 记录所有需要更新的格子，用于动画播放 */ 
    pushToChangeModels(model: CellModel): void {
        if (this.changeModels.indexOf(model) !== -1) return;
        this.changeModels.push(model);
    }

    /** 交换两个格子在棋盘中的引用及其坐标 */
    exchangeCell(pos1: Vec2, pos2: Vec2): void {
        const tmp = this.cells[pos1.y][pos1.x];
        this.cells[pos1.y][pos1.x] = this.cells[pos2.y][pos2.x];
        this.cells[pos1.y][pos1.x]!.setXY(pos1.x, pos1.y);
        this.cells[pos2.y][pos2.x] = tmp;
        this.cells[pos2.y][pos2.x]!.setXY(pos2.x, pos2.y);
    }

    /** 设置可用颜色种类，并构建随机生成池 */
    setCellTypeNum(num: number): void {
        this.cellTypeNum = Math.max(1, num);
        this.cellCreateType = BASIC_CELL_TYPES.slice(0, this.cellTypeNum);
    }

    /** 从颜色池中随机取一种颜色 */
    getRandomCellType(): CellType {
        const index = Math.floor(Math.random() * this.cellCreateType.length);
        return this.cellCreateType[index];
    }

    private inBounds(x: number, y: number): boolean {
        return x >= 0 && x < this.gridWidth && y >= 0 && y < this.gridHeight;
    }

    // ===== 以下两个方法对应原 BoardLogic 的 canMatchAfterSwap / hasValidMove =====

    /** 判断交换 (x1,y1)<->(x2,y2) 后能否形成消除（不改写真实棋盘） */
    canMatchAfterSwap(x1: number, y1: number, x2: number, y2: number): boolean {
        if (!this.inBounds(x1, y1) || !this.inBounds(x2, y2)) return false;
        this.exchangeCell(v2(x1, y1), v2(x2, y2));
        const ok = this.findMatches().length > 0;
        this.exchangeCell(v2(x1, y1), v2(x2, y2)); // 换回
        return ok;
    }

    /** 全盘是否存在任意一步可消除的有效操作 */
    hasValidMove(): boolean {
        for (let y = 0; y < this.gridHeight; y++) {
            for (let x = 0; x < this.gridWidth; x++) {
                if (x + 1 < this.gridWidth && this.canMatchAfterSwap(x, y, x + 1, y)) return true;
                if (y + 1 < this.gridHeight && this.canMatchAfterSwap(x, y, x, y + 1)) return true;
            }
        }
        return false;
    }

    // ===== ① 关卡状态层（GameManager 调用，本重构补全）=====

    /**
     * 载入关卡配置：写入关卡参数 + 反复生成棋盘直到有解（保证开局必有解）。
     * 死局洗牌（restartBoard）直接调 init，不重置本层参数 —— 由此区分“重开关卡”与“仅重盘”。
     */
    loadLevel(cfg: LevelConfig): void {
        this.level = cfg.level;
        this.targetScore = cfg.targetScore;
        this.movesLeft = cfg.moves;
        this.score = 0;
        this.status = GameStatus.PLAYING;
        do {
            this.init({ rows: GRID_HEIGHT, cols: GRID_WIDTH, cellTypeNum: cfg.cellTypeNum });
        } while (!this.hasValidMove());
    }

    /** 结算：分数达标 → WIN（胜优先于负）；步数耗尽且未达标 → LOSE；否则保持 PLAYING（死局由外部 restartBoard 处理）。 */
    evaluate(): void {
        if (this.score >= this.targetScore) {
            this.status = GameStatus.WIN;
            return;
        }
        if (this.movesLeft <= 0) {
            this.status = GameStatus.LOSE;
        }
    }

    /** 寻找一步可消除的相邻交换，用于空闲提示；无则返回 null。 */
    findHint(): { a: Vec2; b: Vec2 } | null {
        for (let y = 0; y < this.gridHeight; y++) {
            for (let x = 0; x < this.gridWidth; x++) {
                if (x + 1 < this.gridWidth && this.canMatchAfterSwap(x, y, x + 1, y))
                    return { a: v2(x, y), b: v2(x + 1, y) };
                if (y + 1 < this.gridHeight && this.canMatchAfterSwap(x, y, x, y + 1))
                    return { a: v2(x, y), b: v2(x, y + 1) };
            }
        }
        return null;
    }
}
