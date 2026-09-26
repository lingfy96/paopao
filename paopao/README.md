# 泡泡选片 PAOPAO SELECT

> 今晚的好故事，藏在下一张卡里

移动端 H5 / PWA 电影盲盒：按住泡泡吹大 → 啵 → 剪影翻牌揭晓今晚的电影。Vite + React + TypeScript + HashRouter，纯前端即可完整演示；Flask 后端可选（AI 推荐语 + SQLite 片库 API）。

## 运行

要求 Node.js 20+。

```bash
npm install
npm run dev            # 开发：http://localhost:5173（手机同局域网可访问 Network 地址）
npm run build          # 生产构建 → dist/（base 为 /paopao/，对应 GitHub Pages）
npx vite preview --host 0.0.0.0 --port 4173   # 预览：http://localhost:4173/paopao/
```

GitHub Pages：仓库 Settings → Pages 的 Source 选 GitHub Actions；推送到 `master`/`main` 后 `.github/workflows/deploy.yml` 自动测试、构建并发布，地址为 `https://linghy96.github.io/paopao/`。

可选后端（Python 3.7+）：

```bash
pip install -r backend/requirements.txt
VITE_BASE=./ npm run build && python backend/app.py   # http://localhost:5000，同时提供前端与 /api
```

（PowerShell：`$env:VITE_BASE='./'; npm run build`）

Flask 托管时会在页面注入标记，前端才会调用 `/api/recommend`；纯静态部署不发任何 API 请求。

部署到其他静态托管的根路径或任意子路径时，用 `VITE_BASE=./` 构建即可。分享卡二维码默认编码当前访问地址，也可在构建时用 `VITE_PUBLIC_URL=https://你的域名/ npm run build` 固定。

## 检查

```bash
npm test                                   # 引擎 + 筛选 + 故事蛋 + 统计 单元测试
python -m unittest discover -s tests -p 'test_*.py'   # 后端
BASE=http://localhost:4173/ node tests/e2e/qa.mjs batch1   # 端到端验收（batch1|batch2|batch3|sizes|pwa|flask）
```

端到端脚本用 playwright-core 驱动本机 Edge（无需下载浏览器），真实触控/双指/横屏/断网/Reduced Motion 验证，截图输出到 `../screenshots/`（可用 `OUT=目录` 覆盖）。

## 目录

| 路径 | 职责 |
|---|---|
| `src/engine.js` | 原推荐引擎（未改动）：黑名单、约束解析、画像/情绪/MBTI 打分、稀有度 |
| `src/movies.json` | 100 部片库（仅新增 `year` 字段） |
| `src/main.tsx` | 应用外壳、路由、开盒流程（模式 → 画像/情绪 → 筛选 → 黑名单/去重 → 引擎 → 稀有度 → 揭晓） |
| `src/lib/storage.js` | 唯一持久层：localStorage（安全解析/校验）+ IndexedDB 图片（失败退回内存） |
| `src/lib/filters.js` | 片库筛选与空结果静默放宽（平台 → 类型 → 时长 → 评分） |
| `src/lib/egg.js` / `stats.js` | 故事蛋成长孵化、本周观影统计 |
| `src/lib/canvas.js` | 分享卡 / 电影卡（含二维码）、照片压缩 |
| `src/lib/fx.js` / `weather.js` | Web Audio 合成音效 + 静音、触觉反馈、情绪天气与主题 |
| `src/components/` | 泡泡（含情侣共吹、装饰泡泡）、揭晓/SSR、水族箱、纪念墙、片头、放映厅、卡片手势 |
| `public/sw.js`, `manifest.json` | PWA：外壳预缓存、页面网络优先、静态资源缓存优先 |
| `backend/` | Flask + SQLite，可选 AI 推荐语 |

## 规则说明

- 新一盒消耗一次额度（每日 5 次，设备本地日期）；一盒最多 3 张卡（再来一盒 2 次），锁定后「再来一盒」开启新的一盒。
- 稀有度只影响视觉，不改变推荐结果。筛选条件为空时按「平台 → 类型 → 时长 → 评分」静默放宽，黑名单永不放宽。
- 所有实验能力（震动、Web Share、IndexedDB、Web Audio、Service Worker）不可用时静默降级，主流程不受影响。
- 评分为演示片库参考值，平台仅提供搜索入口；心灵捕手海报仅用于演示。
