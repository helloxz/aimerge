# P0-2 安全修复记录（stdio MCP 未认证 RCE）

> 基线：本地 `transports v1.6.11` / `core v1.7.10` / `framework v1.5.10`
> 上游参照：`GHSA-86gf`，transports `v2.1.0`
> 最后更新：2026-11-09

## 结论

只修复 **P0-2（stdio MCP 未认证 RCE）**，以及内存/稳定性里的 **M1、M2、M5、M8、M9** 和 **M3 的心跳终止部分**，均已完成并验证。

其余上游高危漏洞经评估：在本部署下不具备可利用条件或不属于致命项，**不再修复、不再跟踪**。
M3 的 fasthttp 关闭竞态、M4 暂缓；M6 本地无该 bug；M7 当前不适用（见文末）。

## 背景

本仓库基于 Bifrost v1.6.11 二次开发。上游在 v1.6.11 之后公开的两条 RCE（GHSA-86gf stdio MCP RCE、GHSA-2qp8 插件 URL RCE）都以「管理认证关闭」为前置条件。

实际部署以 `bifrost-data/config.db` 为准（`-app-dir ./bifrost-data`）。2026-11-09 核对时：

- `governance_config.is_auth_enabled=true`，`GET /api/config` 未带凭据返回 `401`；
- 仓库根目录的 `config.json`（0 字节）不参与该实例的加载；
- 因此当前不存在可未认证利用的致命漏洞。

本次修复的价值是消除回归风险：一旦管理认证被关闭（重置数据目录、换 app-dir、Security 页误操作），stdio 注册不会立即变成可远程 RCE。

## 修复内容

对齐上游 v2.1.0 的做法：不新增配置开关，只看「这次请求是否真的认证过」。

| 文件 | 改动 |
|---|---|
| `core/schemas/bifrost.go` | 新增 `BifrostContextKeyAuthBypassed` |
| `transports/bifrost-http/handlers/middlewares.go` | 认证关闭/未配置分支额外设置该标记 |
| `transports/bifrost-http/handlers/mcp.go` | 新增 `rejectStdioMCPClientIfAuthBypassed`；`addMCPClient` 在生成 ID、连接上游之前拦截；`completeMCPClientOAuth` 对 pending 配置再校验一次 |
| `transports/bifrost-http/handlers/middlewares_test.go` | 旁路时必须打标记；认证开启时不得打标记 |
| `transports/bifrost-http/handlers/mcpauthgate_test.go` | stdio + 旁路 → 403；stdio 已认证放行；http/sse/inprocess 不受影响 |

**行为**

- 认证开启（现状）：完全无感，stdio 注册行为不变；
- 认证关闭：`POST /api/mcp/client` 注册 stdio 返回 `403`，命令不会被执行；
- 认证关闭 + config.json 预置的 stdio：照常启动，运维仍可用配置文件配置。

**刻意不做**：不加 `mcp.allow_stdio` 开关——auth 关闭时 `PUT /api/config` 本身不需要认证，攻击者可把开关打开再注册，等于自毁门禁。

## 验证

- `cd transports && go build ./...` 通过；`core` 构建通过。
- 新增 3 个测试全部通过：
  - `TestRejectStdioMCPClientIfAuthBypassed`
  - `TestAuthMiddleware_MarksAuthBypassed`
  - `TestAuthMiddleware_DoesNotMarkAuthBypassedWhenEnabled`
- 空实例（认证未配置，端口 18111）实测：
  - `connection_type: "stdio"` → `403`，0ms 返回，命令未执行（标记文件未生成）；
  - 同接口 `connection_type: "http"` → 未被门禁拦截（进入连接流程后 500），证明门禁只针对 stdio。
- handlers 全包只有 `TestPrepareSpeechRequestVoiceValidation` 失败；已用 `git stash` 在干净树复跑确认是改动前既有失败，与本次无关。

## 残余风险

本项只关闭「未认证 RCE」。管理认证关闭时，管理面仍可被未认证改写（`PUT /api/config` 改 `auth_config`、provider `base_url` 等），按当前决策不处理；保持管理认证开启即可。

## 内存与稳定性（M1–M9）

> 2026-11-09：先做低风险、高收益的 5 项（M1、M2、M5、M8、M9），已完成并验证；其余按结论保持现状。

