import { _decorator, Color, Component, instantiate, Label, Node, Prefab, Sprite, tween, Tween, Vec3 } from 'cc';
import { calcScore, canMatchAfterSwap, collapseAndRefill, createBoard, findMatches, hasValidMove, Move, removeMatches } from './BoardLogic';
const { ccclass, property } = _decorator;

@ccclass('GameManager')
export class GameManager extends Component {
    @property(Prefab) blockPrefab: Prefab = null;
    private blockPrefabSize: {width: number, height: number } = {width: 100, height: 100};

    @property(Node) blockBoard: Node = null;

    private colors: { [key: number]: Color } = {
        0: new Color(255, 0, 0), // Red
        1: new Color(0, 255, 0), // Green
        2: new Color(0, 0, 255), // Blue
        3: new Color(255, 255, 0) // Yellow
    };
    private colorCount: number = 4;
    private boardRows: number = 7;
    private boardCols: number = 6;

    private board: number[][] = [];
    private blockArray: Node[][] = [];

    private selected: { row: number; col: number } | null = null;

    private duration: number = 0.15; // 移动/交换动画时间
    private isProcessing: boolean = false;

    private score: number = 0;

    @property(Label) private scoreLabel: Label = null;
    
    

    start() {
        do{
            this.board = createBoard(this.boardRows, this.boardCols, this.colorCount);
        }while(!hasValidMove(this.board));
        this.createBlocks();
        this.updateScore();
    }

    createBlocks() {
        this.board.forEach((row, i) => {
            this.blockArray[i] = [];
            row.forEach((color, j) => {
                this.initBlock(i, j, color);
            });
        });
    }

    initBlock(row: number, col: number, color: number,x?: number, y?: number): Node{
        const block = instantiate(this.blockPrefab);
        block.on(Node.EventType.TOUCH_END, () => this.onBlockTouched(block), this)
        block.setParent(this.blockBoard);
        this.blockArray[row][col] = block;
        block.setPosition(this.getBlockPosition(x?? row, y ?? col));
        const blockSprite = block.getChildByName('bg').getComponent(Sprite);
        blockSprite.color = this.colors[color];
        return block;
    }

    getBlockCoord(block: Node): {row: number, col: number} {
        const height = this.blockPrefabSize.height;
        const width = this.blockPrefabSize.width;
        const i = -((block.position.y + height/2) / height);
        const j = ((block.position.x - width/2) / width);
        return {row: Math.floor(i), col: Math.floor(j)};
    }

    getBlockPosition(i: number, j: number): Vec3{
        const height = this.blockPrefabSize.height;
        const width = this.blockPrefabSize.width;
        const x = j * width + width/2;
        const y = i * -height - height/2;
        return new Vec3(x, y, 0);
    }
    
    onBlockTouched(blockNode: Node) {
        if (this.isProcessing) return;              // 锁：动画期间禁止输入
        const {row, col} = this.getBlockCoord(blockNode);   
        if(!this.selected){
            this.selected = {  row: row, col: col };
            this.selectedBlockVisual(row, col);
            return;
        }
        if(this.selected.row === row && this.selected.col === col){
            this.resetSelectedBlockVisual();
            this.selected = null;
            return;
        }
        if(!this.isAdjacentBlock(row, col)){
            this.resetSelectedBlockVisual();
            this.selected = { row: row, col: col };
            this.selectedBlockVisual(row, col);
            return;
        }
        const move: Move = {from: {x: this.selected.row, y: this.selected.col}, to: {x: row, y: col}};
        this.tryBlockSwap(blockNode, move);
    }

    async tryBlockSwap(block: Node, move: Move) {
        if (this.isProcessing) return;
        this.isProcessing = true;
        try {
            this.resetSelectedBlockVisual();
            const otherBlock = this.blockArray[this.selected.row][this.selected.col];
            const canSwap = canMatchAfterSwap(this.board, this.selected.row, this.selected.col, move.to.x, move.to.y);
            if (canSwap) {
                await this.animateSwap(block, otherBlock);   // ① 交换动画
                this.swapBlocks(this.selected.row, this.selected.col, move.to.x, move.to.y); // ② 数据交换
                await this.resolveBlockMatches();                // ③ 消除+下落，全部播完
            } else {
                await this.animateSwap(block, otherBlock);   // 假装交换过去
                await this.animateSwap(block, otherBlock);   // 再换回来 = 无效回弹
            }
            this.selected = null;
        } finally {
            this.isProcessing = false;
        }
    }

    private async resolveBlockMatches() {
        let guard = 0;
        while (guard++ < 100) {
            const matches = findMatches(this.board);
            if (matches.size === 0) break;
            // ① 消除动画（并行动画 Promise.all）播完
            const matchCount = await this.removeBlockMatches(matches);
            this.updateScore(matchCount, guard);
            await this.collapseAndRefillBlocks();
        }
        // 连锁全部结束后检测死局：全盘无任何可消除的交换 → 自动重开新棋盘
        if (!hasValidMove(this.board)) {
            this.restartBoard();
        }
    }

