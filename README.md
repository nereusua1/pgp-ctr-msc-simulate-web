# 报文模拟系统前端

本仓库承载报文模拟系统的 Vue 3 + Vite 前端模块。后端位于独立仓库 `pgp-ctr-msc-simulate-server`。

前端统一使用相对路径 `/api`。本地开发时，Vite 将请求代理到 `VITE_BACKEND_URL` 指定的后端 Origin，并通过 `VITE_BACKEND_CONTEXT_PATH` 补齐后端上下文路径；默认值分别为 `http://localhost:18180` 和 `/pgp-ctr-msc-simulate-server`。生产环境应由应用 Nginx 完成同等路径转换，以保持 Session 同源。

## 本地启动

需要可运行 Vite 6 的 Node.js 环境和 npm。以下命令在本 web 项目根目录执行：

```bash
npm ci
npm run dev
```

默认访问地址为 `http://127.0.0.1:5183`，开发服务监听所有网卡；端口被占用时启动失败，不会自动切换端口。

| 环境变量 | 默认值 | 用途 |
| --- | --- | --- |
| `VITE_BACKEND_URL` | `http://localhost:18180` | 后端 Origin，不包含 `/api` 或上下文路径 |
| `VITE_BACKEND_CONTEXT_PATH` | `/pgp-ctr-msc-simulate-server` | 代理时添加的后端上下文路径 |
| `VITE_DEV_PORT` | `5183` | 本地开发端口 |

这些变量由 [`vite.config.js`](vite.config.js) 从启动进程环境读取。按后端实际端口设置，例如后端监听 `8180` 时：

```bash
VITE_BACKEND_URL=http://localhost:8180 npm run dev
```

代理会把 `/api/...` 转为后端上下文路径下的 `/api/...`，并将 Session Cookie Path 重写为 `/`。

## 页面与权限

- 运行总览：展示执行统计、趋势及失败信息，支持切换统计窗口和跳转执行记录。
- 任务管理：查看任务、调度规则和投递目标，预览业务时间后执行；管理员可管理配置，操作员使用指定时间补跑。
- 报文管理：支持 JSON / FILE 报文、草稿、复制、数据关联、时间及系统字段绑定、多目标配置和预生成。配置编辑采用分步页面，检查和绑定编辑使用抽屉。
- 数据项管理：只读查看数据项及要素定义。
- 消息组件管理：查看 MQ 实例及 Group / Topic 配置；管理员可修改配置和检查连接。
- 执行日志：分页查询执行结果，查看逐目标投递状态和最终报文。

登录后从后端会话响应读取 `username`、`role` 和 `permissions`。`ADMIN` 可管理配置并执行当前时间或指定时间任务；`OPERATOR` 可查看业务信息、预生成报文，并按 `MANUAL_SPECIFIED` 指定时间执行和预览，不开放配置增删改、任务启停、当前时间执行及连接检查入口。实际授权由后端强制执行。

请求收到 `401` 时清除登录态并要求重新登录；`403` 展示操作错误。HTTP 请求统一通过 [`src/api.js`](src/api.js) 发出，使用同源 Session Cookie，前端不保存账号密码配置或对象存储凭据。

## 报文预生成与文件规则

报文可选择实况 / 预报业务类型，以及 `TRIGGER_TIME`（直接使用计划触发时间）或 `DATA_POLICY`（按数据项策略对齐）时间生成方式。

预生成在浏览器中检查字段替换和文件名，不发送 MQ、不保存结果、不读取实时数据，也不改写源文件；最终业务时间、生成文件及投递结果应以真实执行结果为准。

FILE 编辑器支持 `OSS`、`OBS`、`HTTP` 存储类型，填写源对象路径或 HTTP 完整 URL，源地址留空时读取外层报文 `filePath`。使用本地 Nginx 文件服务时显式选择 `HTTP`；存储连接参数由后端管理。

文件规则采用 V2 结构，可选样例预设后调整文件名时间绑定和内容时间绑定。当前支持：

- `PASSTHROUGH`：内容原样复制，只配置文件名时间规则。
- `DELIMITED`：表格 / 分隔文本，支持编码、分隔符及时间字段配置。
- `KEY_VALUE`：键值文本。
- `POSITIONAL_TEXT`：按行前缀、行后缀或无表头列定位时间文本。

`FIXED_WIDTH` 在界面中禁用，尚未开放。结构识别调用后端扫描接口，原样复制与无表头定位模式不调用该扫描入口。文件名不追加 SIM 或 Execution ID，同名目标允许覆盖；编辑器会显示这一行为。

## 执行与防重复提交

任务执行前先获取时间预览，再确认发送。按钮通过公共动作守卫阻止并发重复提交；执行请求携带 `requestId`。

当前页面会话中，同一任务、模式和指定时间的未确认请求重试复用该标识；网络异常、`409` 或服务端错误时，前端先按 `requestId` 查询执行状态以恢复结果。该标识暂存在内存，刷新页面不会保留。后端的请求防重决定是否实际再次发送，页面按钮状态不能替代它。

## 验证与构建

```bash
npm test
npm run build
```

生产构建产物位于 `dist/`。

生产静态部署需要单独配置 `/api` 代理，Vite 配置不会打包进 `dist/`。`npm run preview` 用于本地预览构建产物，不作为生产部署命令。

页面使用独立地址（如 `/tasks/:id`、`/messages/:id/edit`、`/executions/:id`）。生产服务器须将非静态资源、非 `/api` 的页面路径回退到 `index.html`，否则刷新详情页会返回 404。`/api` 继续代理到后端，不可回退为 HTML。

产品方案见 [产品设计优化](docs/product-design-optimization.md)，当前实现范围、验证结果和待办见 [实施状态](docs/product-design-implementation.md)。

## 操作手册

[报文模拟系统操作手册 Word 截图版](docs/报文模拟系统操作手册_截图版_20260912.docx) 覆盖管理员与使用者的完整操作流程，包括组件与报文配置、FILE 规则、任务调度、历史补跑、执行结果核对、异常处理和交接检查。截图由当前页面配合隔离演示数据生成，不代表真实环境投递或连接验证；实际账号、地址及业务结果以部署环境为准。

## 目录

- `src/`：页面、公共 UI 与接口 Adapter。
- `src/page-route.mjs`：页面地址解析与生成。
- `src/authentication.mjs`、`src/action-guard.mjs`：会话权限与异步动作防重。
- `src/file-rule-presets.mjs`、`src/file-storage.mjs`：文件规则预设与配置规范化。
- `src/message-pre-generation.mjs`：浏览器端预生成。
- `test/`：前端行为与设计系统回归测试。
- `prototypes/`：UI 设计原型，不参与生产构建。

## 维护记录

- 2026-09-12：新增详细 Word 截图操作手册及阅读入口，说明管理员和使用者的不同操作路径、演示截图范围与执行核对流程。
- 2026-09-11：按当前工作区实现补齐角色权限、页面功能、FILE V2 编辑、预生成边界、执行防重和开发代理说明；在 `AGENTS.md` 中加入每次更新同步 README 的交付要求。本次仅修改文档。

## 来源

本仓库由原整合项目 `pgp-ctr-msc-simulate-svr` 的 `frontend/` 拆分而来。原项目作为迁移基线保留，不由本仓库反向同步。
