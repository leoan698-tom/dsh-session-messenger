import { z } from 'zod';
import { defineDomain } from '@deepseek-ai/dsh-storage-domain';
import { emptyState } from './core.js';

import { policyInput } from './validation.js';
export { policyInput } from './validation.js';
const policy = policyInput.extend({ workspace: z.string().nullable() });
const message = z.object({ id: z.string(), sender: z.string(), target: z.string(), text: z.string().max(8000), created: z.number().int(), expires: z.number().int(), status: z.enum(['queued','dispatching','delivered','claimed','processed','failed','expired','uncertain']), replyTo: z.string().optional(), hops: z.number().int().min(0), hostId: z.string(), reason: z.string().optional(), acknowledgedAt: z.number().int().optional() }).strict();
export const stateSchema = z.object({ policies: z.record(z.string(), policy), messages: z.record(z.string(), message), budgets: z.record(z.string(), z.object({ start: z.number(), sent: z.number().int().min(0), wakes: z.number().int().min(0) })) }).strict();
export const domainSpec = defineDomain({ name: 'dsh_session_messenger', version: 1, tables: {}, global: { schema: stateSchema, initial: emptyState() } });
