import { _decorator, Component, Label, Node, UIOpacity, tween, Vec3, NodePool, instantiate, Prefab, Color } from 'cc';

const { ccclass, property } = _decorator;

/**
 * ScoreFloatMgr —— 得分飘字管理器（挂在 ScoreFloatLayer 节点上）。
 *
 * 零外部资源：飘字节点 = 一个 Label（开 Outline + Shadow）+ UIOpacity，
 * 由预制体提供（首次使用时从 floatPrefab 实例化）；用 NodePool 复用，避免 GC 抖动。
 *
 * 对接点（score-float-spec §6.4）：GameManager 在有效消除后，按 crushRounds 时间戳
 * 分批调用 spawn()，文案如 "+30"，与 MATCH/BIG_MATCH 音效时间轴对齐。
 */
@ccclass('ScoreFloatMgr')
export class ScoreFloatMgr extends Component {
    /** 飘字预制体（含 Label + UIOpacity，零贴图）。需在 Inspector 拖入。 */
    @property(Prefab) floatPrefab: Prefab = null;

    /** 对象池（容量 ~16 足够 6×7 棋盘周转，见 score-float-spec §7） */
    private pool: NodePool = new NodePool();

    /**
     * 弹出一个得分飘字。
     * @param text  文案，如 "+30"
     * @param uiPos 在 ScoreFloatLayer（本节点）下的本地坐标
     * @param colorHex 可选十六进制填充色（如大消除金色 '#FFE36E'）
     */
    spawn(text: string, uiPos: Vec3, colorHex?: string): void {
        let node = this.pool.get();
        if (!node && this.floatPrefab) node = instantiate(this.floatPrefab);
        if (!node) return; // 未配置预制体时静默跳过（不阻断游戏）

        node.setParent(this.node);
        node.setPosition(uiPos.x, uiPos.y, 0);
        node.setScale(0.6, 0.6, 1);

        const label = node.getComponent(Label);
        if (label) {
            label.string = text;
            if (colorHex) label.color = new Color().fromHEX(colorHex);
        }

        const ui = node.getComponent(UIOpacity) || node.addComponent(UIOpacity);
        ui.opacity = 255;

        const endY = uiPos.y + 70;
        tween(node)
            .to(0.18, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' })
            .parallel(
                tween(node).to(0.6, { position: new Vec3(uiPos.x, endY, 0) }, { easing: 'quadOut' }),
                tween(ui).delay(0.4).to(0.25, { opacity: 0 }, { easing: 'quadIn' })
            )
            .call(() => this.pool.put(node))
            .start();
    }
}
