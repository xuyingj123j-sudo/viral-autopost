import {resolve} from 'node:path';
import {readdir} from 'node:fs/promises';
import {root,isMain,jsonRead,jsonWrite,redact,actionsOnly,requireKeys,commitState,records} from './runtime.mjs';
import {context,queueErrors,contentErrors} from './checks.mjs';
import {inWindow} from './queue-add.mjs';
import {postX} from './x.mjs';
import {postThreads} from './threads.mjs';
export async function publishQueue(posts,{now=Date.now(),ctx,send,persist,archive,env=process.env,lastPublished={}}){
 const errors=queueErrors(posts);if(errors.length)throw new Error(errors.join('；'));
 for(const p of posts)if(p.status==='posted'&&p.posted_at)lastPublished[p.platform]=Math.max(lastPublished[p.platform]??0,Date.parse(p.posted_at)||0);
 for(const p of [...posts].sort((a,b)=>Date.parse(a.scheduled_at)-Date.parse(b.scheduled_at))){
  if(p.status==='posting'){p.status='failed';p.error='发布状态不确定，请人工核对；不会自动重发';await persist(posts);continue;}
  if(p.status!=='pending'||Date.parse(p.scheduled_at)>now)continue;
  if(now-Date.parse(p.scheduled_at)>6*3600000){p.status='failed';p.error='超过 6 小时未发布';await persist(posts);continue;}
  try{requireKeys(p.platform,env);}catch(e){p.status='failed';p.error=e.message;await persist(posts);continue;}
  const e=contentErrors(p,ctx);if(e.length){p.status='blocked';p.error=e.join('；');await persist(posts);continue;}
  if(!inWindow(now,ctx.settings))continue;
  if(lastPublished[p.platform]!=null&&now-lastPublished[p.platform]<ctx.settings.min_interval_minutes*60000)continue;
  // 必须写入并推送 posting 成功后才发送。持久化失败停止任务。
  p.status='posting';await persist(posts);
  try{const result=await send(p);p.status='posted';p.posted_at=new Date(now).toISOString();p.url=result.url;p.media_id=result.media_id??null;p.error=null;}
  catch(e){p.status=e.permission?'blocked':'failed';p.error=redact(e.message,env);}
  if(p.status==='posted'){lastPublished[p.platform]=now;await archive({...p});}
  await persist(posts);
 }return posts;
}
export async function main(){
 actionsOnly();const ctx=await context(),files=(await readdir(resolve(root,'queue'))).filter(n=>n.endsWith('.json')).sort(),batches=[];
 for(const n of files)batches.push({n,posts:await jsonRead(resolve(root,'queue',n))});
 const errors=queueErrors(batches.flatMap(b=>b.posts));if(errors.length)throw new Error(errors.join('；'));
 const lastPublished={};
 for(const p of [...await records(resolve(root,'posted')),...batches.flatMap(b=>b.posts)])if(p.status==='posted'&&p.posted_at)lastPublished[p.platform]=Math.max(lastPublished[p.platform]??0,Date.parse(p.posted_at)||0);
 for(const {n,posts} of batches)await publishQueue(posts,{ctx,lastPublished,send:p=>p.platform==='x'?postX(p):postThreads(p),
 persist:async v=>{await jsonWrite(resolve(root,'queue',n),v);await commitState(['queue','posted']);},
 archive:async p=>{const path=resolve(root,'posted',p.posted_at.slice(0,7)+'.json');let history=[];try{history=await jsonRead(path);}catch(e){if(e.code!=='ENOENT')throw e;}if(!history.some(x=>x.id===p.id))history.push(p);await jsonWrite(path,history);}
 });
 console.log('发布队列处理完成，请查看各条 status/error。');
}
if(isMain(import.meta.url))main().catch(e=>{console.error(redact(e.message));process.exitCode=1;});
