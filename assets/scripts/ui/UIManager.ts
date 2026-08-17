import { _decorator, Component, Node, Label, Button, Sprite, Color } from 'cc';

const { ccclass, property } = _decorator;

/**
 * UI 派生色板（对齐 docs/art/ui-spec.md §3.2）。
 * 全部为十六进制字符串常量，运行时用 color() 转成 cc.Color。
 * 仅取“派生柔化色”，绝不直接铺满饱和原色（见 ui-spec §9 硬规则）。
 */
export const UI_COLOR = {
    BG_TOP: '#241A5C',
    BG_BOTTOM: '#4B2E83',
    BOARD_FRAME: '#1A1240',
    PANEL_FILL: '#FFF6E9',
    OVERLAY: '#000000',          // 遮罩黑，叠加在节点 UIOpacity 上实现 55% 半透明
    TEXT_ON_DARK: '#FFFFFF',
    TEXT_ON_PANEL: '#2B1E5E',
    TEXT_SECONDARY: '#7A7099',
    BTN_PRIMARY: '#FF5370',
    BTN_PRIMARY_PRESS: '#D83A57',
    BTN_PRIMARY_TOP: '#FF7A8F',
    BTN_SECONDARY: '#4D8BFF',
    BTN_SECONDARY_PRESS: '#3A6FD6',
    ACCENT_GOLD: '#FFD23F',
    WIN_GREEN: '#2ECC71',
    LOSE_RED: '#FF5370',
};

/** 把十六进制字符串转成 cc.Color（/cc 运行时安全） */
function color(hex: string): Color {
    return new Color().fromHEX(hex);
}

/** GameManager 注入的 UI 回调（按钮事件统一走这里，避免 UI 节点自改状态） */
export interface UIManagerHandlers {
    onStart(): void;     // 开始试玩（主菜单）
    onPause(): void;     // 暂停（游戏内 HUD 按钮）
    onResume(): void;    // 继续（暂停面板）
    onRetry(): void;     // 重玩本关（暂停/失败面板）
    onHome(): void;      // 返回主菜单
    onNext(): void;      // 下一关（胜利面板）
    onMute(): void;      // 静音切换
}

/**
 * UIManager —— 纯 UI 外壳控制器（薄层）。
 *
 * 职责（仅视图，不写任何游戏规则）：
 *  - 持有主菜单 / 暂停 / 胜利 / 失败 四个覆盖层节点，按 GameManager 的指令切 active；
 *  - 在 init() 时把各按钮的 click 事件接到 GameManager 注入的回调；
 *  - 刷新各覆盖层上的文本（最高分 / 本关得分 / 目标分 / 下一关文案）；
 *  - 用 ui-spec.md 的十六进制常量给遮罩 Sprite 着色（零外部贴图）。
 *
 * 不持有分数 / 步数等真相数据（单一真相源在 GameModel），只“读” GameManager 传进来的快照。
 */
@ccclass('UIManager')
export class UIManager extends Component {
    // ===== 覆盖层根节点 =====
    @property(Node) mainMenu: Node = null;
    @property(Node) pauseOverlay: Node = null;
    @property(Node) winOverlay: Node = null;
    @property(Node) loseOverlay: Node = null;

    // ===== 文本 =====
    @property(Label) mainHighScoreLabel: Label = null;
    @property(Label) winScoreLabel: Label = null;
    @property(Label) loseScoreLabel: Label = null;
    @property(Label) loseTargetLabel: Label = null;

    // ===== 按钮 =====
    @property(Button) startBtn: Button = null;
    @property(Button) pauseBtn: Button = null;
    @property(Button) resumeBtn: Button = null;
    @property(Button) pauseRetryBtn: Button = null;
    @property(Button) pauseHomeBtn: Button = null;
    @property(Button) winNextBtn: Button = null;
    @property(Button) winHomeBtn: Button = null;
    @property(Button) loseRetryBtn: Button = null;
    @property(Button) loseHomeBtn: Button = null;
    @property(Button) muteBtn: Button = null;

    // ===== 遮罩 Sprite（可选，用于按 ui-spec 着色）=====
    @property(Sprite) mainMenuBg: Sprite = null;
    @property(Sprite) pauseMaskSpr: Sprite = null;
    @property(Sprite) winMaskSpr: Sprite = null;
    @property(Sprite) loseMaskSpr: Sprite = null;

