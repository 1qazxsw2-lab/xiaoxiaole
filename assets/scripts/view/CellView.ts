import { _decorator, Component, tween, Vec3, UIOpacity } from 'cc';
import { CELL_WIDTH, CELL_HEIGHT } from '../model/ConstValue';
import CellModel from '../model/CellModel';

const { ccclass } = _decorator;

/**
 * CellView —— 挂在每个方块节点上的「视图壳」（参考项目同名组件的最小版）
 *
 * 职责（仅保留基础三消所需，不含原项目的障碍物 / 特殊块 / 动画片段）：
 *  - 持有对应的 CellModel 引用（替代 (node as any).cellModel = model 这种 hack）
 *  - initWithModel：绑定数据模型并定位初始位置
 *  - updateView：消费 model.cmd，按 playTime 调度播放本格子的动画
 *  - setSelect：选中高亮
 *
 * 每个 Node 自带一个 CellView，自己播自己的动画；GridView 不再集中播放，
 * 只负责建节点、把 CellView 挂上去、并在需要时触发 updateView。
 */
@ccclass('CellView')
export default class CellView extends Component {
    /** 数据模型回指针：本节点对应的 CellModel（类型安全，替代 as any） */
    private model: CellModel | null = null;
    private isSelect: boolean = false;
    /** 节点被消除销毁时回调，供 GridView 从 nodeMap 注销，避免悬空引用 */
    onRemoved: (() => void) | null = null;

    /** 网格坐标 (x=列, y=行) → 像素局部坐标（与 GridView 原来 getPixelPosition 一致） */
    private toPixel(gridX: number, gridY: number): Vec3 {
        const x = gridX * CELL_WIDTH + CELL_WIDTH / 2;
        const y = gridY * -CELL_HEIGHT - CELL_HEIGHT / 2;
        return new Vec3(x, y, 0);
    }

    /** 建盘 / 创建节点后调用：绑定数据模型并定位初始位置 */
    initWithModel(model: CellModel): void {
        this.model = model;
        this.node.setPosition(this.toPixel(model.startX, model.startY));
    }

    /**
     * 消费 model.cmd，按 playTime 调度播放本格子的动画。
     * 逻辑与原 GridView.playChanges 逐格部分一致，只是作用域收敛到「自己这一个格子」。
     * @returns 本格子动画结束时间（秒），供 GridView 计算本次总时长
     */
    updateView(): number {
        if (!this.model) return 0;

        // cmd 按 playTime 升序排，保证同一节点的动画顺序正确
        const cmds = this.model.cmd.slice().sort((a, b) => a.playTime - b.playTime);
        let tw = tween(this.node);
        let cursor = 0;     // 已消耗的时间轴位置
        let willDie = false;

        for (const cmd of cmds) {
            const gap = Math.max(0, cmd.playTime - cursor); // 等够到该指令的开始时间
            if (gap > 0) tw = tw.delay(gap);

            if (cmd.action === 'moveTo' && cmd.pos) {
                tw = tw.to(cmd.keepTime, { position: this.toPixel(cmd.pos.x, cmd.pos.y) });
            } else if (cmd.action === 'toDie') {
                willDie = true;
                tw = tw.to(cmd.keepTime, { scale: new Vec3(0, 0, 1) }); // 缩小消失 = 消除
            } else if (cmd.action === 'setVisible') {
                // 切换节点透明度：false=隐藏（消除期间不显示补块）/ true=下落开始时显形
                tw = tw.call(() => {
                    const ui = this.node.getComponent(UIOpacity) || this.node.addComponent(UIOpacity);
                    ui.opacity = cmd.isVisible ? 255 : 0;
                });
            }

            cursor = cmd.playTime + cmd.keepTime;
        }

        // 死亡动画结束后销毁节点，并通知 GridView 注销映射
        if (willDie) {
            tw = tw.call(() => {
                this.onRemoved?.();
                this.node.destroy();
            });
        }
        tw.start();
        return cursor;
    }

    /** 选中高亮：放大并提到最上层（再次点击取消） */
    setSelect(flag: boolean): void {
        if (this.isSelect === flag) return;
        this.node.setScale(flag ? new Vec3(1.2, 1.2, 1) : new Vec3(1, 1, 1));
        if (flag && this.node.parent) {
            this.node.setSiblingIndex(this.node.parent.children.length - 1);
        }
        this.isSelect = flag;
    }
}
