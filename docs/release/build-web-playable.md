# XiaoXiaoLe · Web / 试玩广告（H5 Playable Ad）构建配置与方案

> 适用：Cocos Creator 3.8.8 · 目标平台 Web（竖屏三消试玩广告）· solo 应届生作品集
> 维护：发行运营（release-ops）｜状态：**方案文档（配置改动需主理人批准后执行）**

---

## 0. 现状核对结论（基于本次读取，方案据此定制）

| 检查项 | 结果 | 对方案的影响 |
|---|---|---|
| `package.json` | 仅含 `name / uuid / creator`，**无任何构建脚本** | 需要新增 `build:web` / `build:playable` 脚本（待批准） |
| 引擎模块 `settings/v2/packages/engine.json` → `includeModules` | 含 `spine-3.8 / dragon-bones / particle-2d / physics-2d-box2d / tiled-map / video / webview / rich-text / profiler` 等 | 三消玩法**未用到**这些模块，可大幅剔除减体积 |
| 资源里是否用了 spine / dragonbones | `assets/` 下 grep 无 `spine/dragonBones` 引用 | 安全删除 spine/dragonbones（并消除下面那条 wasm） |
| 产物里的 `.wasm` | `build/web-desktop/cocos-js/assets/spine-CC34fKUR.wasm` **存在** | 由 spine 模块带入；剔除 spine 后消失 |
| 现有构建体积基线 | 总 **3.4 MB**（cocos-js 3.1M / assets 269K / src 77K） | 引擎占绝对大头；游戏代码仅 77K |
| 加载链路 | `polyfills.bundle.js → system.bundle.js → import-map.json → System.import('./index.js')` → 拉取 `cc`/`application.js`/`cocos-js/*`/资源 | 单文件内联用「fetch/XHR 拦截 shim」最稳 |
| `build-templates/` | **不存在** | 需新建 `build-templates/web-mobile/` 放自定义模板 |
| 音频源文件 | `assets/audio/bg.wav` 705 KB（未压缩），SFX 共约 200 KB | 试玩广告最大单点优化：wav→ogg/mp3 或删除 BGM |

> ⚠️ 引擎 `engine.json` 存在一处不一致：`includeModules` 列出了 `physics-2d-box2d`，但其 `cache._value` 为 `false`。请在编辑器「功能裁剪」面板核对实际勾选状态并重新保存，确保裁剪结果干净。

---

## 1. 目标与约束

- **自包含单文件 HTML**：js / wasm / data / 资源全部内联，不依赖任何外部网络请求（试玩广告平台要求）。
- **体积上限**：单包建议 ≤ **3 MB**（多数平台安全），极限 ≤ **5 MB**；理想 ≤ **2 MB** 以加速首屏。
- **锁定竖屏**：`720×1280` 设计分辨率，禁止旋转。
- **关闭 MD5 缓存**：文件名稳定，便于后处理脚本确定性内联。
- **剔除无关模块**：3D / 物理 / 骨骼动画 / 粒子 / 视频 / WebView 等一律不要。

---

## 2. 编辑器构建配置（Project / Builder 逐项）

> 以下均在 **Cocos Creator 3.8.8 编辑器**内完成；本方案**不修改任何工程配置文件**，全部通过 UI 操作，便于 solo 同学复现与作品集展示。

### 2.1 平台选择
- **Project → Build（构建）** → 平台选 **Web-Mobile**（不是 Web-Desktop）。
- Web-Mobile 自带移动端 viewport / 触摸处理，最适合试玩广告容器。

### 2.2 屏幕方向（竖屏锁定）
- **Project Settings（项目设置）→ General（常规）→ Orientation（屏幕朝向）** 设为 **Portrait（竖屏）**。
- 同时在自定义 `index.html` 模板里加 `<meta name="screen-orientation" content="portrait">` 与横屏旋转兜底（见 §5）。

### 2.3 功能裁剪（减体积核心）
- **Project Settings → Feature Cropping（功能裁剪）**：取消勾选以下**本项目用不到**的模块（先构建验证再定稿，见 §2.6）：