    private handlers: UIManagerHandlers | null = null;

    /** 注入回调并把按钮接到回调（由 GameManager.start 调用一次） */
    init(handlers: UIManagerHandlers): void {
        this.handlers = handlers;
        this.bind(this.startBtn, handlers.onStart);
        this.bind(this.pauseBtn, handlers.onPause);
        this.bind(this.resumeBtn, handlers.onResume);
        this.bind(this.pauseRetryBtn, handlers.onRetry);
        this.bind(this.pauseHomeBtn, handlers.onHome);
        this.bind(this.winNextBtn, handlers.onNext);
        this.bind(this.winHomeBtn, handlers.onHome);
        this.bind(this.loseRetryBtn, handlers.onRetry);
        this.bind(this.loseHomeBtn, handlers.onHome);
        this.bind(this.muteBtn, handlers.onMute);

        // 按 ui-spec §3.2 给遮罩着色（OVERLAY 黑，叠加节点 UIOpacity 实现半透明）
        this.tint(this.mainMenuBg, UI_COLOR.BG_TOP);
        this.tint(this.pauseMaskSpr, UI_COLOR.OVERLAY);
        this.tint(this.winMaskSpr, UI_COLOR.OVERLAY);
        this.tint(this.loseMaskSpr, UI_COLOR.OVERLAY);
    }

    private bind(btn: Button | null, cb: (() => void) | undefined): void {
        if (btn && cb) btn.node.on(Button.EventType.CLICK, cb, this);
    }

    private tint(spr: Sprite | null, hex: string): void {
        if (spr) spr.color = color(hex);
    }

    /** 设置按钮内文字（按钮通常含一个 Label 子节点） */
    private setBtnLabel(btn: Button | null, text: string): void {
        if (!btn) return;
        const lbl = btn.getComponentInChildren(Label);
        if (lbl) lbl.string = text;
    }

    // ===== 切换接口（由 GameManager 在对应时机调用）=====

    showMainMenu(highScore: number): void {
        if (this.mainHighScoreLabel) this.mainHighScoreLabel.string = `最高分 ${highScore}`;
        this.hideAll();
        if (this.mainMenu) this.mainMenu.active = true;
    }

    hideMainMenu(): void {
        if (this.mainMenu) this.mainMenu.active = false;
    }

    showPause(): void {
        if (this.pauseOverlay) this.pauseOverlay.active = true;
    }

    hidePause(): void {
        if (this.pauseOverlay) this.pauseOverlay.active = false;
    }

    showWin(score: number, hasNext: boolean): void {
        if (this.winScoreLabel) this.winScoreLabel.string = `得分 ${score}`;
        this.setBtnLabel(this.winNextBtn, hasNext ? '下一关 ▶' : '返回主菜单');
        if (this.winOverlay) this.winOverlay.active = true;
    }

    showLose(score: number, target: number): void {
        if (this.loseScoreLabel) this.loseScoreLabel.string = `得分 ${score}`;
        if (this.loseTargetLabel) this.loseTargetLabel.string = `目标 ${target}`;
        if (this.loseOverlay) this.loseOverlay.active = true;
    }

    hideAll(): void {
        this.hideMainMenu();
        this.hidePause();
        if (this.winOverlay) this.winOverlay.active = false;
        if (this.loseOverlay) this.loseOverlay.active = false;
    }

    /** 是否有任意覆盖层打开（GameManager 用它屏蔽棋盘输入） */
    anyOverlayVisible(): boolean {
        return (this.mainMenu && this.mainMenu.active)
            || (this.pauseOverlay && this.pauseOverlay.active)
            || (this.winOverlay && this.winOverlay.active)
            || (this.loseOverlay && this.loseOverlay.active);
    }

    /** 暂停时冻结覆盖层外的游戏逻辑由 GameManager 控制；此处不调用 director.pause，
     *  以保证覆盖层按钮在 Web 构建下仍可接收点击（见 ux-flow.md §6 待评审项）。 */
    pauseScene(): void { /* 预留：如需整场景冻结可在此 director.pause() */ }
    resumeScene(): void { /* 预留 */ }
}
