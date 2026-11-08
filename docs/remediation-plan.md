# Bifrost 高危问题修复排期

> 基线：本地 `transports v1.6.11` / `core v1.7.10` / `framework v1.5.10`
> 上游参照：`transports v2.5.0` / `core v1.15.1`（2026-11-06）
> 最后更新：2026-11-08

## 背景

本仓库基于 Bifrost **v1.6.11** 二次开发。v1.6.11 之后上游发布了 transports v2.0.0 → v2.5.0、core v1.7.12 → v1.15.1。
本文档只收录**高危漏洞**与**内存/资源泄漏**，且已逐条在本地代码中确认仍然存在；新功能、体验问题不在此列。

**当前暴露面（重要）**：`config.json` 为 0 字节（管理认证关闭），README 的启动命令是
`-host 0.0.0.0 -port 8080`。在完成 P0-1 ~ P0-3 之前，管理 API 对同网段完全开放。

## 状态图例

| 标记 | 含义 |
|---|---|
| ⏳ | 未开始 |
| 🚧 | 进行中 |
| ✅ | 已完成 |
| ⏭ | 不适用（本地无对应代码路径） |
| ❌ | 阻塞（需外部条件） |

## 总览

| 批次 | 主题 | 项数 | 预计 | 状态 |
|---|---|---|---|---|
| P0 | 暴露面收敛（认证 / stdio / 插件路径） | 4 | 0.5 天 | ⏳ |
| P1 | 安全 backport（SSRF / 路径注入 / 头泄漏 / 计费） | 7 | 2–3 天 | ⏳ |
| P2 | 内存与稳定性（ToolMap / buffer / 流生命周期） | 9 | 3–5 天 | ⏳ |

> 执行顺序 P0 → P1 → P2，但 P2-M1（ToolMap）成本极低，可随时插队。

---

## P0｜暴露面收敛（0.5 天）

### P0-1 管理面失败关闭 ⏳

- **问题**：管理认证关闭时，中间件把所有来源（包括公网/同网段）都标记为 local admin。
- **落点**：`transports/bifrost-http/handlers/middlewares.go:968`
- **改法**：
  - 只有 `ctx.RemoteIP().IsLoopback()` 才授予 `IsLocalAdminContextKey`。
  - 非 loopback 的 `POST/PUT/PATCH/DELETE /api/*` 无真实凭据时返回 `401`（或要求 `X-Bifrost-Setup-Token`）。
  - 只读 GET 与 `/health` 保持可达，避免监控中断。
- **验收**：
  - `curl -X POST http://<lan-ip>:8080/api/mcp/client` → `401`
  - `curl http://<lan-ip>:8080/health` → `200`
  - 本机（127.0.0.1）管理操作不受影响
- **风险**：通过局域网 IP 访问 Dashboard 的写操作会被拒；需要时改用 SSH 隧道或开启 dashboard auth。

### P0-2 stdio MCP 白名单 ⏳

- **问题**：`POST /api/mcp/client` 接受任意 `stdio_config.command/args`，进程直接拉起。
- **落点**：`transports/bifrost-http/handlers/mcp.go`（`addMCPClient` 约 717 行、`updateMCPClient` 约 819 行）+ `core/mcp` 入口
- **改法**：
  - 新增 `mcp.allow_stdio`（默认 `false`），未开启时 `connection_type: "stdio"` 直接 400。
  - 开启后仍要求真实 admin 凭据。
  - 四个入口（create / update / config.json 同步 / 批量）走同一校验，不能只堵 HTTP handler。
- **验收**：默认配置下 stdio 注册返回 400；`allow_stdio: true` + 本机 admin 可正常注册。

### P0-3 插件路径只允许本地文件 ⏳

- **问题**：`path` 为 `http(s)` URL 时自动下载并 `plugin.Open`，动态链接构建下等于 RCE。
- **落点**：`framework/plugins/soloader.go:17`、`transports/bifrost-http/handlers/plugins.go`
- **改法**：
  - 去掉 `strings.HasPrefix(dp.Path, "http")` 的隐式下载。
  - `path` 必须为绝对路径且文件存在。
  - 若确需远程 URL，加显式开关，并要求真实 admin。
- **验收**：`POST /api/plugins` 传 `http://...` 被拒；本地 `.so` 仍可加载（动态构建下）。

### P0-4 立即缓解（部署层） ⏳

