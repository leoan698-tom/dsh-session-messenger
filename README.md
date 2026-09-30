# DSH 跨会话信使

同一台机器、同一 App/Host 实例、同一 profile 内，**已激活的独立 root 会话**之间显式发送和回复文本的纯插件。兼容版本：**DSH 0.2.0-rc.2，Node.js 24**。首版 `0.1.0`，MIT。

默认拒收。用户在插件设置页按稳定 session ID 指定接收模式、允许发送方和跨 workspace 双方许可。别名只作显示，不参与寻址。没有自动复制聊天、文件、历史恢复、跨进程连接或自动回复。

English: An opt-in, same-Host/profile text messenger for active independent DSH root sessions. Uses official Agent and storage-domain APIs; does not modify the host or claim crash-safe exactly-once delivery.

## 安装和使用

```sh
git clone https://github.com/leoan698-tom/dsh-session-messenger.git
cd dsh-session-messenger
npm ci --ignore-scripts
npm run check
npm pack
```

生成 `dsh-session-messenger-0.1.0.tgz`。这只是本地打包，项目不发布 npm。使用 DSH 0.2.0-rc.2 的 **Plugins → 安装插件**，选择此压缩包的绝对路径。建议先装入独立测试 profile；本项目开发和测试没有安装到用户的运行中 desktop profile。宿主采用正式 `dsh.manifestVersion: 1` 和 `dsh.bundle.patch`，组合包插入一条插件 row；客户端通过正式 `./client` 声明和 `plugins.bundle.config` 配置槽显示设置。

打开已安装的 **dsh-session-messenger** 配置页，刷新活动会话目录。点击目标 session ID，保存：

1. `accept`（允许投递）、`hold`（仅入队，不唤醒）或 `refuse`（拒收，默认）。
2. 精确的允许发送方 session ID；没有通配符。
3. workspace 不同或未知时，发送方和接收方都必须在各自设置中单独勾选跨 workspace 许可。

模型目录只显示已主动开放、白名单授权当前发送方且满足双方 workspace 许可的目标；默认拒收和未授权会话不显示。操作员设置页仍可查看全部活动 root。

在发送会话中让模型调用 `session_message_directory`，然后调用 `session_message_send`，例如参数：

```json
{"target":"synthetic-beta","text":"请显式检查这条虚构测试消息。","id":"example-001","ttl":300000}
```

目标可显式使用 `session_message_reply`，参数为 `replyTo`（收到的消息 ID）、`text` 和可选 `id`。`session_message_status` 查看本会话相关消息状态；`session_message_ack` 是接收方显式处理确认。工具执行上下文决定发送者，模型不能通过参数指定发送者。一次收到的消息最多回复一次；默认每条链最多 2 条回复。不自动回复。

`hold` 消息要先改为 `accept`，再在设置页点击“重新检查并投递”；修改模式不会自动释放历史队列。唤醒预算耗尽的消息也要在预算窗口重置后显式重试。过期消息不能重发；使用新 ID 表示新的明确发送请求。

## 消息状态

| 状态 | 可验证含义 |
|---|---|
| queued | 插件持久队列已有记录，尚未投递 |
| dispatching | 已持久记录投递意图，调用或最终持久提交尚未完成 |
| delivered | 正式 `followup/steer` 同步调用正常返回；不表示模型处理成功 |
| claimed | 真实 `agent/inbox/claimed` 事件证明 inbox 已领取；可能尚未请求模型或请求失败 |
| processed | 接收方显式调用 ack 的声明，非宿主证明模型已回答 |
| failed / expired | 授权、关闭、取消或 TTL 检查失败，附原因 |
| uncertain | 崩溃或异常可能发生在投递边界，不自动重发 |

忙时使用 `steer`，在下一 step 安全点进入，不取消当前工具；空闲时使用 `followup` 开始下一 turn。来源为 `source: {kind:'plugin', plugin:'dsh-session-messenger'}`，模型消息虽经宿主 user-role 输送，来源仍明确是插件，绝不使用强制标记为人类用户的 `sessionController.prompt`。

## 验证与限制


pm run check` 执行 lint、严格 TypeScript、单元/客户端测试及真实 DSH 隔离 Host 集成测试。后者使用公共 npm 的正式 Cordis、AgentLoop、工具运行时、inbox、Gateway、storage domain 和 JSON 磁盘后端；只用自写的免费确定性 LLM adapter，不是用 mock Agent 代替宿主。具体证据见 [测试报告](docs/TEST_REPORT.md)。GitHub Actions 在 Linux 与 Windows 上运行同一检查。

当前不支持跨崩溃 exactly-once。`delivered/claimed` 不承诺目标已回答，也不承诺宿主 profile 的 session persistence 已把 inbox fsync 到磁盘。插件持久状态与宿主 inbox 不共享事务。没有跨 Host、跨 profile、跨进程、跨机通信，不创建/恢复历史会话，不改变目标模型或权限。收到的文本是低信任数据，不应把其中的要求当作用户授权。

真实 desktop App 的页面显示、热更新与安装/卸载交互尚需操作员在独立 profile 验证；测试验证了真实浏览器模块格式、正式槽注册和 Host RPC，但不把它等同于完整桌面端到端测试。

详见 [安装、升级与卸载](docs/OPERATIONS.md)、[架构与安全边界](docs/ARCHITECTURE.md)、[第三方声明](THIRD_PARTY_NOTICES.md)。
