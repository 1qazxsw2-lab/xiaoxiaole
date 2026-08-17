import { _decorator, Component, Label, Node, Prefab, Vec2, Vec3, v2, EventTouch, sys } from 'cc';
import GameModel from './model/GameModel';
import CellModel from './model/CellModel';
import GridView from './view/GridView';
import {
    GRID_WIDTH, GRID_HEIGHT, CELL_WIDTH, CELL_HEIGHT, ANITIME,
    GameStatus, BASE_PER_BLOCK, CHAIN_STEP_BONUS
} from './model/ConstValue';
import { AudioManager, AudioEvent } from './audio/AudioManager';
import { getLevelConfig, LEVEL_COUNT } from './model/Levels';
import { UIManager } from './ui/UIManager';
import { ScoreFloatMgr } from './fx/ScoreFloatMgr';

const { ccclass, property } = _decorator;

const SWIPE_THRESHOLD = CELL_WIDTH * 0.4;   // 触发滑动手势的最小位移（像素，设计分辨率）
const HINT_DELAY = 5;                        // 空闲多少秒后弹出提示（秒）
const HIGHSCORE_KEY = 'xxl_highscore';       // 最高分本地存储键

/**
 * GameManager —— 控制器（Controller）
 *
 * 只做四件事（架构铁律，绝不破坏）：
 *   1. 接收输入（方块触摸 / 滑动手势）
 *   2. 调用 GameModel 计算逻辑（selectCell / loadLevel / evaluate / findHint）；得分在 processSwapChanges 中按 crushRounds 每轮实时累加
 *   3. 把结果交给 GridView 播放动画
 *   4. 触发 AudioManager 事件（仅 play(AudioEvent.X)，不直接播文件）+ 更新 HUD
 *
 * 本文件落地「全量补充包」全部 7 项功能，分述见各方法注释：
 *   ① 关卡系统（GameModel 状态 + loadLevel + 扣步 + evaluate 结算）
 *   ② 连锁得分：在 processSwapChanges 中按 crushRounds 时间戳逐轮实时累加到 model.score 并刷新 HUD（与飘字 / 连锁音同步）
 *   ③ 滑动手势（棋盘节点 touch 监听，与「点两下相邻」并存）
 *   ④ 提示系统（空闲触发 findHint 高亮，有操作即取消）
 *   ⑤ 最高分存档（sys.localStorage）
 *   ⑥ UI 外壳（UIManager 管理三覆盖层）
 *   ⑦ 得分飘字（ScoreFloatMgr，按 crushRounds 时间戳分批弹出）
 */
@ccclass('GameManager')
export class GameManager extends Component {
    // ===== 现有绑定 =====
    @property(Prefab) blockPrefab: Prefab = null;
    @property(Node) blockBoard: Node = null;
    @property(Label) scoreLabel: Label = null;

    // ===== ① 关卡 HUD（gdd-level §4 / ux-flow §2.2）=====
    @property(Label) levelLabel: Label = null;
    @property(Label) movesLabel: Label = null;
    @property(Label) targetLabel: Label = null;

    // ===== ⑥ UI 外壳 / ⑦ 飘字（新增组件引用）=====
    @property(UIManager) uiManager: UIManager = null;
    @property(ScoreFloatMgr) scoreFloatMgr: ScoreFloatMgr = null;

    private model: GameModel = new GameModel();
    private view: GridView = null;

    private selected: CellModel | null = null;   // 当前选中的方块（仅用于高亮）
    private isProcessing: boolean = false;        // 动画期间锁输入
    private isPaused: boolean = false;            // 暂停覆盖层打开时为真
    private currentLevel: number = 1;            // 当前关序号（单一真相源在 model.level，此处仅用于“下一关/重玩”计算）
    private idleTime: number = 0;                 // 空闲计时（提示系统）
    private hintModels: CellModel[] = [];         // 当前高亮的提示方块
    private _swipeHandled: boolean = false;       // 本次手势是否已消费（避免与逐格 touch 冲突）
    private _touchStart: Vec2 | null = null;      // 滑动起点（世界坐标）

