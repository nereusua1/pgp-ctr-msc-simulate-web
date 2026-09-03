## Skill disclosure

- 每次最终回答末尾写“使用的 skills”，仅列出本轮实际读取并应用的 Skill；未使用时写“使用的 skills：无”。

## Technology

- Vue 3、Vite 6、原生 JavaScript、Node.js test runner。

## Module seams

- `src/api.js` 是后端 HTTP Interface 的唯一 Adapter；页面通过该模块访问 `/api`。
- `src/components` 放跨页面复用的 UI 模块，页面编排留在 `src/views`。
- `prototypes` 只表达设计方向，不作为生产实现依赖。
- 前端不依赖后端源码、SQL、Nacos 或 RocketMQ 配置。

## Interface invariants

- 浏览器请求使用相对路径 `/api`，开发代理由 `VITE_BACKEND_URL` 配置；生产环境保持前端与后端 Session 同源。
- 用户可见文本与测试场景使用清晰中文说明。
- 公共 UI、异步防重复提交、错误解析和时间格式行为通过现有测试 Interface 复用。
- 修改页面交互或视觉规范时同步更新对应测试；交付前执行 `npm test` 与 `npm run build`。
