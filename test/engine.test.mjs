import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {contentErrors,queueErrors,weightedLength,validISO,context} from '../src/checks.mjs';
import {plan,weekKey,addDraft} from '../src/queue-add.mjs';
import {publishQueue} from '../src/publish.mjs';
import {request,redact,jsonWrite} from '../src/runtime.mjs';
import {postX} from '../src/x.mjs';
import {postThreads} from '../src/threads.mjs';
import {main as refresh} from '../src/token-refresh.mjs';
import {collect} from '../src/metrics.mjs';
// Entire suite is offline: any unmocked network request fails immediately.
globalThis.fetch=async()=>{throw new Error('Tests forbid network access');};
const settings={timezone:'Asia/Shanghai',window:{start:'08:30',end:'23:00'},min_interval_minutes:90,x_premium:false,allow_links:false};
const ctx={settings,words:['保密名字'],simplified:'这后'};
const now=Date.parse('2026-01-05T09:00:00+08:00');
const env={X_API_KEY:'demo',X_API_SECRET:'demo',X_ACCESS_TOKEN:'demo',X_ACCESS_TOKEN_SECRET:'demo',THREADS_ACCESS_TOKEN:'demo'};
const post=(over={})=>({id:'2026W02-x-1',platform:'x',text:'练习一步',status:'pending',scheduled_at:new Date(now).toISOString(),posted_at:null,url:null,error:null,image:null,source:null,...over});
test('checks: empty, privacy, weighted X, premium, Threads length, simplified, links',()=>{
 assert.match(contentErrors(post({text:' '}),ctx).join(),/为空/);
 assert.match(contentErrors(post({text:'保密名字'}),ctx).join(),/隐私/);
 assert.equal(contentErrors(post({text:'中'.repeat(140)}),ctx).length,0);
 assert.match(contentErrors(post({text:'中'.repeat(141)}),ctx).join(),/280/);
 assert.equal(contentErrors(post({text:'中'.repeat(141)}),{...ctx,settings:{...settings,x_premium:true}}).length,0);
 assert.equal(weightedLength('👨‍👩‍👧‍👦🙋🏽🇹🇼1️⃣'),8);
 assert.equal(weightedLength('cafe\u0301'),4);
 assert.equal(weightedLength('https://example.com/a'),23);
 assert.match(contentErrors(post({platform:'threads',text:'練'.repeat(501)}),ctx).join(),/500/);
 assert.equal(contentErrors(post({platform:'threads',text:'練'.repeat(500)}),ctx).length,0);
 assert.match(contentErrors(post({platform:'threads',text:'这件事'}),ctx).join(),/简体/);
 for(const text of ['https://example.com','www.example.com','example.com'])assert.match(contentErrors(post({text}),ctx).join(),/链接/);
 assert.equal(contentErrors(post({text:'https://example.com'}),{...ctx,settings:{...settings,allow_links:true}}).length,0);
});
test('queue schema: duplicate, platform, status, invalid ISO dates',()=>{
 assert.equal(queueErrors([post()]).length,0);
 assert.match(queueErrors([post(),post()]).join(),/重复/);
 assert.match(queueErrors([post({platform:'other',status:'unknown',scheduled_at:'tomorrow'})]).join(),/platform.*status.*ISO/);
 assert.equal(validISO('2026-02-30T09:00:00Z'),false);
 assert.equal(validISO('2026-01-05T09:00:00'),false);
 assert.equal(validISO('2026-01-05T09:00:00+08:00'),true);
});
test('schedule: nearest slot, platform spacing, existing queue, cross day, timezone',()=>{
 const draft=[{platform:'x',text:'练习'},{platform:'x',text:'第二步'},{platform:'threads',text:'練習'}];
 let out=plan(draft,[],ctx,Date.parse('2026-01-05T08:00:00+08:00'));
 assert.equal(out[0].scheduled_at,'2026-01-05T00:30:00.000Z');
 assert.equal(out[1].scheduled_at,'2026-01-05T02:00:00.000Z');
 assert.equal(out[2].scheduled_at,out[0].scheduled_at);
 out=plan([{platform:'x',text:'新帖'}],[post({scheduled_at:'2026-01-05T14:30:00.000Z'})],ctx,Date.parse('2026-01-05T22:00:00+08:00'));
 assert.equal(out[0].scheduled_at,'2026-01-06T00:30:00.000Z');
 const utc={...ctx,settings:{...settings,timezone:'UTC'}};
 assert.equal(plan([draft[0]],[],utc,Date.parse('2026-01-05T08:00:00Z'))[0].scheduled_at,'2026-01-05T08:30:00.000Z');
 assert.throws(()=>plan([{...draft[0],scheduled_at:'2026-01-05T07:00:00+08:00'}],[],ctx,now),/时间/);
 assert.equal(weekKey(Date.parse('2021-01-01T12:00:00Z'),'UTC'),'2020W53');
 const history=[post({status:'posted',scheduled_at:new Date(now-120*60000).toISOString(),posted_at:new Date(now-10*60000).toISOString()})];
 assert.equal(plan([draft[0]],history,ctx,now)[0].scheduled_at,new Date(now+80*60000).toISOString());
});
test('publish: posting is persisted before send; archive and final state',async()=>{
 const p=post(),events=[];
 await publishQueue([p],{ctx,now,env,persist:async()=>events.push(p.status),send:async()=>{assert.deepEqual(events,['posting']);return {url:'demo',media_id:'1'};},archive:async v=>{assert.equal(v.status,'posted');events.push('archive');}});
 assert.deepEqual(events,['posting','archive','posted']);assert.equal(p.posted_at,new Date(now).toISOString());
});
test('publish: persistence failure stops send',async()=>{
 let sent=false;
 await assert.rejects(publishQueue([post()],{ctx,now,env,persist:async()=>{throw new Error('storage');},send:async()=>{sent=true;},archive:async()=>{}}),/storage/);
 assert.equal(sent,false);
});
test('publish: recovery, stale, future, blocked, send failure and permission',async()=>{
 const cases=[post({status:'posting'}),post({id:'stale',scheduled_at:new Date(now-7*3600000).toISOString()}),post({id:'future',scheduled_at:new Date(now+3600000).toISOString()}),post({id:'privacy',text:'保密名字'}),post({id:'error'}),post({id:'permission'})];
 let sends=0;
 await publishQueue(cases,{ctx,now,env,persist:async()=>{},archive:async()=>assert.fail(),send:async p=>{sends++;const e=new Error('demo failure');if(p.id==='permission')e.permission=true;throw e;}});
 assert.deepEqual(cases.map(p=>p.status),['failed','failed','pending','blocked','failed','blocked']);assert.equal(sends,2);
});
test('publish: only one platform configured, both directions',async()=>{
 for(const configured of ['x','threads']){
  const selected=Object.fromEntries(Object.entries(env).filter(([k])=>configured==='x'?k.startsWith('X_'):k.startsWith('THREADS_')));
  const posts=[post(),post({id:'threads-1',platform:'threads',text:'練習'})];let calls=0;
  await publishQueue(posts,{ctx,now,env:selected,persist:async()=>{},archive:async()=>{},send:async()=>{calls++;return {url:'demo'};}});
  assert.equal(calls,1);assert.equal(posts.find(p=>p.platform===configured).status,'posted');
  assert.match(posts.find(p=>p.platform!==configured).error,/未配置 (X|Threads) 密钥/);
 }
});
test('publish: current time window gates sending',async()=>{
 const p=post({scheduled_at:'2026-01-05T14:00:00.000Z'});
 await publishQueue([p],{ctx,now:Date.parse('2026-01-05T15:30:00Z'),env,persist:async()=>assert.fail(),archive:async()=>assert.fail(),send:async()=>assert.fail()});
 assert.equal(p.status,'pending');
});
test('publish: delayed same-platform posts respect actual interval across batches',async()=>{
 const lastPublished={},first=post({scheduled_at:new Date(now-2*3600000).toISOString()}),second=post({id:'second',scheduled_at:new Date(now-30*60000).toISOString()});
 const options={ctx,now,env,lastPublished,persist:async()=>{},archive:async()=>{},send:async()=>({url:'demo'})};
 await publishQueue([first,second],options);
 assert.equal(first.status,'posted');assert.equal(second.status,'pending');
 const third=post({id:'third'});await publishQueue([third],options);assert.equal(third.status,'pending');
 await publishQueue([second],{...options,now:now+90*60000});assert.equal(second.status,'posted');
});
test('request rejects nonofficial origins before fetch; local send guard; redact',async()=>{
 const old=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;assert.fail('network forbidden');};
 const original=process.env.GITHUB_ACTIONS;delete process.env.GITHUB_ACTIONS;
 try{
  for(const u of ['https://example.com','https://api.x.com.evil.test','http://api.x.com','https://api.x.com:444','https://user@api.x.com'])await assert.rejects(request(u),/非官方/);
  await assert.rejects(postX(post()),/GitHub Actions/);await assert.rejects(postThreads(post()),/GitHub Actions/);
  await assert.rejects(request('https://api.x.com/2/tweets',{method:'POST'}),/GitHub Actions/);assert.equal(calls,0);
  assert.equal(redact('oops sensitive-demo',{X_API_SECRET:'sensitive-demo'}),'oops [已脱敏]');
 }finally{globalThis.fetch=old;if(original===undefined)delete process.env.GITHUB_ACTIONS;else process.env.GITHUB_ACTIONS=original;}
});
test('official request: redirect refusal, HTTP handling, redaction without network',async()=>{
 const old=globalThis.fetch;
 try{
  globalThis.fetch=async(u,o)=>{assert.equal(u.origin,'https://api.x.com');assert.equal(o.redirect,'error');return {ok:true,json:async()=>({data:'demo'})};};
  assert.deepEqual(await request('https://api.x.com/2/tweets'),{data:'demo'});
  globalThis.fetch=async()=>({ok:false,status:403});await assert.rejects(request('https://api.x.com/2/tweets'),e=>e.permission===true);
 }finally{globalThis.fetch=old;}
});
async function fixture(t){
 const base=await mkdtemp(resolve(tmpdir(),'viral-autopost-test-'));t.after(()=>rm(base,{recursive:true,force:true}));
 await mkdir(resolve(base,'config'));await jsonWrite(resolve(base,'config/settings.json'),settings);
 await writeFile(resolve(base,'config/simplified-only.txt'),'这后');return base;
}
test('queue-add: valid append IDs and invalid whole batch leaves bytes unchanged',async t=>{
 const base=await fixture(t),file=resolve(base,'draft.json');await writeFile(file,'\uFEFF'+JSON.stringify([{platform:'x',text:'练习'}]));
 const first=await addDraft(file,{base,now});const q=resolve(base,'queue','2026W02.json'),before=await readFile(q,'utf8');
 await jsonWrite(file,[{platform:'x',text:'第二步'},{platform:'x',text:' '}]);
 await assert.rejects(addDraft(file,{base,now}),/为空/);assert.equal(await readFile(q,'utf8'),before);
 await jsonWrite(file,[{platform:'x',text:'第二步'}]);const second=await addDraft(file,{base,now});
 assert.notEqual(first[0].id,second[0].id);assert.equal(Date.parse(second[0].scheduled_at)-Date.parse(first[0].scheduled_at),90*60000);
 assert.deepEqual(await readdir(resolve(base,'queue')),['2026W02.json']);
});
test('privacy combines local and Secret without comments',async t=>{
 const base=await fixture(t),old=process.env.PRIVACY_BLOCKLIST;
 await writeFile(resolve(base,'config/privacy-blocklist.txt'),'# comment\nlocal-private\n');process.env.PRIVACY_BLOCKLIST='secret-private';
 try{assert.deepEqual((await context(base)).words,['local-private','secret-private']);}finally{if(old===undefined)delete process.env.PRIVACY_BLOCKLIST;else process.env.PRIVACY_BLOCKLIST=old;}
});
test('token refresh: missing PAT skips; token goes through stdin only',async()=>{
 await refresh({env:{},refresh:async()=>assert.fail(),run:async()=>assert.fail()});
 await refresh({env:{GH_PAT:'demo',THREADS_ACCESS_TOKEN:'demo',GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:'example/template'},refresh:async()=>'refreshed-demo',run:async(bin,args,options)=>{
  assert.equal(bin,'gh');assert.deepEqual(args,['secret','set','THREADS_ACCESS_TOKEN','--repo','example/template']);assert.equal(options.input,'refreshed-demo');assert.equal(options.env.GH_TOKEN,'demo');
 }});
});
test('metrics: isolated fake reads preserve source and failures',async t=>{
 const base=await fixture(t);await jsonWrite(resolve(base,'posted/2026-01.json'),[post({status:'posted',media_id:'1',source:'library/sample.md'}),post({id:'threads',platform:'threads',status:'posted',media_id:'2'})]);
 const result=await collect({base,now:new Date(now),readX:async()=>({likes:2}),readThreads:async()=>{throw new Error('missing permission');}});
 assert.equal(result[0].source,'library/sample.md');assert.deepEqual(result[0].data,{likes:2});assert.equal(result[1].error,'missing permission');
 assert.equal((await readdir(resolve(base,'metrics'))).length,1);
});
