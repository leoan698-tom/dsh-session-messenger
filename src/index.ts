import type { Context } from '@deepseek-ai/cordis';
import '@deepseek-ai/dsh-agent';
import { defineTool } from '@deepseek-ai/dsh-tools';
import { Messenger, defaults, type Limits, type Root } from './core.js';
import { domainSpec } from './schemas.js';
import { MessengerSettings } from './settings.js';
import '@deepseek-ai/dsh-typert-registry';
import { hostContribution } from './contract.js';

export const name = 'dsh-session-messenger';
export const inject = ['agents', 'tools', 'storageDomain'];
declare module '@deepseek-ai/cordis' { interface Context { sessionMessenger: MessengerSettings } }

export async function apply(ctx: Context, config: Partial<Limits> = {}) {
  const domain = await ctx.storageDomain.open(domainSpec);
  const messenger = new Messenger({ roots: () => ctx.agents.roots(), get: id => ctx.agents.list().find(a => a.id === id) }, { read: () => domain.global.get(), write: state => domain.global.set(state) }, { ...defaults, ...config });
  await messenger.recover();
  ctx.effect(() => async () => { await messenger.close(); await domain.close(); });
  new MessengerSettings(ctx, messenger);
  ctx.inject(['typert'], c => { c.typert.register(hostContribution); });
  const caller = (agent: Root | undefined) => { if (!agent) throw new Error('CALLER_REQUIRED'); return agent; };
  const output = { schema: { type: 'json' as const }, render: (_args: unknown, value: unknown) => [{ type: 'text' as const, text: JSON.stringify(value) }] };
  ctx.tools.register(defineTool({ name: 'session_message_directory', description: 'List active independent root session IDs and opt-in aliases in this Host. No chat bodies or files.', parameters: {}, output, execute: async (_args, exec) => messenger.directory(caller(exec.agent)) }));
  ctx.tools.register(defineTool({ name: 'session_message_send', description: 'Send explicit text to an opt-in independent root by exact session ID. Returns transport state, never an answer. No automatic replies.', parameters: { target: { type: 'string', required: true }, text: { type: 'string', required: true }, id: { type: 'string' }, ttl: { type: 'integer' } }, output, execute: async (args, exec) => messenger.send(caller(exec.agent), args, exec.signal) }));
  ctx.tools.register(defineTool({ name: 'session_message_reply', description: 'Explicitly reply once to a received message ID. Reply chain is bounded. Sender and destination come from validated transport records.', parameters: { replyTo: { type: 'string', required: true }, text: { type: 'string', required: true }, id: { type: 'string' } }, output, execute: async (args, exec) => {
    const root = caller(exec.agent), parent = messenger.snapshot(true).messages[args.replyTo];
    if (!parent || parent.target !== root.id) throw new Error('INVALID_REPLY');
    return messenger.send(root, { ...args, target: parent.sender }, exec.signal);
  } }));
  ctx.tools.register(defineTool({ name: 'session_message_status', description: 'Read your sent or received message transport state. Claimed is inbox consumption; processed is explicit recipient acknowledgement.', parameters: { id: { type: 'string', required: true } }, output, execute: async (args, exec) => messenger.status(caller(exec.agent), args.id) }));
  ctx.tools.register(defineTool({ name: 'session_message_ack', description: 'Explicitly acknowledge a received message as processed. This is a recipient assertion, not proof of a model answer.', parameters: { id: { type: 'string', required: true } }, output, execute: async (args, exec) => messenger.acknowledge(caller(exec.agent), args.id) }));
  ctx.on('agent/inbox/claimed', ({ agent, message }) => messenger.claimed(agent, message.id));
  ctx.on('agent/inbox/discarded', ({ agent, message }) => messenger.discarded(agent, message.id));
  ctx.on('agent/pre-step', async (payload, next) => {
    // A genuine human input clears reply causality; peer-controlled text cannot.
    if (payload.messages.some(m => m.source.kind === 'user')) messenger.userInput(payload.agent);
    return next();
  });
  ctx.on('agent/disposed', ({ agent }) => messenger.disposed(agent));
}
