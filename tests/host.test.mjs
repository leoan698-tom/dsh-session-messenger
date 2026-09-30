import test from 'node:test';
import assert from 'node:assert/strict';
import {host,value} from './fixture.mjs';
import {defineTool} from '@deepseek-ai/dsh-tools';
import {createUserMessage} from '@deepseek-ai/dsh-llm';
import * as Plugin from '../dist/index.js';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
test('actual isolated Host registers plugin, strict settings RPC and two independent roots',async t=>{
  const h=await host();t.after(()=>h.close());const a=await h.create('synthetic-alpha'),b=await h.create('synthetic-beta');
  assert.equal(h.ctx.agents.roots().length,2);
  assert.equal((await h.rpc('view')).directory.length,2);
  await h.rpc('policy',{id:b.agent.id,input:{mode:'accept',senders:[a.agent.id],crossWorkspace:false,alias:'B'}});
  const result=value(await h.tool(a.agent,'session_message_send',{id:'host-one',target:b.agent.id,text:'Synthetic hello'}));
  assert.equal(result.status,'delivered');await b.agent.whenIdle();
  assert.equal(h.adapter.calls.length,1);
  const forwarded=h.adapter.calls[0].messages.find(m=>m.source?.plugin==='dsh-session-messenger');
  assert.equal(forwarded.source.kind,'plugin');assert.match(forwarded.content[0].text,/sender=synthetic-alpha/);
  const duplicate=value(await h.tool(a.agent,'session_message_send',{id:'host-one',target:b.agent.id,text:'Synthetic hello'}));assert.ok(['delivered','claimed'].includes(duplicate.status));assert.equal(h.adapter.calls.length,1);
  const fake=value(await h.tool(a.agent,'session_message_send',{target:b.agent.id,text:'Synthetic spoof',sender:'forged'}));assert.equal(fake.sender,a.agent.id);await b.agent.whenIdle();
  const ack=value(await h.tool(b.agent,'session_message_ack',{id:'host-one'}));assert.equal(ack.status,'processed');
});
test('busy root finishes its tool before consuming steer; no tool abort or extra turn',async t=>{
  const h=await host();t.after(()=>h.close());const a=await h.create('synthetic-busy-a'),b=await h.create('synthetic-busy-b');
  await h.rpc('policy',{id:b.agent.id,input:{mode:'accept',senders:[a.agent.id],crossWorkspace:false,alias:''}});
  const entered=Promise.withResolvers(),release=Promise.withResolvers();let toolSignal;
  h.ctx.tools.register(defineTool({name:'synthetic_wait',description:'Synthetic gated test tool',parameters:{},output:{schema:{type:'string'},render:(_a,v)=>[{type:'text',text:v}]},execute:async(_args,exec)=>{toolSignal=exec.signal;entered.resolve();await release.promise;return 'Synthetic tool finished';}}));
  h.adapter.script=async function*(options){
    if(h.adapter.calls.length===1){yield{type:'block-start',index:0,blockType:'tool-call'};yield{type:'tool-call-delta',index:0,id:'synthetic-call',name:'synthetic_wait',argumentsDelta:'{}'};yield{type:'block-end',index:0,block:{type:'tool-call',id:'synthetic-call',name:'synthetic_wait',arguments:'{}'}};yield{type:'finish',reason:'tool-calls'};}
    else {assert.ok(options.messages.some(m=>m.source?.plugin==='dsh-session-messenger'));yield{type:'finish',reason:'stop'};}
  };
  b.agent.followup(createUserMessage({source:{kind:'user'},content:[{type:'text',text:'Synthetic begin tool'}]}));
  await entered.promise;
  const sent=value(await h.tool(a.agent,'session_message_send',{id:'busy-message',target:b.agent.id,text:'Synthetic steering'}));assert.equal(sent.status,'delivered');
  assert.equal(toolSignal.aborted,false);assert.equal(h.adapter.calls.length,1);assert.equal(b.agent.inbox.nextStep.length,1);
  release.resolve();await b.agent.whenIdle();assert.equal(toolSignal.aborted,false);assert.equal(h.adapter.calls.length,2);
  assert.equal(b.agent.session.snapshotEvents().filter(e=>e.type==='turn/start').length,1);
});
test('real disk domain closes/reopens with held queue; TTL and explicit release do not auto wake',async t=>{
  const h=await host();t.after(()=>h.close());const a=await h.create('synthetic-recovery-a'),b=await h.create('synthetic-recovery-b');
  await h.rpc('policy',{id:b.agent.id,input:{mode:'hold',senders:[a.agent.id],crossWorkspace:false,alias:''}});
  value(await h.tool(a.agent,'session_message_send',{id:'recover-held',target:b.agent.id,text:'Synthetic saved queue'}));
  const disk=JSON.parse(await readFile(join(h.root,'dsh_session_messenger.json'),'utf8'));assert.ok(JSON.stringify(disk).includes('recover-held'));
  await h.plugin.dispose();await h.ctx.plugin(Plugin);assert.equal((await h.rpc('view')).state.messages['recover-held'].status,'queued');assert.equal(h.adapter.calls.length,0);
  await h.rpc('policy',{id:b.agent.id,input:{mode:'accept',senders:[a.agent.id],crossWorkspace:false,alias:''}});await h.rpc('release',{id:'recover-held'});await b.agent.whenIdle();assert.equal(h.adapter.calls.length,1);
});
test('real cross-workspace default denial, explicit grant, reply limits, unauthorized status',async t=>{
  const h=await host();t.after(()=>h.close());const a=await h.create('synthetic-cross-a'),b=await h.create('synthetic-cross-b',join(h.root,'other')),c=await h.create('synthetic-unrelated');
  await h.rpc('policy',{id:b.agent.id,input:{mode:'accept',senders:[a.agent.id],crossWorkspace:false,alias:''}});
  assert.equal(value(await h.tool(a.agent,'session_message_send',{id:'cross-denied',target:b.agent.id,text:'Synthetic'})).reason,'CROSS_WORKSPACE_DENIED');assert.equal(h.adapter.calls.length,0);
  await h.rpc('policy',{id:b.agent.id,input:{mode:'accept',senders:[a.agent.id],crossWorkspace:true,alias:''}});
  await h.rpc('policy',{id:a.agent.id,input:{mode:'accept',senders:[b.agent.id],crossWorkspace:true,alias:''}});
  value(await h.tool(a.agent,'session_message_send',{id:'cross-allowed',target:b.agent.id,text:'Synthetic'}));await b.agent.whenIdle();
  assert.equal((await h.tool(c.agent,'session_message_status',{id:'cross-allowed'})).isError,true);
  assert.equal((await h.tool(b.agent,'session_message_send',{target:a.agent.id,text:'Synthetic new loop'})).isError,true);
  value(await h.tool(b.agent,'session_message_reply',{id:'r1',replyTo:'cross-allowed',text:'Synthetic reply'}));await a.agent.whenIdle();
  value(await h.tool(a.agent,'session_message_reply',{id:'r2',replyTo:'r1',text:'Synthetic reply'}));await b.agent.whenIdle();
  assert.equal((await h.tool(b.agent,'session_message_reply',{replyTo:'r2',text:'Synthetic loop beyond bound'})).isError,true);
});
test('actual hold/refuse do not invoke model; cross workspace and closed target fail',async t=>{
  const h=await host();t.after(()=>h.close());const a=await h.create('synthetic-a'),b=await h.create('synthetic-b');
  assert.equal(value(await h.tool(a.agent,'session_message_send',{id:'refuse',target:b.agent.id,text:'Synthetic'})).status,'failed');
  await h.rpc('policy',{id:b.agent.id,input:{mode:'hold',senders:[a.agent.id],crossWorkspace:false,alias:''}});
  assert.equal(value(await h.tool(a.agent,'session_message_send',{id:'held',target:b.agent.id,text:'Synthetic'})).status,'queued');assert.equal(h.adapter.calls.length,0);
  await b.dispose();assert.equal((await h.rpc('release',{id:'held'})).status,'failed');assert.equal(h.adapter.calls.length,0);
});
test('real held TTL expiry and strict RPC rejects permission-shaped extra fields',async t=>{
  const h=await host();t.after(()=>h.close());const a=await h.create('synthetic-ttl-a'),b=await h.create('synthetic-ttl-b');
  await assert.rejects(h.rpc('policy',{id:b.agent.id,input:{mode:'accept',senders:[a.agent.id],crossWorkspace:false,alias:'',permissions:'full'}}));
  await h.rpc('policy',{id:b.agent.id,input:{mode:'hold',senders:[a.agent.id],crossWorkspace:false,alias:''}});
  value(await h.tool(a.agent,'session_message_send',{id:'real-ttl',target:b.agent.id,text:'Synthetic expiry',ttl:1}));
  await new Promise(resolve=>setTimeout(resolve,5));
  assert.equal((await h.rpc('view')).state.messages['real-ttl'].status,'expired');assert.equal(h.adapter.calls.length,0);
  assert.equal((await h.rpc('release',{id:'real-ttl'})).status,'expired');assert.equal(h.adapter.calls.length,0);
});