- **动作**：二选一或同时做
  - 启动参数改 `-host 127.0.0.1`；
  - 建 admin 账号并开启 dashboard auth。
- **验收**：`ss -lntp | grep 8080` 只监听 loopback，或匿名写请求返回 401。
- **备注**：不改代码也能做，但只消除“未认证”前提，不替代 P0-1~P0-3。

---

## P1｜安全 backport（2–3 天）

### P1-1 Bedrock S3 bucket SSRF ⏳

- **问题**：`https://{bucket}.s3.{region}.amazonaws.com/{key}` 直接拼调用方传入的 bucket，`127.0.0.1:PORT#` 可把 SigV4 请求指向任意 host。
- **落点**：`core/providers/bedrock/bedrock.go:2548/2681/2791/2889/2970/3424`、`core/providers/bedrock/utils.go` 的 s3 URI 解析
- **改法**：新增 `isValidS3BucketName`（DNS 兼容：3–63 字符，小写字母/数字/`.`/`-`，禁 `:`、`#`、`/`、`..`、首尾非字母数字），所有出站 URL 拼接前校验。
- **验收**：`s3_bucket: "127.0.0.1:8080#"` → 400；合法 bucket 行为不变。
- **上游**：core 1.9.1 / transports 2.2.1（#7315）

### P1-2 资源 ID 路径注入 ⏳

- **问题**：batch/file/video/container/response ID、cached content name 直接插值进出站 URL，`../`、`?`、`#`、控制字符可改写目标。
- **落点**：新增 `EscapeResourceID`（建议 `core/utils` 或 `core/schemas`）；调用点在 files/batch/videos/containers/cachedContent 的 path 构造处（bedrock、openai、gemini、anthropic 等）
- **改法**：集中校验 + `url.PathEscape`，拒绝 `../`、query/fragment 分隔符与控制字符。
- **验收**：构造 `id="../../x?y#"` 的请求返回 400；正常 ID 不受影响。
- **上游**：core 1.9.1 / transports 2.2.1（#7307）
- **备注**：改动面最大，需补 provider-harness 用例（见文末）。

### P1-3 凭据类响应头回传 ⏳

- **问题**：响应头过滤只有 28 个固定名字，名单外的 credential 头会原样回给调用方。
- **落点**：`core/providers/utils/utils.go:895`（`ExtractProviderResponseHeaders`）、`:920`（`ExtractPassthroughProviderResponseHeaders`）、`:947`（`ExtractProviderResponseHeadersFromHTTP`）
- **改法**：过滤条件补 `schemas.IsSensitiveHeader(k)`，三个函数都要改。
- **验收**：上游返回 `x-custom-token: abc` 时，客户端响应中不出现该头。
- **上游**：core 1.9.0 / transports 2.2.0（#7120）

### P1-4 fallback 间响应头串号 ⏳

- **问题**：`clearCtxForFallback` 未清 `BifrostContextKeyProviderResponseHeaders`，fallback 预检失败时客户端可能收到上一个 provider 的头。
- **落点**：`core/utils.go:350`
- **改法**：增加 `ctx.ClearValue(schemas.BifrostContextKeyProviderResponseHeaders)`。
- **验收**：构造主 provider 失败 + fallback 在 key 选择阶段失败的场景，响应头不来自主 provider。
- **上游**：core 1.9.0 / transports 2.2.0（#6973）

### P1-5 Teredo SSRF 残留 ⏳

- **问题**：`core/network/ssrf.go` 已拦 CGNAT/6to4/NAT64/site-local，但未拦 Teredo `2001::/32`。
- **落点**：`core/network/ssrf.go`
- **改法**：识别 `2001:0000::/32`，取 bytes 12..15 按位取反还原内嵌 IPv4，再走一遍 `IsPublicIP`。
- **验收**：Teredo 形式的内网/IMDS 地址被拒。
- **上游**：core 1.8.5（#6757）

### P1-6 计费幂等键可伪造 ⏳

- **问题**：幂等键 = `(x-request-id, attempt)`，而 `x-request-id` 由调用方提供；伪造同一 ID 的第二个请求不扣费。
- **落点**：governance 计费幂等键生成处（搜 `idempotency` / `BillingIdempotency`）
- **改法**：键中混入内部随机 `BillingNonce`，不依赖调用方头。
- **验收**：相同 `x-request-id` 的两次请求都被计费。
- **上游**：core 1.9.1（#7303）

