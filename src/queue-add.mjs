import {resolve} from 'node:path';
import {mkdir,open,rm} from 'node:fs/promises';
import {root,isMain,jsonRead,jsonWrite,records,redact} from './runtime.mjs';
import {context,queueErrors,contentErrors,validISO,validateSettings} from './checks.mjs';
export function localParts(ms,timezone){
 const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(ms).map(x=>[x.type,x.value]));
 return {date:p.year+'-'+p.month+'-'+p.day,time:p.hour+':'+p.minute};
}
export function inWindow(ms,s){const t=localParts(ms,s.timezone).time;return t>=s.window.start&&t<=s.window.end;}
export function weekKey(ms,timezone){
 const d=new Date(localParts(ms,timezone).date+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+4-(d.getUTCDay()||7));
 const y=d.getUTCFullYear(),start=new Date(Date.UTC(y,0,1));return y+'W'+String(Math.ceil((((d-start)/86400000)+1)/7)).padStart(2,'0');
}
export function plan(drafts,existing,ctx,now=Date.now()){
 const s=validateSettings(ctx.settings);if(!Array.isArray(drafts)||!drafts.length)throw new Error('draft 必须是非空数组');
 const used=[...existing],out=[],ids=new Set(existing.map(p=>p.id));
 for(const d of drafts){
  if(!d||!['x','threads'].includes(d.platform))throw new Error('platform 必须是 x 或 threads');let ms;
  const free=t=>inWindow(t,s)&&!used.some(p=>p.platform===d.platform&&['pending','posting','posted'].includes(p.status)&&Math.abs(Date.parse(p.status==='posted'&&p.posted_at?p.posted_at:p.scheduled_at)-t)<s.min_interval_minutes*60000);
  if(d.scheduled_at!=null){if(!validISO(d.scheduled_at))throw new Error('scheduled_at 无效');ms=Date.parse(d.scheduled_at);if(ms<now||!free(ms))throw new Error('指定时间已过去、在时间窗外或间隔不足');}
  else{ms=Math.ceil(now/60000)*60000;const end=ms+366*86400000;while(ms<=end&&!free(ms))ms+=60000;if(ms>end)throw new Error('一年内没有可用排期');}
  const week=weekKey(ms,s.timezone);let n=1;while(ids.has(week+'-'+d.platform+'-'+n))n++;
  const p={id:week+'-'+d.platform+'-'+n,platform:d.platform,status:'pending',text:d.text,scheduled_at:new Date(ms).toISOString(),posted_at:null,url:null,error:null,image:null,source:d.source??null};
  const errors=[...queueErrors([p]),...contentErrors(p,ctx)];if(errors.length)throw new Error(errors.join('；'));
  ids.add(p.id);used.push(p);out.push(p);
 }return out;
}
export async function addDraft(file,{base=root,now=Date.now()}={}){
 const folder=resolve(base,'queue');await mkdir(folder,{recursive:true});const lock=resolve(folder,'.queue-add.lock');let handle;
 try{handle=await open(lock,'wx');}catch(e){if(e.code==='EEXIST')throw new Error('另一个入队任务正在运行；确认无进程后可移除 queue/.queue-add.lock');throw e;}
 try{
  const ctx=await context(base),existing=await records(folder),history=await records(resolve(base,'posted'));
  const errors=queueErrors(existing);if(errors.length)throw new Error(errors.join('；'));
  const unique=new Map([...history,...existing].map(p=>[p.id,p]));
  const posts=plan(await jsonRead(file),[...unique.values()],ctx,now),groups=new Map();
  for(const p of posts){const week=weekKey(Date.parse(p.scheduled_at),ctx.settings.timezone);if(!groups.has(week)){let previous=[];try{previous=await jsonRead(resolve(folder,week+'.json'));}catch(e){if(e.code!=='ENOENT')throw e;}groups.set(week,previous);}groups.get(week).push(p);}
  for(const [week,values] of groups)await jsonWrite(resolve(folder,week+'.json'),values);
  console.log('ID | 平台 | 本地时间 ('+ctx.settings.timezone+')');
  for(const p of posts){const t=localParts(Date.parse(p.scheduled_at),ctx.settings.timezone);console.log(p.id+' | '+p.platform+' | '+t.date+' '+t.time);}
  return posts;
 }finally{await handle.close();await rm(lock,{force:true});}
}
if(isMain(import.meta.url)){const i=process.argv.indexOf('--file');if(i<0||!process.argv[i+1]){console.error('用法：node src/queue-add.mjs --file <draft.json>');process.exitCode=1;}else addDraft(resolve(process.argv[i+1])).catch(e=>{console.error(redact(e.message));process.exitCode=1;});}
