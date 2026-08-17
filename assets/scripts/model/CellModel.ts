import { Vec2, v2 } from 'cc';
import { CellType, CellStatus, ANITIME } from "./ConstValue";

/** 单个格子的动画指令：由 Model 写入，View 按 playTime 调度播放 */
export interface CellCommand {
    action: string;       // 动画类型：moveTo / toDie / setVisible
    keepTime: number;     // 该动画持续时间（秒）
    playTime: number;     // 相对“本次操作起点”的开始时间（秒）
    pos?: Vec2;           // moveTo 的目标位置
    isVisible?: boolean;  // setVisible 专用：true=显示 / false=隐藏
}

/**
 * CellModel —— 棋盘上单个格子的数据模型（纯数据，不含任何渲染组件）
 *
 * 设计要点：
 *  CellModel 不直接播放动画，而是把要执行的动画“记录”到 cmd 队列里。
 *  View 层（未来的 GridView / CellView）只需遍历 cmd，按 playTime 调度 tween 即可。
 *  逻辑层与渲染层完全解耦，逻辑层也能脱离 Cocos 单独做单元测试。
 *
 * 说明：本文件只实现“基础三消”所需的数据，不引入特殊方块 / 障碍物等 BoardLogic 之外的功能；
 *       但保留了 CellStatus 状态字段作为扩展点，后续要加特殊方块时直接复用即可。
 */
export default class CellModel {
    type: CellType | null;       // 方块颜色类型（null 表示尚未初始化）
    status: CellStatus;          // 方块状态（扩展点：当前只用 COMMON，特殊方块逻辑未实现）
    x: number;                   // 当前所在列（0 索引）
    y: number;                   // 当前所在行（0 索引）
    startX: number;              // 动画起点列（供 View 定位初始位置，例如从棋盘上方落入）
    startY: number;              // 动画起点行
    cmd: CellCommand[];          // 动画指令队列
    isDeath: boolean;            // 是否已死亡（被消除）
    objectCount: number;         // 全局唯一标识，供 View 区分不同实例
    private static nextId = 0;   // 自增计数器，保证 objectCount 唯一

    constructor() {
        this.type = null;
        this.status = CellStatus.COMMON;
        this.x = 0;
        this.y = 0;
        this.startX = 0;
        this.startY = 0;
        this.cmd = [];
        this.isDeath = false;
        this.objectCount = CellModel.nextId++;
    }

    /** 设置方块颜色类型 */
    init(type: CellType): void {
        this.type = type;
    }

    isEmpty(): boolean {
        return this.type === CellType.EMPTY;
    }

    setEmpty(): void {
        this.type = CellType.EMPTY;
    }

    setXY(x: number, y: number): void {
        this.x = x;
        this.y = y;
    }

    setStartXY(x: number, y: number): void {
        this.startX = x;
        this.startY = y;
    }

    /** 设置方块状态（扩展点：特殊方块逻辑预留，当前未使用） */
    setStatus(status: CellStatus): void {
        this.status = status;
    }

    /** 先移动到目标位置，再移回原位（用于“无法消除”的回弹反馈） */
    moveToAndBack(pos: Vec2): void {
        const srcPos = v2(this.x, this.y);
        this.cmd.push({ action: "moveTo", keepTime: ANITIME.TOUCH_MOVE, playTime: 0, pos });
        this.cmd.push({ action: "moveTo", keepTime: ANITIME.TOUCH_MOVE, playTime: ANITIME.TOUCH_MOVE, pos: srcPos });
    }

    /** 移动到目标位置，并立即把数据坐标更新为目标位置 */
    moveTo(pos: Vec2, playTime: number): void {
        const srcPos = v2(this.x, this.y);
        this.cmd.push({ action: "moveTo", keepTime: ANITIME.TOUCH_MOVE, playTime, pos });
        this.x = pos.x;
        this.y = pos.y;
    }

    /** 播放死亡（消除）动画 */
    toDie(playTime: number): void {
        this.cmd.push({ action: "toDie", playTime, keepTime: ANITIME.DIE });
        this.isDeath = true;
    }

    /**
     * 设置方块可见性（切换 UIOpacity）。
     * 典型用途：新方块从棋盘上方生成时，先 setVisible(0, false) 隐藏，
     * 再 setVisible(下落开始时间, true) 在下落那一刻才显形，
     * 避免消除动画播放期间新方块提前“堆”在棋盘上方外。
     */
    setVisible(playTime: number, isVisible: boolean): void {
        this.cmd.push({ action: "setVisible", keepTime: 0, playTime, isVisible });
    }
}