    // 死局重开：销毁全部旧方块节点，生成有解新棋盘并重建表现层
    private restartBoard() {
        for (const row of this.blockArray) {
            for (const block of row) {
                if (block) block.destroy();
            }
        }
        this.blockArray = [];
        do {
            this.board = createBoard(this.boardRows, this.boardCols, this.colorCount);
        } while (!hasValidMove(this.board));
        this.createBlocks();
    }

    updateScore(matchCount?: number, guard?: number){
        if(!this.scoreLabel) return;
        if(matchCount && guard) {
            this.score += calcScore(matchCount,guard); 
        }         
        this.scoreLabel.string = this.score.toString();
    }

    isAdjacentBlock(i: number, j: number): boolean{
        return Math.abs(this.selected.row - i) + Math.abs(this.selected.col - j) === 1;
    }

    selectedBlockVisual(i: number, j: number) {
        const blockNode = this.blockArray[i][j];
        if(blockNode) {
            blockNode.scale = new Vec3(1.2, 1.2, 1);
            blockNode.setSiblingIndex(this.blockBoard.children.length - 1);  // 移到兄弟列表末尾 = 最上层
        }
    }

    resetSelectedBlockVisual(){
        if(this.selected) {
            const blockNode = this.blockArray[this.selected.row][this.selected.col];
            if(blockNode) {
                blockNode.scale = new Vec3(1, 1, 1);
            }
        }
    }

    swapBlocks(row: number, col: number, i: number, j: number) {
        const tempColor = this.board[row][col];
        this.board[row][col] = this.board[i][j];
        this.board[i][j] = tempColor;

        const tempNode = this.blockArray[row][col];
        this.blockArray[row][col] = this.blockArray[i][j];
        this.blockArray[i][j] = tempNode;
    }

    async removeBlockMatches(matches: Map<number, Set<number>>): Promise<number> {
        const tasks: Promise<void>[] = [];
        const positions: [number, number][] = [];

        for (const [x, ys] of matches) {
            if (!this.blockArray[x]) continue;
            for (const y of ys) {
                const block = this.blockArray[x]?.[y];
                if (block) {
                    tasks.push(this.animateEliminate(block));
                    positions.push([x, y]);
                }
            }
        }

        await Promise.all(tasks);  // 等待所有动画完成

        // 统一销毁并清空数组
        for (const [x, y] of positions) {
            const block = this.blockArray[x]?.[y];
            if (block) {
                block.destroy();
                this.blockArray[x][y] = null;
            }
        }
        removeMatches(this.board, matches);
        return positions.length;
    }

    private async collapseAndRefillBlocks(): Promise<void> {
        const moves = collapseAndRefill(this.board, this.colorCount);
        await Promise.all(moves.map(move => this.applyBlocks(move)));
    }

    applyBlocks(move: Move): Promise<void> {
        let block: Node | null = null;
        if(move.from.x !== -2) {
            block = this.blockArray[move.from.x][move.from.y];
            this.blockArray[move.to.x][move.to.y] = block;
            this.blockArray[move.from.x][move.from.y] = null;
        }else{
            const color = this.board[move.to.x][move.to.y];
            const {x, y} = move.from;
            const {x:row, y:col} = move.to;
            block = this.initBlock(row, col, color, x, y);
        }
        if(!block) return Promise.resolve();
        return this.animateTo(block, move.to.x, move.to.y);
    }

    // 移动/交换：tween 播完才 resolve
    private animateTo(block: Node, toX: number, toY: number): Promise<void> {
        return new Promise(resolve => {
            tween(block)
                .to(this.duration, { position: this.getBlockPosition(toX, toY) }, { easing: 'quadOut' })
                .call(() => resolve())
                .start();
        });
    }

    private animateSwap(blockA: Node, blockB: Node): Promise<void> {
        const posA = blockA.position.clone();
        const posB = blockB.position.clone();
        return new Promise(resolve => {
            let pending = 2;
            const done = () => { if (--pending === 0) resolve(); };
            tween(blockA)
                .to(this.duration, { position: posB }, { easing: 'quadOut' })
                .call(done)
                .start();
            tween(blockB)
                .to(this.duration, { position: posA }, { easing: 'quadOut' })
                .call(done)
                .start();
        });
    }

    // 消除：放大 + 淡出，播完 destroy 再 resolve
    // 淡出提示：节点透明度用 UIOpacity 组件（node.addComponent(UIOpacity) 后 tween opacity）
    private animateEliminate(block: Node): Promise<void> {
        return new Promise(resolve => {
            tween(block)
                .to(0.15, { scale: new Vec3(1.3, 1.3, 1) }, { easing: 'quadOut' })
                .call(() => resolve())
                .start();      
        });
    }
}