| 操作 | 模块 | 说明 |
|---|---|---|
| ❌ 移除 | `spine`（spine-3.8） | 无 spine 资源；**移除后消除 spine-*.wasm** |
| ❌ 移除 | `dragon-bones` | 无龙骨资源 |
| ❌ 移除 | `particle-2d` | 无粒子资源 |
| ❌ 移除 | `physics-2d`（box2d 等全部） | 三消无物理 |
| ❌ 移除 | `tiled-map` | 无 Tiled 地图 |
| ❌ 移除 | `video` / `webview` | 试玩广告不需要 |
| ❌ 移除 | `profiler` | 仅开发期，发布剔除 |
| ❌ 移除（如未用 RichText 组件） | `rich-text` | HUD 用普通 Label 即可不要 |
| ❌ 移除（验证后） | `intersection-2d` / `mask` | 点击用 UI Button 命中，通常不需要 |
| ✅ 保留 | `base / 2d / gfx-webgl / gfx-webgl2 / ui / graphics / animation / tween / audio / affine-transform / custom-pipeline` | 三消核心必需 |

> 保留 `audio`（音效提升转化），但务必把音频转压（见 §4）。如追求极致体积也可在试玩版本里关掉 `audio` 仅留静音玩法。

### 2.4 Builder 构建选项（Web-Mobile）
| 选项 | 设置 | 原因 |
|---|---|---|
| **MD5 Cache** | **取消勾选（关闭）** | 文件名稳定，后处理内联可确定性匹配 |
| **Render Mode（渲染模式）** | **WebGL**（硬件加速，性能最佳；仅在目标 webview 明确不支持 WebGL 时退到 Canvas）｜枚举值请在你的 Builder 下拉中确认 |
| **Debug** | 关闭 | 减小体积、避免源码暴露 |
| **Source Maps** | 关闭 | 同上 |
| **First Screen（首屏）** | 设纯色或首图 | 加速感知加载，配合模板 loading 层 |
| **Merge all JSON（合并 JSON）** | 可选开启 | 减少请求数（单文件场景收益有限，但无害） |
| **Main bundle is remote / 资源远程** | **必须关闭** | 所有资源本地打包，才能单文件自包含 |

### 2.5 资源打包前置
- 确认 **Project Settings → Asset Manager / Bundle** 中**没有**把主包或资源设为远程（remote）地址；试玩广告要求零外链。
- 把 `assets/audio` 等需随包的资源放进**主包（main bundle）**，不要拆远程 Bundle。

### 2.6 裁剪验证（必做，防误删导致运行时报错）
1. 完成 §2.3 裁剪后**重新构建** Web-Mobile。
2. 用浏览器打开 `build/web-mobile/index.html`，**打开 DevTools Console**，确认无 `module not found / xxx is not a function` 类报错。
3. 实际玩一局：交换、消除、连锁、计分、无解重开均正常。
4. 若报错，回编辑器把对应模块重新勾上，再构建。重复至干净。

---

## 3. 体积预算与自查清单

### 3.1 常见广告平台单包限制（参考值，以各平台最新文档为准）
| 平台 | 常规要求 | 备注 |
|---|---|---|
| Mintegral | ≤ 5 MB（多数 ≤ 3–5 MB，部分 placement ≤ 2 MB / 要求即时加载） | 看具体 placement 要求 |
| IronSource | ≤ 5 MB，建议 ≤ 3–4 MB | 部分要求 ≤ 2 MB |
| Google（App/AdMob H5） | HTML/Zip ≤ 4 MB | |
| Unity Ads / AppLovin | ≤ 5 MB | |
| **本项目推荐目标** | **≤ 3 MB（理想 ≤ 2 MB），硬上限 5 MB** | 首屏越快，转化越好 |

### 3.2 本项目体积基线 vs 目标
| 部分 | 当前（web-desktop 基线） | 裁剪+转压后目标 |
|---|---|---|
| 引擎 cocos-js | 3.1 MB | 1.5–2.2 MB（剔除 spine/粒子/物理/龙骨等） |
| 资源 assets | 269 KB（含 705KB 源 BGM 压后更小） | 80–200 KB（BGM 转 ogg/mp3 或删除） |
| 游戏代码 src | 77 KB | 不变 |
| **单文件 HTML 合计** | — | **≤ 3 MB（目标）** |

### 3.3 体积自查 Checklist（发布前逐条打勾）
- [ ] 构建产物 `build/web-mobile/` 不含任何 `.wasm`（确认 spine 已剔除）
- [ ] `cocos-js` 体积 ≤ 2.2 MB
- [ ] 所有 `.wav` 已转 `.ogg/.mp3`（或删除 BGM）；音频合计 ≤ 200 KB
- [ ] 关闭 MD5 Cache、Debug、Source Maps
- [ ] 无任何远程资源 URL（grep 构建产物无 `http://`/`https://` 资源地址）
- [ ] 单文件 HTML ≤ 3 MB（极限 ≤ 5 MB）
- [ ] 浏览器离线（断网）打开仍可完整加载运行（验证零外链）

---

