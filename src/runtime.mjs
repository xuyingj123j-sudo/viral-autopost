import {readFile,writeFile,mkdir,rename,rm,readdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
export const root=resolve(import.meta.dirname,'..');
export const isMain=url=>process.argv[1]&&url===pathToFileURL(resolve(process.argv[1])).href;
export function redact(value,env=process.env){
 let s=String(value);
 for(const [k,v] of Object.entries(env).sort((a,b)=>(b[1]?.length??0)-(a[1]?.length??0)))
  if(v&&/TOKEN|SECRET|PASSWORD|API_KEY|PRIVACY_BLOCKLIST|GH_PAT/.test(k))s=s.split(v).join('[已脱敏]');
 return s.replace(/(access_token|oauth_token|authorization)[=:]\s*[^&\s]+/gi,'$1=[已脱敏]');
}
export function actionsOnly(env=process.env){if(env.GITHUB_ACTIONS!=='true')throw new Error('真实发布仅允许在 GitHub Actions 中运行');}
export const keys={x:['X_API_KEY','X_API_SECRET','X_ACCESS_TOKEN','X_ACCESS_TOKEN_SECRET'],threads:['THREADS_ACCESS_TOKEN']};
export function requireKeys(platform,env=process.env){if(keys[platform].some(k=>!env[k]?.trim()))throw new Error('未配置 '+(platform==='x'?'X':'Threads')+' 密钥');}
export async function request(url,options={}){
 const u=new URL(url);
 if(!['https://api.x.com','https://graph.threads.net'].includes(u.origin)||u.username||u.password)throw new Error('禁止调用非官方 API');
 if(options.method&&options.method.toUpperCase()!=='GET')actionsOnly();
 try{
  const res=await fetch(u,{...options,redirect:'error',signal:options.signal??AbortSignal.timeout(20000)});
  if(!res.ok){const e=new Error('官方 API HTTP '+res.status);e.permission=res.status===403;throw e;}
  return await res.json();
 }catch(e){const safe=new Error(redact(e.message));safe.permission=e.permission;throw safe;}
}
export async function jsonRead(p){return JSON.parse((await readFile(p,'utf8')).replace(/^\uFEFF/,''));}
export async function jsonWrite(p,v){
 await mkdir(dirname(p),{recursive:true});const temp=p+'.tmp';
 try{await writeFile(temp,JSON.stringify(v,null,2)+'\n','utf8');await rename(temp,p);}
 catch(e){await rm(temp,{force:true});throw e;}
}
export async function records(folder){
 let names;try{names=await readdir(folder);}catch(e){if(e.code==='ENOENT')return [];throw e;}
 const out=[];for(const n of names.filter(n=>n.endsWith('.json')).sort())out.push(...await jsonRead(resolve(folder,n)));return out;
}
export function command(bin,args,{input,cwd=root,env=process.env}={}){
 return new Promise((ok,no)=>{const c=spawn(bin,args,{cwd,env,windowsHide:true,stdio:['pipe','pipe','pipe']});let out='';
 c.stdout.on('data',b=>out+=b);c.stderr.on('data',()=>{});c.on('error',()=>no(new Error('无法启动 '+bin)));
 c.on('close',code=>code===0?ok(out):no(new Error(bin+' 失败，退出码 '+code)));c.stdin.on('error',()=>{});c.stdin.end(input);});
}
export async function commitState(paths){await command('git',['add','--',...paths]);if((await command('git',['diff','--cached','--name-only'])).trim()){await command('git',['commit','-m','Update automation state']);await command('git',['push']);}}
