import { Context } from '@deepseek-ai/cordis';
import * as agent from '@deepseek-ai/dsh-agent';
import Session from '@deepseek-ai/dsh-session';
import Projections from '@deepseek-ai/dsh-session-projection';
import Llm, { LlmAdapter } from '@deepseek-ai/dsh-llm';
import Tools from '@deepseek-ai/dsh-tools';
import Prompt from '@deepseek-ai/dsh-system-prompt';
import Loop from '@deepseek-ai/dsh-agent-loop';
import * as Storage from '@deepseek-ai/dsh-storage';
import * as Json from '@deepseek-ai/dsh-storage-json';
import * as Domain from '@deepseek-ai/dsh-storage-domain';
import Typert from '@deepseek-ai/dsh-typert-registry';
import Gateway from '@deepseek-ai/dsh-api-gateway';
import * as Plugin from '../dist/index.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, basename, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

/** Deterministic free adapter; actual Cordis/DSH registries, AgentLoop, tools, inbox and disk storage. */
export class FreeAdapter extends LlmAdapter {
  calls = [];
  script;
  async resolveModel(provider, model) { return { provider, id:model, name:model, contextWindow:100000 }; }
  async *stream(options) {
    this.calls.push(options);
    if (this.script) { yield* this.script(options); return; }
    yield { type:'block-start', index:0, blockType:'text' };
    yield { type:'text-delta', index:0, text:'Synthetic acknowledgement.' };
    yield { type:'block-end', index:0, block:{type:'text',text:'Synthetic acknowledgement.'} };
    yield { type:'finish', reason:'stop' };
  }
}
export async function host(root) {
  const ownsRoot = root === undefined;
  root ??= await mkdtemp(join(tmpdir(),'dshsm-'));
  const ctx=new Context();
  for (const p of [Typert,Projections,Session,Llm,Tools,Prompt,agent.default,Storage.default]) await ctx.plugin(p);
  await ctx.plugin(Json,{root});
  await ctx.plugin(Domain,{backend:'json'});
  await ctx.plugin(Gateway);
  const adapter=new FreeAdapter(); ctx.llm.registerAdapter(['synthetic-free'],adapter);
  await ctx.plugin(Loop);
  const plugin=await ctx.plugin(Plugin);
  return {ctx,adapter,plugin,root,
    create: (id,cwd=root) => ctx.agents.create({sessionId:id,agentOptions:{provider:'synthetic-free',model:'fixture'},meta:{cwd}}),
    rpc: (method,args={}) => ctx.typertGateway.invoke({namespace:'sessionMessenger',method,args}),
    tool: (agent,name,args) => ctx.tools.execute({callId:randomUUID(),name,arguments:args,agent,signal:new AbortController().signal}),
    close: async () => {
      await ctx.fiber.dispose();
      if (ownsRoot) {
        // Only the exact mkdtemp child this fixture created; never a supplied profile path.
        if (dirname(resolve(root)) !== resolve(tmpdir()) || !/^dshsm-[a-zA-Z0-9_-]+$/.test(basename(root))) throw new Error('UNSAFE_TEST_CLEANUP');
        await rm(root,{recursive:true,force:true});
      }
    }
  };
}
export function value(result) { if(result.isError) throw new Error(JSON.stringify(result)); return JSON.parse(result.content[0].text); }
