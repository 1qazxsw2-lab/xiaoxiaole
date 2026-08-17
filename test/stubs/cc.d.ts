/*
 * cc 模块最小「类型」存根（供需要把模型编译成 JS、或 IDE 类型检查的场景使用）。
 * 运行期由同目录的 cc.js 提供实现，Node 直接转译 .ts 时不需要本文件。
 *
 * 只声明 GameModel / CellModel 实际用到的部分：Vec2 类型 与 v2 构造器。
 */
declare module 'cc' {
    export interface Vec2 {
        x: number;
        y: number;
    }
    export function v2(x?: number, y?: number): Vec2;
}
