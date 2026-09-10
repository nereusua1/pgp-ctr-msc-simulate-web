# 报文模拟系统前端

本仓库承载报文模拟系统的 Vue 3 + Vite 前端模块。后端位于独立仓库 `pgp-ctr-msc-simulate-server`。

前端统一使用相对路径 `/api`。本地开发时，Vite 将请求代理到 `VITE_BACKEND_URL` 指定的后端 Origin，并通过 `VITE_BACKEND_CONTEXT_PATH` 补齐后端上下文路径；默认值分别为 `http://localhost:18180` 和 `/pgp-ctr-msc-simulate-server`。生产环境应由应用 Nginx 完成同等路径转换，以保持 Session 同源。

## 本地启动

```bash
npm ci
npm run dev
```

默认访问地址为 `http://127.0.0.1:5183`。如后端不在本机，可在启动前设置 `VITE_BACKEND_URL`。

## 验证与构建

```bash
npm test
npm run build
```

生产构建产物位于 `dist/`。

页面使用独立地址（如 `/tasks/:id`、`/messages/:id/edit`、`/executions/:id`）。生产服务器须将非静态资源、非 `/api` 的页面路径回退到 `index.html`，否则刷新详情页会返回 404。`/api` 继续代理到后端，不可回退为 HTML。

产品方案见 [产品设计优化](docs/product-design-optimization.md)，当前实现范围、验证结果和待办见 [实施状态](docs/product-design-implementation.md)。

## 目录

- `src/`：页面、公共 UI 与接口 Adapter。
- `test/`：前端行为与设计系统回归测试。
- `prototypes/`：UI 设计原型，不参与生产构建。

## 来源

本仓库由原整合项目 `pgp-ctr-msc-simulate-svr` 的 `frontend/` 拆分而来。原项目作为迁移基线保留，不由本仓库反向同步。
