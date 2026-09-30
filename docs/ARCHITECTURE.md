# 架构与安全边界

## 正式接口

模型工具通过 `ctx.tools.register(defineTool(...))` 注册，真实主体只来自 `exec.agent`。每次发送验证该精确对象仍在当前 registry，且属于 `ctx.agents.roots()`。子 agent、伪造对象、冷历史会话不允许发送。发现仅读取活动 root 的 ID/status 和用户为插件填写的别名，不读取聊天正文、原始会话标题或文件。没有必要使用 sessionQuery 的历史读取接口。

发送调用目标 `Agent.steer` 或 `Agent.followup`，文本使用正式 `createUserMessage` 构造不可变消息，插件扩展来源记录 `kind: plugin` 和插件名。不访问 AgentLoop 内部结构，不使用 sessionController.prompt，不调用 cancel、resume、模型路由或权限设置接口。安装的任意 Host 插件本身属于可信代码，本项目不是抵御其他恶意 Host 插件的安全沙箱。

设置操作使用正式 `TypertRemoteService`、`@Remote` 与共享的显式 strict InvocationDescriptor 贡献，经 `ctx.typert` 和 Gateway 验证参数。浏览器 `$mount` 同一描述符后注册正式 `plugins.bundle.config` 槽。设置接口面向宿主已授权的操作员连接，没有新增监听端口或认证凭据；不新增模型可调用的许可修改工具。保护 Web 操作员入口是宿主 Connection 的责任。

## 持久化与竞态

`defineDomain({name:'dsh_session_messenger',version:1,...})` 与 `ctx.storageDomain.open` 使用 profile 已有后端。一个全局 singleton 保存策略、消息和预算，单次全量 durable set 保持这些状态一致。插件串行队列管理所有变更；domain 自身也顺序 durable 写入。每次状态都克隆后替换，不能原地改 domain 值。域 schema 在打开时严格验证。

投递顺序：校验调用者和目标 → 持久入队 → 再校验 TTL/策略/活动对象 → 持久 dispatching 和预算 → 再校验精确对象/取消/TTL → 同步正式投递 → 持久 delivered。最后一次校验和同步投递之间没有 await。关闭事件会使未发送队列失败；真实 inbox discarded 事件使未领取的投递失败。

Host inbox 与插件状态是两个日志，没有事务。进程崩溃、同步投递异常或最终状态持久化失败可能留下不确定状态。重新打开时 dispatching 转 uncertain，不自动投递；已有 delivered 不重新发送。队列恢复不创建或 resume 会话。hold 消息和恢复消息都要用户显式 release，并再次检查当前活动目标及权限。同 ID 的已完成记录返回原回执；不同正文、目标或父消息使用同 ID 时报 ID_CONFLICT。记录保留至用户清除，清除后幂等窗口结束。

策略绑定 stable session ID 和规范化绝对 cwd，cwd 改变会回到 refuse。Windows 路径按 win32 规范化并折叠大小写；其他路径按 posix 规范化。它是会话元数据的 workspace 边界，不宣称检测所有 symlink、mount 或文件访问权限等价关系。未知 cwd 视作需要跨 workspace 单独授权。

## 预算与自动循环防护

| 参数 | 默认/最大值 | 作用 |
|---|---:|---|
| maxLength | 8000 | JavaScript UTF-16 code units，文本最大长度 |
| maxQueue | 64 | 每目标待投递消息数 |
| maxRecords | 1000 | 全域审计/幂等记录上限；达到后导出并明确清理 |
| ratePerMinute | 10 | 每发送方 60 秒窗口的新消息数；失败也计入 |
| wakesPerMinute | 4 | 每目标 60 秒窗口投递预算；忙时也预留，避免 busy→idle 竞态绕过 |
| maxHops | 2 | 一条链最多 2 条回复（原消息 hops=0） |
| maxTTL | 3600000 | TTL 最大毫秒数，默认每消息 300000 |

配置只能降低上述上限，必须为正整数。发送方/目标预算随 domain 持久恢复。没有后台重试、自动回复或定时模型调用。UI 刷新与 release 会懒惰地标记已过期队列。真实 inbox claim 将该目标标为 peer 因果链，在真实人类来源 user 输入进入下一 step 前，任何新发送必须引用当前父消息。引用父消息必须是发给调用者、来自回复目标且未过期的真实记录；一次父消息只允许一次回复。即使模型恶意多调用工具，也受 hop/rate/wake/record 限制。人类明确新输入可开始新链；收到的文本不能伪造该来源。

## 数据与许可

插件只保存用户主动发送的文本、相关 ID、状态、时间、策略、cwd 和预算；不复制完整聊天或文件。默认审计导出省略正文，但策略中的 cwd 仍可能敏感；私人备份含正文。备份只能保存在用户选择的本地位置，不能自动提交仓库。已进入目标会话的消息还受宿主 session 日志保留策略约束。

MIT 只许可本项目自行编写的源码与文档。正式 DSH 和开发依赖来自公共 npm，锁文件记录版本；它们各自许可证仍有效。仓库不包含安装包提取物、用户会话、凭据、本机 profile 或其他项目代码。

模型目录与管理员目录分离：传入 exec.agent 的发现结果仅含 hold/accept、白名单授权当前调用者且满足双侧 workspace 许可的目标。默认 refuse 和未授权目标对模型隐藏。操作员设置页无该过滤。release 仅允许 queued 进入投递路径，其他历史状态直接返回原回执，不会因目标关闭而改写。
