import { z } from 'zod';
import type { InvocationDescriptor } from '@deepseek-ai/dsh-typert-protocol';
import { policyInput } from './validation.js';

// Explicit strict protocol contribution, shared by Host and browser. No source-mode fallback.
const codec = (name: string, schema: z.ZodType) => ({ mode: 'strict' as const, typeSymbol: `dsh-session-messenger#${name}`, create: () => schema });
const parameter = (name: string, schema: z.ZodType) => ({ name, wire: name, source: 'json' as const, codec: codec(name, schema) });
const endpoints = [
  { method: 'view', parameters: [] },
  { method: 'policy', parameters: [parameter('id', z.string().min(1).max(128)), parameter('input', policyInput)] },
  { method: 'release', parameters: [parameter('id', z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/))] },
  { method: 'backup', parameters: [parameter('includeText', z.boolean())] },
  { method: 'clear', parameters: [parameter('confirmation', z.literal('DELETE MESSENGER DATA'))] },
];
export const descriptors: InvocationDescriptor[] = endpoints.map(e => ({ ...e, id: `dsh-session-messenger#sessionMessenger/${e.method}`, service: 'sessionMessenger', namespace: 'sessionMessenger', invocation: { kind: 'direct' }, result: codec('result', z.json()) }));
export const remoteContribution = { package: 'dsh-session-messenger', descriptors };
export const hostContribution = { package: 'dsh-session-messenger', face: 'host' as const, schemas: [], model: { services: [], events: [], objects: [] }, invocations: descriptors };
