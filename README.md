# aimerge

基于 [Bifrost](https://github.com/maximhq/bifrost) **v1.6.11** 二次开发的个人自用版本。

Bifrost 本身是一个高性能 AI 网关:把 20+ 家模型提供商统一到一个 OpenAI 兼容 API 后面,同时提供 MCP 网关、虚拟密钥、预算限流、请求日志等功能。

本仓库在原版基础上做了**简体中文汉化**和**功能裁剪**,去掉了企业版锁定和自用不到的部分。

## 与原版的差异

### 界面

- 全量简体中文界面(`lang="zh-CN"`、CJK 字体回退、日期格式中文化)
- 移除官方版本更新检测(不再请求 `getbifrost.ai/latest-release`)
- 底部链接指向本仓库,移除 Discord 和 BUG 反馈入口

### 已移除

企业版独占、或自用场景用不到的模块:

| 模块 | 说明 |
|---|---|
| 告警 | 渠道 / 规则 / 历史,企业版功能 |
| 集群配置 | 多节点模式,企业版功能 |
| 护栏 | Guardrails,企业版功能 |
| 评测 | 仅一个指向 Maxim 官网的外链 |
| 自适应路由 | 即企业版的负载均衡 |
| 遥测 | Prometheus 指标插件(默认开启,已整体移除) |
| 可观测性连接器 | OpenTelemetry、Maxim、Datadog、BigQuery、Kafka、Pub/Sub、New Relic |
| 企业版占位页 | 审计日志、SCIM 用户开通、角色与权限、用户、业务单元、工具组、熔断、API 密钥、MCP 认证配置 |

工程层面还删掉了:官方文档站 `docs/`、`.github/`(CI、dependabot、issue/PR 模板)。

> 说明:这些页面在原版 OSS 里本来就只是"预约演示"占位,后端没有对应实现;移除后不影响任何实际功能。

### 工程调整

- **前端包管理改用 pnpm**(npm → pnpm,`nodeLinker: hoisted`)
- **`bytedance/sonic` 升级到 v1.15.5**:原版 v1.15.1 在 Go 1.27 下会退回标准库 JSON,性能下降 3~4 倍
- 后端构建走本地 Go workspace(`make build LOCAL=1`),否则会拉取上游已发布模块

## 保留的能力

- OpenAI 兼容 API,以及 OpenAI / Anthropic / Bedrock / Google GenAI / LangChain / LiteLLM SDK 兼容层
- 多提供商接入、密钥负载均衡、失败自动 fallback
- MCP 网关:MCP 客户端管理、工具调用、认证会话、OAuth 授权
- 治理:虚拟密钥、团队、客户、预算与限额
- 可观测性:仪表盘、LLM 日志、MCP 日志、日志存储(SQLite / Postgres / MySQL / ClickHouse)
- 插件系统(内置 prompts / logging / governance / compat / model-catalog-resolver)
- 路由规则、复杂度路由、模型目录、模型限制、价格覆盖
- 提示词仓库、技能仓库、Webhook

## 快速开始

### 环境要求

- Go **1.26.x**
- Node.js **>= 22.12**
- pnpm **11.x**

### 构建

```bash
make setup-workspace   # 生成 go.work,把本地模块纳入构建
make build LOCAL=1     # 构建前端 + 后端,产物在 tmp/bifrost-http
```

> 版本号由构建时的 `v*` tag 自动注入(例如 tag `v1.7.0` → 页面左下角显示 `v1.7.0`);当前 checkout 没有版本 tag 时显示 `dev-build`。

### 运行

```bash
./tmp/bifrost-http -app-dir ./bifrost-data -host 0.0.0.0 -port 8090
```

浏览器打开 `http://<host>:8090` 即可。配置和日志默认存本地 SQLite(`bifrost-data/config.db`、`logs.db`)。

### 开发

```bash
make dev    # 前端 vite 热更新(3000)+ 后端自动重启(8090)
```

改了 `core/`、`framework/`、`plugins/` 的 Go 代码时,构建务必带 `LOCAL=1`,否则 `GOWORK=off` 会用上游发布版,你的改动不生效。

## 说明

- **出站请求**:服务端只会 GET 拉取模型价格、模型参数和 MCP 库目录(默认 `getbifrost.ai`,可通过 `pricing_url` / `model_parameters_url` / `mcp_library_url` 改为自建地址或 `file://` 本地文件)。没有任何匿名上报或数据回传。
- **鉴权**:默认关闭,可在「配置 → 安全」里开启管理员账号。开启后所有 `/api/*` 需要登录。
- **许可证**:沿用上游 Apache 2.0,见 [LICENSE](LICENSE)。
- 上游文档:[docs.getbifrost.ai](https://docs.getbifrost.ai)(内容对应原版,企业版功能本仓库已移除)。
