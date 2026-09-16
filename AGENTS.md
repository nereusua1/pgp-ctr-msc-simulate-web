## Skill disclosure

- 每次最终回答末尾写“使用的 skills”，仅列出本轮实际读取并应用的 Skill；未使用时写“使用的 skills：无”。

## Agent skills

### Issue tracker

Issues and specs are tracked in this repository's GitHub Issues. See `docs/agents/issue-tracker.md`.

### Triage labels

The canonical triage roles use the default label vocabulary. See `docs/agents/triage-labels.md`.

### Domain docs

This repository uses a single-context domain-doc layout. See `docs/agents/domain.md`.

## Technology

- Vue 3、Vite 6、原生 JavaScript、Node.js test runner。

## README synchronization

- 每次更新本 web 项目（包括代码、配置、测试、构建、部署或文档）时，必须在同一批变更中同步更新根目录 `README.md`。
- 开始修改前阅读 `README.md`；交付前逐项核对本次变更涉及的页面功能、权限、交互、接口契约、启动配置、构建部署与验证说明，并更新对应章节。README 以当前实际实现为准，计划中的能力须明确标为未实现。
- 若变更不影响使用说明，在 README 的“维护记录”中简述本次变更及核对结果；不得仅修改日期充当同步。交付前检查文档中的路径、命令和配置名称，并在最终回答中说明 README 已同步。

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
