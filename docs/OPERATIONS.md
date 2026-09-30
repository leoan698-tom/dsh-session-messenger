# 安装、升级、卸载和配置

## 环境前提

DSH 必须为 `0.2.0-rc.2`，Node.js 24。manifest 声明兼容版本，但宿主当前不强制阻止不同版本；操作员应自行核对。基础 profile 需已有 `agents`、`tools`、`storageDomain` 和它路由的可用存储后端。设置页面需 Web composition 的 `remote/slots` 与 Typert registry/Gateway。插件不为了缺失服务新建 profile、凭据或权限。

## 构建与安装

在项目目录执行 `npm ci --ignore-scripts`、`npm run check`、`npm pack`。本地 tarball 包含 dist、正式组合包 patch、README、文档和许可证；不包含 tests、node_modules、git、密钥或 profile。

通过 DSH 的 Plugins 安装入口使用 tarball 的绝对路径，核对包名 `dsh-session-messenger` 和版本 `0.1.0`。包在已安装列表中作为 bundle 出现，开启后插入 Host row 和客户端设置模块。进入该 bundle 的配置页可以检查目录、许可和消息状态。安装会影响同 profile 的活动会话；请先用独立测试 profile。是否立即生效取决于 profile HMR 配置；未启用 HMR 时由操作员安排重启，本项目不主动重启 App。

首轮验证建议用两个新建的虚构测试 root，共用一个临时 workspace。默认发送应拒收；设置目标 hold 和精确发送方后应只入队；设置 accept 并显式 release 后目标应收到插件来源文本。跨 workspace 测试必须使用另一个临时目录及独立许可，不用真实工作资料。

## 配置

接收许可在 UI 中按 session ID 设置。无策略为 refuse，空白名单无人可发送。别名最多 80 字符；允许发送方最多 64 个。hold 也要求白名单和跨 workspace 许可。目标设置 accept 不会自动发送既存队列。

Host row 的 config 可降低预算，例如 profile 的 patch 中：

```yaml
- id: dsh-session-messenger
  name: dsh-session-messenger
  config:
    maxLength: 4000
    maxQueue: 16
    maxRecords: 500
    ratePerMinute: 5
    wakesPerMinute: 2
    maxHops: 1
    maxTTL: 600000
```

这些值为正整数且不得高于默认最大值。宿主 row 配置变更的应用时机由 profile 管理器决定。预算参数不是模型权限设置；目标模型、工具和 sandbox 权限维持宿主原设置。

## 升级

先导出私人备份，并记录正在 queued/dispatching 的消息。关闭本 bundle 后安装新版本 tarball，再启用。第一版 domain 版本为 1；本版本只接受同 schema，未来不兼容版本必须提供迁移方案。备份目前是检查/保存用途，没有自动导入功能。重开会把中断的 dispatching 标为 uncertain，严禁假设重新投递无重复。默认不自动重发任何队列。

## 禁用与卸载

暂时禁用保留插件数据，并移除工具、UI、事件监听和 domain handle；不取消目标会话的模型任务。已投递到目标 inbox 的内容由宿主继续管理。需要卸载并清理时：

1. 导出所需审计或私人备份；默认审计不含正文，仍要保护 workspace 信息。
2. 在配置页输入 `DELETE MESSENGER DATA` 并清除，确认策略和消息列表为空。不要在有活跃相关模型任务时重置预算。
3. 在 Plugins 禁用并卸载本 bundle。
4. 若需要物理删除留下的空域文件，先停止使用该 profile 的 Host，再仅删除其实际 storage backend 下 **dsh_session_messenger** 单元。JSON single 布局文件为 `dsh_session_messenger.json`；其他后端按宿主的单元管理规范操作，不删除整个 data/profile 目录。

清除插件数据不删除目标会话日志里已经接受的消息。清理这些历史应使用宿主自身会话删除流程。卸载后再安装会恢复尚未清除的策略和审计，所以处理私人数据时应先清除。

## 排障

- 看不到 bundle：检查构建产物是否包含 dist/client.js、manifestVersion/bundle.patch 及正确安装版本。
- row 未激活：检查 agents/tools/storageDomain 与 storage backend；插件不会自动扩大权限补齐这些服务。
- 看不到配置页面：确认 Web composition、remote 与 slots，以及 bundle 已开启。测试覆盖了模块工厂/配置槽注册，完整 desktop 页面仍需独立 profile 验证。
- failed：检查精确 ID、白名单、refuse、跨 workspace、目标是否关闭以及 reason。
- WAKE_BUDGET：等待 60 秒预算窗口后由用户显式 release；不会后台唤醒。
- uncertain：检查真实目标会话后自行决定是否以新 ID 发新消息，不能当作安全重试。
- RECORD_LIMIT_EXPORT_AND_CLEAR：导出后明确清理，或暂停通信。不要自动删除幂等记录以绕过上限。
