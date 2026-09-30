import { z } from 'zod';
export const policyInput = z.object({ mode: z.enum(['accept', 'hold', 'refuse']), senders: z.array(z.string().min(1).max(128)).max(64), crossWorkspace: z.boolean(), alias: z.string().max(80) }).strict();
