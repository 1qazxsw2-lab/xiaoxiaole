/*
 * 自定义 ESM 解析 loader（仅用于 Node 测试环境）。
 *
 * 背景：GameModel / CellModel 在源码里 `import { Vec2, v2 } from 'cc'`。
 * Node 22 的 --experimental-transform-types 走的是 ESM 解析管线，而 ESM 不读取
 * NODE_PATH，因此裸说明符 `cc` 无法用 NODE_PATH 注入。本 loader 拦截 `cc`，
 * 把它重定向到同目录的 cc.js 运行时存根（只实现 v2）。
 *
 * 用法：node --experimental-loader ./test/stubs/cc-resolver.mjs --experimental-transform-types <测试文件>
 * （不改 assets/ 源码、不改 package.json，纯新增文件，符合约束。）
 */
import { pathToFileURL } from 'node:url';

const stubUrl = new URL('./cc.js', import.meta.url).href;

export async function resolve(specifier, context, nextResolve) {
    if (specifier === 'cc') {
        return { url: stubUrl, shortCircuit: true };
    }
    // 模型源码使用「无扩展名」相对导入（如 ./CellModel），而 Node 的 ESM 解析不自动补全。
    // 这里为相对且无扩展名的说明符补上 .ts，交给 --experimental-transform-types 转译。
    if (specifier.startsWith('.') && !/\.[cm]?[jt]s$/.test(specifier)) {
        try {
            return await nextResolve(specifier + '.ts', context);
        } catch (e) {
            // 补 .ts 失败则回退到默认解析
        }
    }
    return nextResolve(specifier, context);
}
