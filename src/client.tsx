import React, { useEffect, useState } from 'react';
import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client';
import type {} from '@deepseek-ai/dsh-api-remotes/client';
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client';
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol';
import { remoteContribution } from './contract.js';
import type { Policy, State, Limits, Mode } from './core.js';

type View = { directory: { id: string; alias: string; status: string; mode: Mode; policy: Policy }[]; state: State; limits: Limits };
interface Api {
  view(): Promise<RemoteResult<View>>;
  policy(id: string, input: Omit<Policy,'workspace'>): Promise<RemoteResult<Policy>>;
  release(id: string): Promise<RemoteResult<unknown>>;
  backup(includeText: boolean): Promise<RemoteResult<State>>;
  clear(confirmation: string): Promise<RemoteResult<unknown>>;
}
declare module '@deepseek-ai/dsh-typert-protocol' { interface TypertRemoteNamespaceMap { sessionMessenger: Api } }
export const inject = ['slots', 'remote'];
export async function apply(ctx: Context) {
  await ctx.remote.$mount(remoteContribution);
  ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({ name: 'plugins.bundle.config', key: 'dsh-session-messenger', inject: () => ({ api: ctx.remote.sessionMessenger }) }, MessengerPage));
}

function MessengerPage({ api }: { api: Api }) {
  const [view, setView] = useState<View>();
  const [error, setError] = useState('');
  const [selected, setSelected] = useState('');
  const [mode, setMode] = useState<Mode>('refuse');
  const [senders, setSenders] = useState('');
  const [cross, setCross] = useState(false);
  const [alias, setAlias] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const run = async (work: () => Promise<void>) => { setBusy(true); setError(''); try { await work(); } catch (e) { setError(String(e)); } finally { setBusy(false); } };
  const refresh = async () => { const r = await api.view(); if (!r.ok) throw new Error(r.error.message); setView(r.value); };
  useEffect(() => { void run(refresh); }, [api]); // Refresh is explicit; no background model work.
  const choose = (id: string) => {
    setSelected(id);
    const p = view?.directory.find(r => r.id === id)?.policy;
    setMode(p?.mode ?? 'refuse'); setSenders(p?.senders.join('\n') ?? ''); setCross(p?.crossWorkspace ?? false); setAlias(p?.alias ?? '');
  };
  const backup = async (includeText: boolean) => {
    const r = await api.backup(includeText); if (!r.ok) throw new Error(r.error.message);
    const url = URL.createObjectURL(new Blob([JSON.stringify(r.value, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = includeText ? 'messenger-private-backup.json' : 'messenger-audit.json'; a.click(); URL.revokeObjectURL(url);
  };
  return <section style={{padding:24,maxWidth:1000}}>
    <h2>跨会话信使</h2><p>同一 Host/profile 内已激活的独立 root。默认拒收；保存接收策略后才会接受指定发送方的文本。消息不会自动回复。</p>
    <button disabled={busy} onClick={() => void run(refresh)}>刷新目录与消息状态</button>
    {error && <p role="alert">{error}</p>}
    <h3>活动会话目录</h3><table><thead><tr><th>会话 ID（实际地址）</th><th>别名</th><th>运行状态</th><th>接收策略</th></tr></thead><tbody>{view?.directory.map(r => <tr key={r.id}><td><button onClick={() => choose(r.id)}>{r.id}</button></td><td>{r.alias || '未命名'}</td><td>{r.status}</td><td>{r.mode}</td></tr>)}</tbody></table>
    <h3>接收设置</h3><p>当前会话：{selected || '点击上方会话 ID'}</p>
    <label>别名 <input value={alias} maxLength={80} onChange={e => setAlias(e.target.value)} /></label><br/>
    <label>策略 <select value={mode} onChange={e => setMode(e.target.value as Mode)}><option value="refuse">refuse：拒收</option><option value="hold">hold：仅入队，不唤醒</option><option value="accept">accept：允许投递和唤醒</option></select></label><br/>
    <label>允许的发送方 ID（每行一个，禁止通配符）<br/><textarea value={senders} onChange={e => setSenders(e.target.value)} rows={4}/></label><br/>
    <label><input type="checkbox" checked={cross} onChange={e => setCross(e.target.checked)}/>允许此会话跨 workspace 通信（双方都需明确勾选，可能将文本带入另一个权限环境）</label><br/>
    <button disabled={busy || !selected} onClick={() => void run(async () => { const r = await api.policy(selected, {mode,senders:senders.split('\n').map(s=>s.trim()).filter(Boolean),crossWorkspace:cross,alias}); if (!r.ok) throw new Error(r.error.message); await refresh(); })}>保存此会话接收设置</button>
    <p>切换会话可检查已有策略；只有点击保存才更改许可。</p>
    <h3>消息状态</h3><p>delivered 表示正式投递调用返回；claimed 仅表示 inbox 已领取；processed 是接收方显式声明。uncertain 不会自动重发。</p>
    <table><thead><tr><th>消息 ID</th><th>发送 → 接收</th><th>状态 / 原因</th><th>操作</th></tr></thead><tbody>{view && Object.values(view.state.messages).map(m=><tr key={m.id}><td>{m.id}</td><td>{m.sender} → {m.target}</td><td>{m.status} {m.reason}</td><td>{m.status==='queued' && <button disabled={busy} onClick={()=>void run(async()=>{const r=await api.release(m.id);if(!r.ok)throw new Error(r.error.message);await refresh();})}>重新检查并投递</button>}</td></tr>)}</tbody></table>
    <h3>导出与卸载清理</h3><button disabled={busy} onClick={()=>void run(()=>backup(false))}>导出无正文审计</button> <button disabled={busy} onClick={()=>void run(()=>backup(true))}>导出私人备份（含消息正文与 workspace）</button>
    <p>清除插件数据会重置所有许可和预算，并删除插件消息记录；已写入目标会话的消息仍属会话历史。</p>
    <label>输入 DELETE MESSENGER DATA <input value={confirm} onChange={e=>setConfirm(e.target.value)}/></label> <button disabled={busy || confirm!=='DELETE MESSENGER DATA'} onClick={()=>void run(async()=>{const r=await api.clear(confirm);if(!r.ok)throw new Error(r.error.message);setConfirm('');await refresh();})}>清除插件数据</button>
  </section>;
}
