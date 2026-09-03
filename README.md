# 报文模拟系统前端

本仓库承载报文模拟系统的 Vue 3 + Vite 前端模块。后端位于独立仓库 `pgp-ctr-msc-simulate-server`。

前端统一使用相对路径 `/api`。本地开发时，Vite 将请求代理到 `VITE_BACKEND_URL`，默认值为 `http://localhost:8180`；生产环境应由应用 Nginx 将 `/api` 代理到后端，以保持 Session 同源。

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

## 目录

- `src/`：页面、公共 UI 与接口 Adapter。
- `test/`：前端行为与设计系统回归测试。
- `prototypes/`：UI 设计原型，不参与生产构建。

## 来源

本仓库由原整合项目 `pgp-ctr-msc-simulate-svr` 的 `frontend/` 拆分而来。原项目作为迁移基线保留，不由本仓库反向同步。