    start() {
        // 注入“方块被点击”的回调，由 View 在创建节点时绑定
        this.view = new GridView(this.blockPrefab, this.blockBoard, (model) => this.onCellTouched(model));

        // ③ 滑动手势：在棋盘节点上监听触摸（与逐格 TOUCH_END 并存）
        this.blockBoard.on(Node.EventType.TOUCH_START, this.onBoardTouchStart, this);
        this.blockBoard.on(Node.EventType.TOUCH_MOVE, this.onBoardTouchMove, this);
        this.blockBoard.on(Node.EventType.TOUCH_END, this.onBoardTouchEnd, this);

        // ⑥ UI 外壳：注入回调。未配置 UIManager 时直接进第一关，保证仍可在编辑器内运行。
        if (this.uiManager) {
            this.uiManager.init({
                onStart: () => this.startLevel(1),
                onPause: () => this.openPause(),
                onResume: () => this.closePause(),
                onRetry: () => this.startLevel(this.currentLevel),
                onHome: () => this.showMainMenu(),
                onNext: () => {
                    if (this.currentLevel < LEVEL_COUNT) this.startLevel(this.currentLevel + 1);
                    else this.showMainMenu();
                },
                onMute: () => { AudioManager.inst?.toggleMute(); },
            });
            this.showMainMenu();
        } else {
            this.startLevel(1);
        }

        // 启动背景循环乐（资源缺失时 AudioManager 内部会自动跳过）
        AudioManager.inst?.startMusic();
    }

    // ================= ① 关卡流程 =================

    /** 载入第 n 关：重置 model 关卡参数 + 重建表现层 + 刷新 HUD + 关闭所有覆盖层 */
    private startLevel(n: number): void {
        this.currentLevel = Math.max(1, n);
        const cfg = getLevelConfig(this.currentLevel);
        this.clearSelection();
        this.clearHint();
        this.idleTime = 0;
        this.isPaused = false;
        this.view.clearAll();
        this.model.loadLevel(cfg);
        this.view.buildAll(this.model.getCells());
        this.updateHUD();
        this.setScoreVisible(true);     // 进入游戏后显示分数
        this.uiManager?.hideAll();
    }

    /** 返回主菜单（覆盖层状态由 UIManager 管理） */
    private showMainMenu(): void {
        this.isPaused = false;
        this.clearSelection();
        this.clearHint();
        this.idleTime = 0;
        this.view?.clearAll();
        this.setScoreVisible(false);    // 未开始游戏时隐藏分数
        this.uiManager?.showMainMenu(this.loadHighScore());
    }

    /** 暂停：冻结输入（不调用 director.pause，保证覆盖层按钮在 Web 下可点，见 ux-flow §6 待评审） */
    private openPause(): void {
        if (this.model.status !== GameStatus.PLAYING || this.isPaused) return;
        this.isPaused = true;
        this.clearHint();
        this.uiManager?.showPause();
    }

    private closePause(): void {
        if (!this.isPaused) return;
        this.isPaused = false;
        this.resetIdle();
        this.uiManager?.hidePause();
    }

    /** 胜利：更新最高分并展示胜利面板（胜优先于负已在 model.evaluate 保证） */
    private onWin(): void {
        this.updateHighScore();
        const hasNext = this.currentLevel < LEVEL_COUNT;
        this.uiManager?.showWin(this.model.score, hasNext);
    }

    /** 失败：更新最高分并展示失败面板 */
    private onLose(): void {
        this.updateHighScore();
        this.uiManager?.showLose(this.model.score, this.model.targetScore);
    }

    private updateHighScore(): void {
        const hs = this.loadHighScore();
        if (this.model.score > hs) this.saveHighScore(this.model.score);
    }

    // ================= 输入入口 =================

    /** View 在方块被点击时回调（逐格 TOUCH_END）。两点相邻点击 = 交换；单次 = 选中记录。 */
    onCellTouched(model: CellModel) {
        // 滑动手势已消费本次交互时，吞掉随后冒泡上来的逐格 touch
        if (this._swipeHandled) { this._swipeHandled = false; return; }
        if (this.isProcessing || this.isPaused) return;
        if (this.model.status !== GameStatus.PLAYING) return;
        if (this.uiManager?.anyOverlayVisible()) return;

        this.resetIdle();
        this.clearHint();

        const changes = this.model.selectCell(v2(model.x, model.y));

        if (changes.length === 0) {
            // 只是“选中记录”：切换高亮，并播放轻量选中音
            AudioManager.inst?.play(AudioEvent.SELECT);
            if (this.selected === model) {
                this.view.setSelected(model, false);
                this.selected = null;
            } else {
                this.clearSelection();
                this.selected = model;
                this.view.setSelected(model, true);
            }
            return;
        }
        this.processSwapChanges(changes);
    }

    // ================= ③ 滑动手势 =================

    private onBoardTouchStart(e: EventTouch): void {
        this._swipeHandled = false;
        this._touchStart = e.getLocation();
    }