## 4. 音频体积优化（试玩广告最大单点）

- `assets/audio/bg.wav` 705 KB 是最大单文件，试玩广告通常**不需要长 BGM**，建议：
  - 方案 A（推荐）：删除 `bg.wav`，仅保留短 SFX（match / swap / select / invalid / bigMatch / shuffle）。
  - 方案 B：保留 BGM 但转 `bg.ogg`（约 80–150 KB）。
- 全部 SFX `.wav` → `.ogg/.mp3`（约 20–40 KB 合计）。
- 在编辑器把 AudioClip 的 `mode` 设为 `WEB_AUDIO`（流式/压缩），避免未压缩 PCM 入包。

---

## 5. build-templates 用法（自定义模板 + 竖屏 + loading + CTA）

Cocos Creator 支持在项目根建 **`build-templates/<平台名>/`**，构建时会把该目录文件**覆盖**到对应平台产物根目录。我们用 `web-mobile`。

### 5.1 目录结构
```
XiaoXiaoLe/
└── build-templates/
    └── web-mobile/
        └── index.html      # 自定义入口（覆盖默认）
```

### 5.2 `build-templates/web-mobile/index.html` 参考
> 要点：保持与默认一致的加载顺序（`polyfills → system → import-map → System.import('./index.js')`），后处理脚本才能稳定内联；额外加了竖屏锁定、loading 层、试玩 CTA 桥接。

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>XiaoXiaoLe</title>
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,minimum-scale=1,user-scalable=no,viewport-fit=cover"/>
  <meta name="apple-mobile-web-app-capable" content="yes"/>
  <meta name="mobile-web-app-capable" content="yes"/>
  <meta name="screen-orientation" content="portrait"/>
  <meta name="orientation" content="portrait"/>
  <meta name="x5-fullscreen" content="true"/>
  <style>
    html,body{margin:0;padding:0;height:100%;background:#1b1030;overflow:hidden;}
    *{ -webkit-tap-highlight-color:transparent; -webkit-touch-callout:none; user-select:none; }
    #GameDiv{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;}
    canvas{ touch-action:none; }
    #loading{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;
             color:#fff;font-family:sans-serif;font-size:18px;z-index:10;}
    #cta{position:fixed;left:50%;bottom:6%;transform:translateX(-50%);z-index:20;
         padding:14px 28px;border:none;border-radius:999px;background:#ff5b6e;color:#fff;
         font-size:18px;font-weight:700;box-shadow:0 6px 18px rgba(0,0,0,.35);display:none;}
  </style>
</head>
<body>
  <div id="loading">加载中…</div>
  <div id="GameDiv" cc_exact_fit_screen="false" style="width:720px;height:1280px;">
    <div id="Cocos3dGameContainer">
      <canvas id="GameCanvas" width="720" height="1280" tabindex="99"></canvas>
    </div>
  </div>
  <button id="cta">下载游戏</button>

  <!-- 加载顺序与默认一致：polyfills → system → import-map → 引导 -->
  <script src="src/polyfills.bundle.js" charset="utf-8"></script>
  <script src="src/system.bundle.js" charset="utf-8"></script>
  <script src="src/import-map.json" type="systemjs-importmap" charset="utf-8"></script>
  <script>
    // 竖屏锁定：横屏时整体旋转 90° 兜底
    (function(){
      var g = document.getElementById('GameDiv');
      function lock(){
        var land = (window.orientation !== undefined) ? Math.abs(window.orientation) === 90
                  : (window.innerWidth > window.innerHeight);
        g.style.transform = land ? 'rotate(90deg)' : 'none';
      }
      window.addEventListener('resize', lock); lock();
    })();
    // 引擎启动后由游戏脚本调用 window.__hideLoading() 关闭 loading
    window.__hideLoading = function(){ var l=document.getElementById('loading'); if(l) l.style.display='none'; };
    // 试玩广告 CTA 桥接：展示与点击转化（按平台替换实现）
    var cta = document.getElementById('cta');
    window.showCTA = function(){ cta.style.display='block'; };
    cta.addEventListener('click', function(){
      if (window.install) window.install();                                    // Mintegral 等
      else if (window.parent && window.parent.postMessage) window.parent.postMessage('download','*'); // IronSource 等
      else window.open('https://your-store-url','_blank');                      // 兜底
    });
    System.import('./index.js').catch(function(err){ console.error(err); });
  </script>