### P1-7 realtime client_secrets 直返 provider token ⏳

- **问题**：`/v1/realtime/client_secrets` 把 provider 的 ephemeral token 原样返回，客户端可绕过治理/计费直连上游。
- **落点**：`transports/bifrost-http/handlers/realtime_client_secrets.go`
- **改法**：响应中的 `value` 换为 Bifrost 自签 token；WS 升级时用现有 mapping 缓存换回 provider token。
- **验收**：返回的 token 无法直连 provider；经 Bifrost 的会话正常。
- **上游**：core 1.9.1

---

## P2｜内存与稳定性（3–5 天）

### P2-1 MCP ToolMap 只增不减 ⏳

- **问题**：`SetClientTools` 逐条 merge，上游删除的工具永久驻留内存。
- **落点**：`core/mcp/clientmanager.go:689`
- **改法**：`client.ToolMap = maps.Clone(tools)` 整体替换，再赋值 `ToolNameMapping`。
- **验收**：上游删除工具后，`curl /api/mcp/clients` 与模型可见工具列表同步减少。
- **上游**：core 1.8.0（#6484）

### P2-2 请求体 buffer 长期驻留 ⏳

- **问题**：keep-alive 连接保留历史最大 request body，大 payload 后内存阶梯上涨、不回落。
- **落点**：`transports/bifrost-http/server/server.go:2364`、`transports/bifrost-http/lib/config.go:144`
- **改法**：`fasthttp` 升到 `v1.74.0`；新增 `server.body_buffer_pool_limit_bytes`（默认 4 MiB），超限的 buffer 请求结束即释放。
- **验收**：连续发送 20 次 20 MB 请求后 RSS 回落，不随次数线性增长。
- **上游**：transports 2.3.1

### P2-3 流关闭竞态 / 废弃流不 drain / 心跳流不结束 ⏳

- **问题**：fasthttp 连接回收与 SSE 读取存在竞态；客户端断开后上游连接不回池；`finish_reason` 之后只有心跳的流永不终止。
- **落点**：`core/providers/utils/stream.go`、`streamterminaldetector.go`、`core/go.mod`
- **改法**：
  - `fasthttp` 升到 `v1.74.0`（含关闭竞态修复 #6143）；
  - 放弃的流后台 `io.Copy(io.Discard)` drain；
  - terminal detector 增加“finish_reason 后仅心跳即终止”的出口（#6784）。
- **验收**：中途断开 100 个流后连接数回到基线；持续发心跳的流在 idle timeout 内结束而非悬挂。

### P2-4 流退出不取消 ctx / 无断连探测 ⏳

- **问题**：请求上下文在部分流退出路径未取消；客户端断开时 Bifrost 仍在等上游。
- **落点**：`transports/bifrost-http/lib/ctx.go`、`transports/bifrost-http/lib/streamreader.go`
- **改法**：所有流退出路径 `defer cancel()`；加 MSG_PEEK 断连探测（500ms，FIN/RST 即 cancel）。
- **验收**：断开客户端后 1s 内上游请求被取消；`grep goroutine` 无累积。
- **上游**：transports 2.2.0 / 2.2.2（#7406）

### P2-5 首 chunk 等待不响应取消 ⏳

- **问题**：等待流首 chunk 的循环忽略 ctx，取消后仍占住 provider worker 直到 `stream_idle_timeout`。
- **落点**：`transports/bifrost-http/handlers/inference.go` 流式分支
- **改法**：改成 `select { case chunk := <-stream: ... case <-ctx.Done(): ... }`。
- **验收**：取消请求后 worker 立即归还（并发压测下吞吐不塌）。
- **上游**：transports 2.1.1（#6974）

### P2-6 非流式弃单永久挂起 ⏳

- **问题**：worker 对已 claim 的 delivery send 仍保留 `ctx.Done()` 分支，调用方取消后可能永久挂起。
- **落点**：`core/bifrost.go:5409-5478`
- **改法**：去掉已 claim 投递上的 ctx 分支，或改为非阻塞发送 + 兜底回收。
- **验收**：取消非流式请求后调用方立即返回，worker 不泄漏。
- **上游**：core 1.9.1（#7313）

### P2-7 ClickHouse 删除放大 ⏳

