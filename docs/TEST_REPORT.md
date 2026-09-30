# 首版测试报告

验证日期：2026-09-30（UTC）。目标 DSH `0.2.0-rc.2`，本地 Node.js `24.18.0`。公共 npm 正式包，锁文件固定版本。所有输入均为 `synthetic-*` 虚构测试会话和文本，无 API key、付费请求或用户 desktop profile。

## 本地结果

`npm run check`：lint、strict TypeScript、10 项核心单元测试、1 项客户端模块/渲染测试、7 项真实 Host 集成测试通过，共 18 项。`npm pack --dry-run` 验证了分发文件清单，不包含源测试数据、node_modules、profile 或凭据。`npm audit` 安装检查报告 0 vulnerabilities。

| 验证 | 测试层级 | 证据 |
|---|---|---|
| 默认 refuse / hold 不唤醒 | 真 Host + 单元 | 免费 adapter 调用计数为 0；hold 返回 queued |
| idle 一次唤醒 | 真 Host | 正式 AgentLoop 产生一条 adapter 请求；重复 ID 不产生第二条 |
| 忙时不打断当前工具 | 真 Host | 正式工具运行时执行 gated tool；steer 后 signal 未 abort、请求数仍为 1；工具完成后第二 step 包含消息，turn/start 总数为 1 |
| 正式 plugin source / 真 sender | 真 Host | adapter 请求中的 UserMessage 来源为 plugin/dsh-session-messenger，文本发送者与 exec.agent 一致；额外 sender 参数不能伪造身份 |
| 双独立 root 与正式注册 | 真 Host | ctx.agents.roots() 返回 2；通过 defineTool 工具执行管线发送，通过 strict Gateway 操作设置 |
| 同 ID 幂等、冲突 | 真 Host + 单元 | 重复发送未增加 adapter 请求；不同正文同 ID 返回 ID_CONFLICT |
| 关闭竞态 | 真 Host + 单元 | dispose 后 held release 失败；单元注入关闭发生在 durable dispatching 写入时，验证不会调用目标 |
| 跨 workspace 越权 | 真 Host + 单元 | 默认 CROSS_WORKSPACE_DENIED 且 0 请求；单独授权后才投递 |
| 非相关会话状态读取 | 真 Host | 无关 root 的 status 工具返回错误 |
| 伪造 root 对象 | 单元 | 身份相同但对象不同的 sender 被拒绝 |
| 防自动循环 / 显式 reply | 真 Host + 单元 | peer 触发后 fresh send 被拒绝；合法回复 2 跳后下一跳失败；同父消息第二次回复被拒绝 |
| TTL | 真 Host + 单元 | 1ms held 消息过期；view/release 返回 expired；adapter 调用仍为 0 |
| 持久化恢复 | 真 Host | 读取真实 JSON 域文件确认 held ID；卸载插件/domain 后重新注册，从磁盘恢复 queued；不自动唤醒，显式 accept+release 后发送 |
| 崩溃歧义不重发 | 单元 | 持久 dispatching 经 recover 成 uncertain；release 不投递 |
| 长度/队列/发送速率/唤醒预算 | 单元 | 各上限触发对应拒绝或 queued/WAKE_BUDGET |
| 严格设置 RPC | 真 Host | policy 中 permissions 等多余字段被 Gateway/schema 拒绝 |
| 浏览器格式和页面槽 | 客户端组件测试 | 执行实际 window.__ModuleLoader__.load 工厂；使用正式 DSH SlotRegistry 和测试父槽声明，注册 bundle.config、静态渲染页面，dispose 后撤销 |

## 真实性与边界

Host 集成直接运行官方 Cordis Context、AgentRegistry、ReactLoop AgentLoop、Session、Projection、Tools、LlmRuntime、SystemPrompt、Typert registry/Gateway、Storage/JSON/domain。只有模型 provider 是本项目自写的确定性免费 adapter；模型响应不是外部真实大模型推理。这验证宿主控制流和正式接口，不验证模型会遵守低信任消息提示。

核心单元测试使用小型内存 runtime，用于可控时钟和 durable 关闭竞态注入，不能替代真 Host 测试。客户端测试采用 Node VM 加实际 SlotRegistry/React 渲染，Host RPC 由真 Gateway 测试覆盖；测试父槽是 fixture，不是完整 desktop App。没有启动用户 App、重启 App、安装到当前 profile 或给真实会话发消息。

未验证：真实桌面窗口中的安装/启用/热更新/导航/导出下载/卸载完整端到端流程；进程强制崩溃时 Host session persistence 的 fsync 语义；真实付费 provider 与长期模型自主行为；多进程、多 profile、跨机通信（本版本不支持）。dispatching 歧义恢复通过单元状态注入验证，未声称实际杀进程故障测试已执行。已进入目标会话的记录受宿主独立持久化约束，不承诺跨崩溃 exactly-once。

## 可复现命令

```sh
npm ci --ignore-scripts
npm run check
npm pack --dry-run
```

GitHub Actions 的 CI 工作流对 Linux 与 Windows、Node 24 执行同一命令，具体运行结果和 commit SHA 以仓库 Actions 页面为准。本报告不把本地通过等同于远端 CI 通过。

## Review 回归

补充验证双方跨 workspace 许可（只允许接收方或只允许发送方均失败）；release 在会话关闭后保持 processed/uncertain 等所有非 queued 历史回执；模型目录只发现主动开放且允许当前发送方的目标，默认拒收、无白名单许可和双侧跨 workspace 未授权的 ID/状态/别名不泄漏。操作员 UI 仍可查看全部当前活动 root。3 项单元回归与 1 项真实 Host 回归纳入完整检查，真实 processed 会话关闭回归也已加入已有集成测试。