    private onBoardTouchMove(e: EventTouch): void {
        if (this.isProcessing || this.isPaused) return;
        if (this.model.status !== GameStatus.PLAYING) return;
        if (this.uiManager?.anyOverlayVisible()) return;
        if (this._swipeHandled || !this._touchStart) return;

        const cur = e.getLocation();
        const dx = cur.x - this._touchStart.x;
        const dy = cur.y - this._touchStart.y;
        if (Math.hypot(dx, dy) < SWIPE_THRESHOLD) return;   // 位移不足，视为点按

        const startCell = this.touchToCell(this._touchStart);
        if (!startCell) { return; }   // 起点不在棋盘内（间隙/外部）→ 不处理，也不吞噬后续点击

        // 主方向：水平 or 垂直
        const dir = Math.abs(dx) > Math.abs(dy) ? v2(Math.sign(dx), 0) : v2(0, Math.sign(dy));
        const target = v2(startCell.x + dir.x, startCell.y + dir.y);
        if (target.x < 0 || target.x >= this.model.gridWidth
            || target.y < 0 || target.y >= this.model.gridHeight) {
            this._swipeHandled = true; return;
        }
        this._swipeHandled = true;
        this.doSwapViaPos(startCell, target);
    }

    private onBoardTouchEnd(_e: EventTouch): void {
        this._touchStart = null;
    }

    /** 把世界坐标映射到棋盘格坐标（设计分辨率、blockBoard 缩放=1 假设） */
    private touchToCell(world: Vec2): Vec2 | null {
        const out = new Vec3();
        this.blockBoard.inverseTransformPoint(out, new Vec3(world.x, world.y, 0));
        const gx = Math.floor(out.x / CELL_WIDTH);
        const gy = Math.floor(-out.y / CELL_HEIGHT);
        if (gx < 0 || gx >= this.model.gridWidth || gy < 0 || gy >= this.model.gridHeight) return null;
        return v2(gx, gy);
    }

    /** 滑动交换：先记起点（模拟第一次点按），再对相邻格发起交换，复用既有 selectCell 流程 */
    private doSwapViaPos(start: Vec2, target: Vec2): void {
        if (this.isProcessing || this.isPaused) return;
        if (this.model.status !== GameStatus.PLAYING) return;
        if (this.uiManager?.anyOverlayVisible()) return;
        this.resetIdle();
        this.clearHint();
        this.model.selectCell(start);                 // 仅记录 lastPos
        const changes = this.model.selectCell(target); // 触发交换 / 回弹
        if (changes.length === 0) { this.model.lastPos = v2(-1, -1); return; }
        this.processSwapChanges(changes);
    }

    // ================= 交换结果处理（核心） =================

    /**
     * 处理一次交换产生的变更：无效回弹 or 有效消除。
     * 有效消除分支对应 gdd-level §4.3 的两个插入点：
     *   插入点 A：扣 1 步并立即刷新 HUD
     *   插入点 B：动画结束后做最终分数同步 + evaluate + 切屏（分数已在每轮消除时实时累加）
     */
    private processSwapChanges(changes: CellModel[]): void {
        const matched = changes.some(m => m.isDeath);
        this.clearSelection();
        this.clearHint();
        this.resetIdle();

        if (!matched) {
            // 无效交换回弹：不扣步数
            this.isProcessing = true;
            AudioManager.inst?.play(AudioEvent.SWAP);
            this.scheduleOnce(() => AudioManager.inst?.play(AudioEvent.INVALID), ANITIME.TOUCH_MOVE);
            const duration = this.view.playChanges(changes);
            this.scheduleOnce(() => { this.isProcessing = false; }, duration);
            return;
        }

        // —— 插入点 A：有效消除，立即扣 1 步并刷新 HUD ——
        this.model.movesLeft -= 1;
        this.updateMoves();
        this.isProcessing = true;
        AudioManager.inst?.play(AudioEvent.SWAP);

        // 连锁音：按 crushRounds 时间戳逐轮排程（对齐动画时间轴）
        for (const round of this.model.crushRounds) {
            const rate = Math.min(1.6, 1 + 0.1 * Math.max(0, round.count - 3));
            this.scheduleOnce(() => {
                AudioManager.inst?.play(
                    round.count >= 5 ? AudioEvent.BIG_MATCH : AudioEvent.MATCH,
                    { rate }
                );
            }, Math.max(0, round.time));
        }

        // ⑦ 得分飘字：按同样时间戳分批弹出，与连锁音对齐（文案 = 本轮得分）
        this.model.crushRounds.forEach((round, i) => {
            const roundScore = Math.round(round.count * BASE_PER_BLOCK * (1 + CHAIN_STEP_BONUS * i));
            const uiPos = this.deadCenterToUIPos(round.cells);
            const gold = round.count >= 5 ? '#FFE36E' : undefined;  // 大消除用金色变体
            this.scheduleOnce(() => {
                this.model.score += roundScore;   // 实时累加本轮得分（与飘字 / 连锁音同步）
                this.updateScore();               // 每次消除后立即刷新 HUD 分数
                this.scoreFloatMgr?.spawn('+' + roundScore, uiPos, gold);
            }, Math.max(0, round.time));
        });

        const duration = this.view.playChanges(changes);

        // —— 插入点 B：动画结束后做最终同步与结算（分数已在每轮消除时实时累加）——
        this.scheduleOnce(() => {
            this.updateScore();                    // 分数已在每轮消除时实时累加，这里做最终同步
            this.isProcessing = false;
            this.model.evaluate();                 // 胜优先于负

            if (this.model.status === GameStatus.WIN) { this.onWin(); return; }
            if (this.model.status === GameStatus.LOSE) { this.onLose(); return; }
            // 仍 PLAYING 且死局 → 免费洗牌（不扣步、不改分，见 gdd-level §4.5 边缘 4）
            if (!this.model.hasValidMove()) {
                AudioManager.inst?.play(AudioEvent.SHUFFLE);
                this.restartBoard();
            }
        }, duration);
    }