| 编号 | 问题 | 影响 | 上游修复 | 状态 |
|---|---|---|---|---|
| M1 | MCP ToolMap 只增不减：`SetClientTools` 逐条 merge，上游删除的工具仍驻留 | 内存随工具变更持续上涨 | core 1.8.0（#6484） | ✅ 已修复 |
| M2 | 请求体 buffer 长期驻留：keep-alive 连接保留历史最大 body | 大 payload 后 Pod 内存阶梯上涨 | transports 2.3.1 | ✅ 已修复 |
| M3 | 流关闭竞态 / 废弃流不 drain / 只有心跳的流不结束 | 连接池耗尽、data race panic | core 1.8.5 / 2.1.0（#6143/#6784/#6799） | 🚧 心跳终止已修；关闭竞态待定 |
| M4 | 流退出不取消 ctx、无断连探测 | 上游白跑、请求 ctx 被长期 pin | 2.2.0 / 2.2.2（#7406） | ⏳ 未修复（需断连压测） |
| M5 | 首个 chunk 等待不响应 ctx 取消 | worker 被占满整个 `stream_idle_timeout` | 2.1.1（#6974） | ✅ 已修复 |
| M6 | 非流式请求被放弃后永久挂起 | worker 泄漏、调用方永挂 | core 1.9.1（#7313） | ⏭ 本地无此 bug（仅有一次池泄漏） |
| M7 | ClickHouse 每 100 行一次 mutation | 副本磁盘可能被写满 | framework 1.7.0（#7098） | ⏭ 不适用（当前是 SQLite） |
| M8 | `UsageTracker.Cleanup` 先 dump 再停 worker | 退出时 dump 被 cancel、丢用量 | 2.2.0（#7099） | ✅ 已修复 |
| M9 | handler 无全局 panic recover（仅 WebSocket 有） | 单个请求 panic 打挂整个进程 | 2.2.6（#7866） | ✅ 已修复 |

### 本轮修复明细

| 编号 | 改动 | 验证 |
|---|---|---|
| M1 | `core/mcp/clientmanager.go`：`SetClientTools` 改为整体替换 ToolMap | 新增 `setclienttools_test.go`：删除的工具被剔除 |
| M2 | 新增 `lib/bodybufferpool.go`；`ServerConfig` 增加 `body_buffer_pool_limit_bytes`；`server.go` 启动时应用；`config.schema.json` 增加字段 | `bodybufferpool_test.go` 8 个用例；空实例配置 1 MiB 后日志输出 `request body buffer pool limit: 1048576 bytes` |
| M5 | `core/providers/utils/stream.go`：首 chunk 等待加 `ctx.Done()` 分支，返回 499/504 并后台 drain | `stream_test.go` 新增取消、超时、nil 流三个用例 |
| M3（心跳部分） | `sse.go` 增加 post-finish 心跳终止（连续 2 个注释即结束）；`utils.go` 清理时放弃连接而不是 drain；`openai.go` 的 chat/text 读循环在 `finish_reason` 后武装，并把 idle timeout 之后的终止视为正常结束 | `sse_test.go` 3 个用例；`heartbeatstream_test.go` 在 0.04s 内结束（无修复会一直挂到测试超时） |
| M8 | `plugins/governance/tracker.go`：先停 worker 并等待，再做最后一次 dump | `go test ./plugins/governance` 通过 |
| M9 | 新增 `handlers/recover.go` 并在 `server.go` 最外层启用 | `recover_test.go`：panic → 500；已提交响应不被改写 |

## 部署

当前 8099 运行的是旧二进制，`make build LOCAL=1` 重建并重启后生效。实例认证已开启，重启后行为与现在一致。

## 执行日志

| 日期 | 编号 | 说明 |
|---|---|---|
| 2026-11-09 | P0-2 | 提交 `2be8723`，实现 auth-bypass 门禁并完成单测与空实例验证 |
| 2026-11-09 | — | 文档精简：移除 P1 与未修复的 P0 项；内存/稳定性清单保留为“暂不修复” |
| 2026-11-09 | M1/M2/M5/M8/M9 | 完成 5 项低风险修复：ToolMap 整体替换、请求体 buffer 上限、首 chunk 取消、tracker 关闭顺序、全局 panic recover |
| 2026-11-09 | M3（心跳） | 完成 post-finish 心跳终止：连续 2 个 SSE 注释即结束，清理时放弃连接，idle timeout 后视为正常结束 |