- **问题**：`DeleteLogsBatch` 先选 id 再 `id IN (...)`，每批一个 mutation，每 100 行重写整个分区，副本磁盘几分钟写满。
- **落点**：`framework/logstore/clickhousestore.go:490`
- **改法**：每轮改为单条 lightweight `DELETE FROM logs WHERE created_at < ?`，返回受影响行数；MCP/async 表同样处理。
- **验收**：保留期清理时 ClickHouse mutation 数不再随批次数增长，磁盘水位平稳。
- **上游**：framework 1.7.0（#7098）

### P2-8 UsageTracker 关闭竞态 ⏳

- **问题**：`Cleanup` 先 dump 再停 worker，`trackerCancel()` 可能取消进行中的 dump。
- **落点**：`plugins/governance/tracker.go:394`
- **改法**：先 `trackerCancel()` + `wg.Wait()`，再做最后一次 dump。
- **验收**：并发压测后优雅退出，日志无 `context canceled`，用量无丢失。
- **上游**：transports 2.2.0（#7099）

### P2-9 handler 无全局 panic recover ⏳

- **问题**：请求 handler panic 会打挂整个进程（只有 websocket 有 recover）。
- **落点**：`transports/bifrost-http/server/server.go:2365` 的 Handler 链
- **改法**：最外层加 recover 中间件，返回 500 + 服务端堆栈日志。
- **验收**：注入 panic 后进程存活、返回 500、日志含堆栈。
- **上游**：transports 2.2.6（#7866）

---

## 不适用 / 已修复

| 项 | 结论 |
|---|---|
| CVE-2026-55245 / GHSA-w98g（CGNAT、6to4、NAT64、fec0） | ⏭ 本地 `core/network/ssrf.go` 已完整修复 |
| v2.0.0 pooled `ChannelMessage` 清零 | ⏭ 本地 `core/bifrost.go:8180` 已有 |
| v2.0.0 trace 孤儿 span TTL 清理 | ⏭ 本地 `framework/tracing/store.go:467` 已有 |
| v2.3.1 A2A push relay goroutine 泄漏（1,200/h 直到 OOM） | ⏭ 本地无 Agent Gateway / A2A |
| v1.6.11 WebSocket 断连 panic | ⏭ 已在基线内 |
| v2.0.0 整体升级 | ⏭ 破坏性变更过多（PreAuthHook、Per-Request Grants、UI 结构），采用单点 backport |

---

## 执行日志

> 每完成一项：勾选对应任务的复选框、把状态改为 ✅、在此追加一行。
> 格式：`YYYY-MM-DD | 编号 | 一句话说明`

- 2026-11-08 | — | 建立本排期文档，完成本地代码核对

---

## 更新约定

1. 任务完成后把该条标题的状态标记改为 ✅，并将下方复选框勾选。
2. 每批完成后同步更新「总览」表中该批次的「状态」列。
3. 每完成一项在「执行日志」追加一行，写清楚改了哪些文件。
4. 若某项确认不适用，移到「不适用 / 已修复」并注明原因，不要直接删除。
5. 涉及线上可见行为（wire-visible）的改动，按 `AGENTS.md` 要求补 `tests/e2e/api/collections/provider-harness.json` 用例。

### 复选框

- [ ] P0-1 管理面失败关闭
- [ ] P0-2 stdio MCP 白名单
- [ ] P0-3 插件路径只允许本地文件
- [ ] P0-4 立即缓解（部署层）
- [ ] P1-1 Bedrock S3 bucket SSRF
- [ ] P1-2 资源 ID 路径注入
- [ ] P1-3 凭据类响应头回传
- [ ] P1-4 fallback 间响应头串号
- [ ] P1-5 Teredo SSRF 残留
- [ ] P1-6 计费幂等键可伪造
- [ ] P1-7 realtime client_secrets 直返 token
- [ ] P2-1 MCP ToolMap 只增不减
- [ ] P2-2 请求体 buffer 长期驻留
- [ ] P2-3 流关闭竞态 / 废弃流 / 心跳流
- [ ] P2-4 流退出不取消 ctx / 断连探测
- [ ] P2-5 首 chunk 等待不响应取消
- [ ] P2-6 非流式弃单永久挂起
- [ ] P2-7 ClickHouse 删除放大
- [ ] P2-8 UsageTracker 关闭竞态
- [ ] P2-9 handler 全局 panic recover