    /** 死局洗牌：仅重盘，保留 level / movesLeft / score / status（不重置关卡参数） */
    private restartBoard(): void {
        this.clearSelection();
        this.clearHint();
        this.view.clearAll();
        do {
            this.model.init({ rows: GRID_HEIGHT, cols: GRID_WIDTH, cellTypeNum: this.model.cellTypeNum });
        } while (!this.model.hasValidMove());
        this.view.buildAll(this.model.getCells());
        this.resetIdle();
    }

    // ================= ④ 提示系统 =================

    update(dt: number): void {
        if (this.model.status !== GameStatus.PLAYING) return;
        if (this.isProcessing || this.isPaused) return;
        if (this.uiManager?.anyOverlayVisible()) return;
        if (this.model.cells.length === 0) return;          // 尚未建盘
        if (this.hintModels.length > 0) return;             // 已在高亮
        this.idleTime += dt;
        if (this.idleTime >= HINT_DELAY) this.showHint();
    }

    private resetIdle(): void {
        this.idleTime = 0;
        this.clearHint();
    }

    private showHint(): void {
        const hint = this.model.findHint();
        if (!hint) return;
        const a = this.model.cells[hint.a.y][hint.a.x];
        const b = this.model.cells[hint.b.y][hint.b.x];
        if (a && b) {
            this.view.setSelected(a, true);
            this.view.setSelected(b, true);
            this.hintModels = [a, b];
        }
    }

    private clearHint(): void {
        for (const m of this.hintModels) this.view.setSelected(m, false);
        this.hintModels = [];
    }

    // ================= ⑤ 最高分存档 =================

    private loadHighScore(): number {
        const s = sys.localStorage.getItem(HIGHSCORE_KEY);
        return s ? (parseInt(s, 10) || 0) : 0;
    }

    private saveHighScore(v: number): void {
        try { sys.localStorage.setItem(HIGHSCORE_KEY, String(v)); } catch (e) { /* 存储不可用时静默忽略 */ }
    }

    // ================= HUD =================

    private clearSelection(): void {
        if (this.selected) {
            this.view.setSelected(this.selected, false);
            this.selected = null;
        }
    }

    private updateLevel(): void { if (this.levelLabel) this.levelLabel.string = `第 ${this.model.level} 关`; }
    private updateMoves(): void { if (this.movesLabel) this.movesLabel.string = `步数 ${this.model.movesLeft}`; }
    private updateScore(): void { if (this.scoreLabel) this.scoreLabel.string = this.model.score.toString(); }
    /** 控制 HUD 分数标签的显隐：游戏未开始（主菜单）时隐藏 */
    private setScoreVisible(v: boolean): void { if (this.scoreLabel) this.scoreLabel.node.active = v; }
    private updateTarget(): void { if (this.targetLabel) this.targetLabel.string = `目标 ${this.model.targetScore}`; }
    private updateHUD(): void {
        this.updateLevel(); this.updateMoves(); this.updateScore(); this.updateTarget();
    }

    // ================= ⑦ 飘字坐标换算 =================

    /** 把某轮死亡方块的中心格坐标换算成 ScoreFloatLayer 节点下的本地坐标 */
    private deadCenterToUIPos(cells: Vec2[]): Vec3 {
        let cx = 0, cy = 0;
        for (const c of cells) { cx += c.x; cy += c.y; }
        cx /= cells.length; cy /= cells.length;
        // 与 CellView.toPixel 一致的棋盘本地坐标
        const localX = cx * CELL_WIDTH + CELL_WIDTH / 2;
        const localY = cy * -CELL_HEIGHT - CELL_HEIGHT / 2;
        // 假设 blockBoard 缩放=1：世界坐标 = 棋盘世界原点 + 本地偏移
        const boardWorld = this.blockBoard.getWorldPosition();
        const worldPos = new Vec3(boardWorld.x + localX, boardWorld.y + localY, 0);
        if (this.scoreFloatMgr) {
            const out = new Vec3();
            this.scoreFloatMgr.node.inverseTransformPoint(out, worldPos);
            return out;
        }
        return new Vec3(localX, localY, 0);
    }
}
