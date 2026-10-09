import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {root,jsonRead} from './runtime.mjs';
const links=/(?:https?:\/\/|www\.)[^\s]+|(?:[\p{L}\d-]+\.)+(?:com|org|net|io|co|dev|app|cn|tw)(?:\/[^\s]*)?/giu;
export function weightedLength(text){
 const normalized=text.normalize('NFC').replace(links,'a'.repeat(23));let n=0;
 for(const {segment} of new Intl.Segmenter('en',{granularity:'grapheme'}).segment(normalized)){
  if(/\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20e3/u.test(segment)){n+=2;continue;}
  for(const c of segment){const p=c.codePointAt(0);n+=(p<=0x10ff||(p>=0x2000&&p<=0x200d)||(p>=0x2010&&p<=0x201f)||(p>=0x2032&&p<=0x2037))?1:2;}
 }return n;
}
export function contentErrors(p,{settings={},words=[],simplified=''}={}){
 const e=[];if(typeof p.text!=='string'||!p.text.trim())return ['正文为空'];
 const text=p.text.normalize('NFKC').toLowerCase();
 if(words.some(w=>w.trim()&&text.includes(w.normalize('NFKC').toLowerCase())))e.push('正文命中隐私词');
 if(settings.allow_links!==true&&new RegExp(links.source,links.flags).test(p.text))e.push('正文不得带链接');
 if(p.platform==='x'&&settings.x_premium!==true&&weightedLength(p.text)>280)e.push('X 超过 280 加权字符');
 if(p.platform==='threads'){
  if([...p.text].length>500)e.push('Threads 超过 500 字');
  if([...p.text].some(c=>simplified.includes(c)))e.push('Threads 含简体专用字，请改为繁体');
 }return e;
}
export function validISO(v){
 if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(v)||!Number.isFinite(Date.parse(v)))return false;
 const [y,m,d]=v.slice(0,10).split('-').map(Number);
 return new Date(Date.UTC(y,m-1,d)).toISOString().slice(0,10)===v.slice(0,10);
}
export function queueErrors(posts){
 if(!Array.isArray(posts))return ['队列必须是数组'];const ids=new Set(),e=[];
 for(const p of posts){if(!p||typeof p!=='object'){e.push('帖子格式无效');continue;}
 if(typeof p.id!=='string'||!p.id||ids.has(p.id))e.push('id 为空或重复');ids.add(p.id);
 if(!['x','threads'].includes(p.platform))e.push('platform 必须是 x 或 threads');
 if(!['pending','posting','posted','failed','blocked'].includes(p.status))e.push('status 无效');
 if(!validISO(p.scheduled_at))e.push('scheduled_at 必须是合法 ISO 时间');
 if(typeof p.text!=='string')e.push('text 必须是字符串');
 if(p.image!=null)e.push('当前仅支持文字帖子，image 必须为 null');
 if(p.source!=null&&typeof p.source!=='string')e.push('source 必须是字符串或 null');
 }return e;
}
export function validateSettings(s){
 new Intl.DateTimeFormat('en',{timeZone:s.timezone});
 const hm=v=>typeof v==='string'&&/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(v);
 if(!hm(s.window?.start)||!hm(s.window?.end)||s.window.start>s.window.end)throw new Error('时间窗必须是同一天的 HH:mm 起止时间');
 if(!Number.isInteger(s.min_interval_minutes)||s.min_interval_minutes<1)throw new Error('最小间隔必须是正整数分钟');return s;
}
export async function context(base=root){
 const settings=validateSettings(await jsonRead(resolve(base,'config/settings.json')));let local='';
 try{local=await readFile(resolve(base,'config/privacy-blocklist.txt'),'utf8');}catch(e){if(e.code!=='ENOENT')throw e;}
 const words=(local+'\n'+(process.env.PRIVACY_BLOCKLIST??'')).split(/\r?\n/).map(s=>s.trim()).filter(s=>s&&!s.startsWith('#'));
 const simplified=(await readFile(resolve(base,'config/simplified-only.txt'),'utf8')).split(/\r?\n/).filter(s=>!s.startsWith('#')).join('');
 return {settings,words,simplified};
}
