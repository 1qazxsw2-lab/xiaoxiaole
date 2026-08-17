import { instantiate, Node, Prefab, Sprite, Color, UIOpacity } from 'cc';
import CellModel from '../model/CellModel';
import { CellType } from '../model/ConstValue';
import CellView from './CellView';

/**
 * GridView —— 渲染层（View，薄层）
 *
 * 职责：只负责“建节点 + 把 CellView 组件挂到每个方块节点上 + 触发播放”。
 * 单个方块的动画播放已下沉到 CellView（每个节点自带一个 CellView，自己播自己的 cmd）。
 *
 * 与 Model 完全解耦：不关心任何游戏规则，只把 CellModel.cmd 演出来。
 * 用 CellModel.objectCount（全局唯一 id）做 nodeMap 键，保证节点始终跟着同一个
 * CellModel 对象走，不会因为位置变化而找错节点。
 */
export default class GridView {
    private blockPrefab: Prefab;
    private boardNode: Node;
    private colorMap: Map<CellType, Color> = new Map();

    /** objectCount -> 方块节点（新块落入 / 选中高亮都靠这个映射定位） */
    private nodeMap: Map<number, Node> = new Map();

    /** 方块被点击时回调（由 Controller 注入，传入对应的 CellModel） */
    private onCellClicked: (model: CellModel) => void;

    constructor(blockPrefab: Prefab, boardNode: Node, onCellClicked: (model: CellModel) => void) {
        this.blockPrefab = blockPrefab;
        this.boardNode = boardNode;
        this.onCellClicked = onCellClicked;

        // 颜色池与 ConstValue 的 BASIC_CELL_TYPES 顺序对应
        this.colorMap.set(CellType.RED, new Color(255, 0, 0));
        this.colorMap.set(CellType.GREEN, new Color(0, 255, 0));
        this.colorMap.set(CellType.BLUE, new Color(0, 0, 255));
        this.colorMap.set(CellType.YELLOW, new Color(255, 255, 0));
    }

    /** 初次建盘：为 Model 里所有格子创建节点并挂上 CellView */
    buildAll(cells: (CellModel | null)[][]): void {
        for (let y = 0; y < cells.length; y++) {
            for (let x = 0; x < cells[y].length; x++) {
                const model = cells[y][x];
                if (model) this.createNode(model);
            }
        }
    }

    /** 销毁所有节点（重开局时用）。
     *  注意：必须同时清理 boardNode 下的真实子节点（instantiate 出来的方块节点），
     *  不能只清 nodeMap，否则 destroy 异步生效前重建会残留“多余节点”。 */
    clearAll(): void {
        this.boardNode.removeAllChildren(true);
        this.nodeMap.clear();
    }

    /** 根据 CellModel 创建一个方块节点，挂上 CellView 组件，并登记到 nodeMap */
    private createNode(model: CellModel): Node {
        const node = instantiate(this.blockPrefab);
        node.setParent(this.boardNode);
        // 绑定触摸：点到方块就通知 Controller，并带上对应的数据模型（用闭包捕获，无需 as any 反查）
        node.on(Node.EventType.TOUCH_END, () => this.onCellClicked(model), this);

        // 设置方块颜色
        const sprite = node.getChildByName('bg')?.getComponent(Sprite);
        if (sprite && model.type) {
            sprite.color = this.colorMap.get(model.type) ?? new Color(255, 255, 255);
        }

        // 从棋盘上方落入的补块（startY<0）初始设为透明：
        // Model 已写了 setVisible(0,false)，这里先置 0 避免“建节点那一帧”瞬闪；
        // 下落开始时 setVisible 会把它切回 255。
        const uiOpacity = node.getComponent(UIOpacity) || node.addComponent(UIOpacity);
        uiOpacity.opacity = model.startY < 0 ? 0 : 255;

        // 获得 CellView 组件（替代原来的 (node as any).cellModel = model）
        const cellView = node.getComponent(CellView);
        cellView.initWithModel(model);
        // 消除销毁节点时，从 nodeMap 注销，避免悬空引用
        cellView.onRemoved = () => this.nodeMap.delete(model.objectCount);

        this.nodeMap.set(model.objectCount, node);
        return node;
    }

    /** 选中高亮：委托给 CellView */
    setSelected(model: CellModel, on: boolean): void {
        const node = this.nodeMap.get(model.objectCount);
        if (!node) return;
        node.getComponent(CellView)?.setSelect(on);
    }

    /**
     * 播放一次操作产生的全部变化：为每个发生改变的格子找到 / 创建其 CellView 并播放。
     * @returns 本次动画总时长（秒），供 Controller 等待后解锁输入
     */
    playChanges(changeModels: CellModel[]): number {
        let maxEnd = 0;
        for (const model of changeModels) {
            // 没有节点 = 下落时新生成的方块，先建节点（会从棋盘上方落入）
            let node = this.nodeMap.get(model.objectCount);
            if (!node) node = this.createNode(model);
            const cellView = node.getComponent(CellView);
            if (cellView) {
                maxEnd = Math.max(maxEnd, cellView.updateView());
            }
        }
        return maxEnd;
    }
}