</body>
</html>
```

> 模板里**不要依赖未文档化的 EJS/变量**（不同 3.8 小版本可能不一致）。保持上述静态 script 引用即可，内联交给 §6 后处理脚本。
> 游戏侧建议在 `application.start()` 成功后调用一次 `window.__hideLoading?.()`，并在合适时机（如首次消除后或倒计时结束）调用 `window.showCTA?.()` 弹出转化按钮——这部分由玩法/表现层代码实现，发行侧仅定义好桥接接口。

---

## 6. 单文件 HTML 后处理方案（post-build 脚本）

构建出 `build/web-mobile/` 后，用 Node 脚本把所有 js / css / wasm / data / 资源**内联进一个 HTML**，原理是安装一个 **fetch / XMLHttpRequest 拦截 shim**：运行时引擎发起的资源请求全部从内存 base64 返回，实现零外链单文件。

### 6.1 脚本位置与调用
- 脚本放 `tools/build-playable.mjs`（**本文档仅提供参考代码，未创建该文件**；如需我落地请主理人批准）。
- 调用：`node tools/build-playable.mjs` → 输出 `dist/playable.html`。

### 6.2 参考脚本（`tools/build-playable.mjs`）
```js
// 将 build/web-mobile/ 产物内联为单个自包含 HTML（试玩广告用）
// 用法: node tools/build-playable.mjs
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BUILD_DIR = process.env.BUILD_DIR
  ? resolve(__dirname, process.env.BUILD_DIR)
  : resolve(__dirname, '../build/web-mobile');
const OUT = process.env.OUT_HTML
  ? resolve(__dirname, process.env.OUT_HTML)
  : resolve(__dirname, '../dist/playable.html');

// 1) 收集 BUILD_DIR 下所有文件 -> { "./相对路径": 绝对路径 }
const fileMap = {};
function walk(dir, rel) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const r = rel ? rel + '/' + name : name;
    if (statSync(full).isDirectory()) walk(full, r);
    else fileMap['./' + r.split(sep).join('/')] = full;
  }
}
walk(BUILD_DIR, '');

const mimeOf = (p) => {
  if (/\.m?js$/i.test(p)) return 'text/javascript';
  if (p.endsWith('.wasm')) return 'application/wasm';
  if (p.endsWith('.json')) return 'application/json';
  if (p.endsWith('.css')) return 'text/css';
  if (p.endsWith('.data')) return 'application/octet-stream';
  if (p.endsWith('.png')) return 'image/png';
  if (/\.jpe?g$/i.test(p)) return 'image/jpeg';
  if (/\.(ogg|mp3|wav)$/i.test(p)) return 'audio/mpeg';
  return 'application/octet-stream';
};

// 2) base64 编码（内联的 loader 脚本从 MAP 移除，避免重复）
const encodeMap = {};
const INLINE_LOADER = ['./src/polyfills.bundle.js', './src/system.bundle.js', './src/import-map.json'];
for (const [url, full] of Object.entries(fileMap)) {
  if (INLINE_LOADER.includes(url)) continue; // 这些直接内联为 static script，不进 shim
  encodeMap[url] = { mime: mimeOf(full), b64: readFileSync(full).toString('base64') };
}
const mapJson = JSON.stringify(encodeMap);

// 3) 拦截 shim：fetch / XHR 全部从内存 base64 返回
const shim = `
<script>
(function(){
  var MAP = ${mapJson};
  function dec(b64){var s=atob(b64);var u=new Uint8Array(s.length);for(var i=0;i<s.length;i++)u[i]=s.charCodeAt(i);return u.buffer;}
  function find(url){var u=(''+url).split('?')[0];if(MAP[u])return MAP[u];var i=u.lastIndexOf('/');if(i>=0){var base=u.slice(i+1);for(var k in MAP){if(k.slice(k.lastIndexOf('/')+1)===base)return MAP[k];}}return null;}
  function res(e){return new Response(dec(e.b64),{status:200,headers:{'Content-Type':e.mime}});}
  if(window.fetch){var _f=window.fetch.bind(window);window.fetch=function(u,o){var e=find(typeof u==='string'?u:(u&&u.url)||'');return e?Promise.resolve(res(e)):_f(u,o);};}
  var _X=window.XMLHttpRequest;if(_X){var p=_X.prototype,oOpen=p.open;p.open=function(m,u){this.__u=u;return oOpen.apply(this,arguments);};var oSend=p.send;p.send=function(){var e=find(this.__u||'');if(e){var s=this;setTimeout(function(){try{Object.defineProperty(s,'response',{value:dec(e.b64)});Object.defineProperty(s,'responseText',{value:atob(e.b64)});}catch(_){}s.status=200;s.readyState=4;s.dispatchEvent(new Event('load'));if(s.onload)s.onload();if(s.onreadystatechange)s.onreadystatechange();},0);return;}return oSend.apply(this,arguments);};}
})();
</script>`;

