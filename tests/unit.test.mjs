import test from 'node:test';
import assert from 'node:assert/strict';
import { Messenger,emptyState,defaults,workspace } from '../dist/core.js';
function fixture(limits={}) {
  let state=emptyState(),now=10000;
  const received=[];
  const a={id:'alpha',status:'idle',session:{header:{cwd:'/synthetic/shared'}},followup:m=>received.push(m),steer:m=>received.push(m)};
  const b={...a,id:'beta'};
  const roots=[a,b];
  const store={read:()=>state,write:async s=>{state=structuredClone(s);}};
  const m=new Messenger({roots:()=>roots,get:id=>roots.find(r=>r.id===id)},store,{...defaults,...limits},()=>now);
  return {m,a,b,roots,received,store,advance:n=>now+=n,policy:mode=>m.setPolicy('beta',{mode,senders:['alpha'],crossWorkspace:false,alias:'Synthetic B'})};
}
test('default refuse; hold no wake; accept release; duplicate ID once',async()=>{
  const f=fixture();assert.equal((await f.m.send(f.a,{id:'refused',target:'beta',text:'synthetic'})).status,'failed');assert.equal(f.received.length,0);
  await f.policy('hold');assert.equal((await f.m.send(f.a,{id:'one',target:'beta',text:'synthetic'})).status,'queued');assert.equal(f.received.length,0);
  await f.policy('accept');assert.equal((await f.m.release('one')).status,'delivered');assert.equal(f.received.length,1);
  await f.m.send(f.a,{id:'one',target:'beta',text:'synthetic'});assert.equal(f.received.length,1);
  await assert.rejects(f.m.send(f.a,{id:'one',target:'beta',text:'changed'}),/ID_CONFLICT/);
});
test('sender identity, closed target and cross-workspace authorization',async()=>{
  const f=fixture();await f.policy('accept');await assert.rejects(f.m.send({...f.a},{target:'beta',text:'synthetic'}),/CALLER_NOT_ACTIVE_ROOT/);
  f.b.session={header:{cwd:'/synthetic/other'}};await f.policy('accept');assert.equal((await f.m.send(f.a,{id:'cross',target:'beta',text:'synthetic'})).reason,'CROSS_WORKSPACE_DENIED');
  f.roots.pop();await assert.rejects(f.m.send(f.a,{target:'beta',text:'synthetic'}),/TARGET_CLOSED/);
});
test('TTL, queue, rate and length budgets',async()=>{
  const f=fixture({maxQueue:1,ratePerMinute:2,maxLength:10});await f.policy('hold');await f.m.send(f.a,{id:'ttl',target:'beta',text:'synthetic',ttl:1});
  await assert.rejects(f.m.send(f.a,{target:'beta',text:'synthetic'}),/QUEUE_LIMIT/);f.advance(2);await f.policy('accept');assert.equal((await f.m.release('ttl')).status,'expired');
  await assert.rejects(f.m.send(f.a,{target:'beta',text:'way too much synthetic text'}),/INVALID_MESSAGE/);
  await f.m.send(f.a,{id:'second',target:'beta',text:'synthetic'});await assert.rejects(f.m.send(f.a,{target:'beta',text:'synthetic'}),/RATE_LIMIT/);
});
test('reply causality, one reply and hop bound',async()=>{
  const f=fixture({maxHops:1});await f.policy('accept');await f.m.setPolicy('alpha',{mode:'accept',senders:['beta'],crossWorkspace:false,alias:''});
  await f.m.send(f.a,{id:'start',target:'beta',text:'synthetic'});await f.m.claimed(f.b,f.received[0].id);
  await assert.rejects(f.m.send(f.b,{target:'alpha',text:'synthetic'}),/REPLY_REQUIRED/);
  await f.m.send(f.b,{id:'reply',target:'alpha',text:'synthetic',replyTo:'start'});
  await assert.rejects(f.m.send(f.b,{target:'alpha',text:'synthetic',replyTo:'start'}),/ALREADY_REPLIED/);
  await assert.rejects(f.m.send(f.a,{target:'beta',text:'synthetic',replyTo:'reply'}),/HOP_LIMIT/);
});
test('durable dispatch ambiguity is quarantined, never retried',async()=>{
  const f=fixture();await f.policy('hold');await f.m.send(f.a,{id:'restart',target:'beta',text:'synthetic'});
  const s=structuredClone(f.store.read());s.messages.restart.status='dispatching';await f.store.write(s);await f.m.recover();assert.equal((await f.m.release('restart')).status,'uncertain');assert.equal(f.received.length,0);
});
test('workspace normalization and no unknown-workspace implicit allowance',()=>{
  assert.equal(workspace('C:\\SYNTHETIC\\workspace'),workspace('c:/synthetic/workspace'));assert.equal(workspace(),null);
});
test('wake budget holds new work; closed-during-durability cannot dispatch; prototype IDs denied',async()=>{
  const f=fixture({wakesPerMinute:1});await f.policy('accept');await f.m.send(f.a,{id:'wake1',target:'beta',text:'synthetic'});
  assert.equal((await f.m.send(f.a,{id:'wake2',target:'beta',text:'synthetic'})).reason,'WAKE_BUDGET');assert.equal(f.received.length,1);
  await assert.rejects(f.m.send(f.a,{id:'__proto__',target:'beta',text:'synthetic'}),/INVALID_MESSAGE/);
  const g=fixture();await g.policy('accept');const write=g.store.write;g.store.write=async s=>{await write(s);if(s.messages.race?.status==='dispatching')g.roots.pop();};
  assert.equal((await g.m.send(g.a,{id:'race',target:'beta',text:'synthetic'})).status,'failed');assert.equal(g.received.length,0);
});
test('cross-workspace requires both sender and receiver grants, default fail closed',async()=>{
  const f=fixture();f.b.session={header:{cwd:'/synthetic/other'}};
  await f.m.setPolicy('beta',{mode:'accept',senders:['alpha'],crossWorkspace:true,alias:''});
  assert.equal((await f.m.send(f.a,{id:'receiver-only',target:'beta',text:'synthetic'})).reason,'CROSS_WORKSPACE_DENIED');assert.equal(f.received.length,0);
  await f.m.setPolicy('alpha',{mode:'refuse',senders:[],crossWorkspace:true,alias:''});
  await f.m.setPolicy('beta',{mode:'accept',senders:['alpha'],crossWorkspace:false,alias:''});
  assert.equal((await f.m.send(f.a,{id:'sender-only',target:'beta',text:'synthetic'})).reason,'CROSS_WORKSPACE_DENIED');
  await f.m.setPolicy('beta',{mode:'accept',senders:['alpha'],crossWorkspace:true,alias:''});assert.equal((await f.m.send(f.a,{id:'both',target:'beta',text:'synthetic'})).status,'delivered');
});
test('release preserves every non-queued historical receipt after sessions close',async()=>{
  const f=fixture();await f.policy('accept');await f.m.send(f.a,{id:'history',target:'beta',text:'synthetic'});
  f.roots.pop();
  for(const status of ['delivered','claimed','processed','failed','expired','uncertain']){
    const state=structuredClone(f.store.read());state.messages.history.status=status;state.messages.history.reason='PRESERVE_ORIGINAL';await f.store.write(state);
    const before=structuredClone(f.store.read());assert.equal((await f.m.release('history')).status,status);assert.deepEqual(f.store.read(),before);
  }
});
test('model discovery hides default-refuse, unauthorized and cross-workspace-denied roots',async()=>{
  const f=fixture();assert.deepEqual(f.m.directory(f.a),[]);assert.equal(f.m.directory().length,2);
  await f.policy('hold');assert.equal(f.m.directory(f.a)[0].id,'beta');
  await f.m.setPolicy('beta',{mode:'accept',senders:[],crossWorkspace:false,alias:'private alias'});assert.deepEqual(f.m.directory(f.a),[]);
  f.b.session={header:{cwd:'/synthetic/other'}};await f.m.setPolicy('beta',{mode:'accept',senders:['alpha'],crossWorkspace:true,alias:'private alias'});assert.deepEqual(f.m.directory(f.a),[]);
});
