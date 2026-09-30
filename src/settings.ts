import type { Context } from '@deepseek-ai/cordis';
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import type { Messenger } from './core.js';
import { policyInput } from './schemas.js';

/** Only authenticated Host operator UI; no corresponding model tool. */
export class MessengerSettings extends TypertRemoteService {
  constructor(ctx: Context, readonly messenger: Messenger) { super(ctx, 'sessionMessenger'); }
  @Remote async view() { await this.messenger.sweep(); return { directory: this.messenger.directory().map(r => ({ ...r, policy: this.messenger.inspectPolicy(r.id) })), state: this.messenger.snapshot(false), limits: this.messenger.limits }; }
  @Remote policy(id: string, input: unknown) { return this.messenger.setPolicy(id, policyInput.parse(input)); }
  @Remote release(id: string) { return this.messenger.release(id); }
  @Remote backup(includeText: boolean) { if (typeof includeText !== 'boolean') throw new Error('INVALID_REQUEST'); return this.messenger.snapshot(includeText); }
  @Remote clear(confirmation: string) { if (confirmation !== 'DELETE MESSENGER DATA') throw new Error('CONFIRMATION_REQUIRED'); return this.messenger.clear(); }
}