// 4) 处理 index.html：注入 shim；内联 loader 脚本与 import-map
let html = readFileSync(join(BUILD_DIR, 'index.html'), 'utf8');
html = html.replace(/<head[^>]*>/i, (m) => m + shim);

// 内联 import-map（json 文件内容直接塞进 script）
html = html.replace(
  /<script\s+src="src\/import-map\.json"[^>]*>\s*<\/script>/i,
  () => `<script type="systemjs-importmap">${readFileSync(fileMap['./src/import-map.json'], 'utf8')}</script>`
);
// 内联 polyfills / system
for (const f of ['./src/polyfills.bundle.js', './src/system.bundle.js']) {
  const re = new RegExp('<script\\s+src="' + f.replace('./', '') + '"[^>]*>\\s*</script>', 'i');
  html = html.replace(re, () => `<script>${readFileSync(fileMap[f], 'utf8')}</script>`);
}

// 5) 输出
writeFileSync(OUT, html);
console.log('Playable written ->', OUT, '(', (Buffer.byteLength(html) / 1024 / 1024).toFixed(2), 'MB )');
```

### 6.3 脚本说明与注意
- **为何用 shim 而非逐个拼接 module**：Cocos 3.x Web 走 SystemJS，`index.js` 再动态 `import('cc')` / `application.js` / 全部 `cocos-js/*` / `settings.json` / 资源。用 fetch/XHR 拦截可**不改加载逻辑**即实现全内联，最稳妥。
- **wasm 也覆盖**：即便未来重新引入 spine 等带 wasm 的模块，shim 以 `application/wasm` 返回，引擎 `WebAssembly.instantiate` 仍可工作——单文件不破。
- **内联 loader 脚本**（`polyfills/system/import-map`）直接写进 `<script>`，不走 shim，减少一层 base64 体积。
- 输出后务必做 **§3.3 离线自检**：断网打开 `dist/playable.html`，玩一局确认零外链。

---

## 7. package.json 构建脚本（建议，待主理人批准）

> ⚠️ 本节内容**仅为方案**，`package.json` 尚未修改。需要新增的脚本如下（原因与格式见注释）：

```jsonc
{
  "name": "XiaoXiaoLe",
  "uuid": "8f676b86-77dd-44df-9bde-afc3e50555ee",
  "creator": { "version": "3.8.8" },
  "scripts": {
    // 用 Cocos Creator CLI 构建 Web-Mobile；参数名/可执行名需在 Cocos 安装环境验证
    "build:web": "CocosCreator --project . --build \"platform=web-mobile;debug=false;md5Cache=false;renderMode=0;buildPath=build\"",
    // 先构建，再跑后处理内联为单文件试玩包
    "build:playable": "npm run build:web && node tools/build-playable.mjs"
  }
}
```

**需要你（主理人）确认/批准的点：**
1. **Cocos CLI 命令格式**：`CocosCreator` 可执行名与 `--build` 参数串（`key=value;...`）在 3.8.8 可能随安装路径/版本变化，**需在 Cocos 安装环境验证**（可执行文件名、`renderMode` 枚举、`buildPath` 键名）。验证通过后再正式写入。
2. **`tools/build-playable.mjs` 是否落地**：本文档 §6.2 给了完整参考代码，但文件尚未创建（落在 `tools/`，非 `docs/`）。如批准，我再创建并跑一次验证。
3. 是否同步把 §2 的**功能裁剪**与**竖屏/MD5/渲染模式**在编辑器里落实（这些通过 UI 操作，不触 `package.json`）。

---

## 8. 发布前 Go / No-Go 清单

- [ ] 编辑器内完成 §2 功能裁剪 + §2.6 验证（无运行时报错）
- [ ] Builder 选项：MD5 Cache 关 / Debug 关 / Source Maps 关 / 渲染 WebGL / 无远程资源
- [ ] 音频转压或删除 BGM（§4），包体 ≤ 3 MB
- [ ] `build-templates/web-mobile/index.html` 就位（竖屏 + loading + CTA）
- [ ] `build:playable` 产出 `dist/playable.html`，**断网**可玩
- [ ] 各目标平台单包限制核对通过（§3.1）
- [ ] CTA 桥接按投放平台接入（`window.install` / `parent.postMessage('download')` / store URL）

> 下一步建议：主理人批准后，我先落地 `tools/build-playable.mjs` 并实跑一次 `build:playable`，输出体积报告再定稿 `package.json` 脚本。
