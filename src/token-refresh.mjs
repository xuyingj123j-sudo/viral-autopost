import {isMain,command,redact,actionsOnly} from './runtime.mjs';
import {refreshThreadsToken} from './threads.mjs';
export async function main({refresh=refreshThreadsToken,run=command,env=process.env}={}){
 if(!env.GH_PAT){console.log('提醒：未配置 GH_PAT，请手动续期 Threads 长期令牌并更新 THREADS_ACCESS_TOKEN。');return;}
 actionsOnly(env);
 if(!env.THREADS_ACCESS_TOKEN){console.log('提醒：未配置 Threads 令牌，跳过续期。');return;}
 const token=await refresh();await run('gh',['secret','set','THREADS_ACCESS_TOKEN','--repo',env.GITHUB_REPOSITORY],{input:token,env:{...env,GH_TOKEN:env.GH_PAT}});
 console.log('Threads 长期令牌已续期并回写 Secret。');
}
if(isMain(import.meta.url))main().catch(e=>{console.error(redact(e.message));process.exitCode=1;});
