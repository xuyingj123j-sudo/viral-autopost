import {request,requireKeys,actionsOnly} from './runtime.mjs';
const base='https://graph.threads.net/v1.0';
const headers=()=>({Authorization:'Bearer '+process.env.THREADS_ACCESS_TOKEN});
export async function postThreads(post,fetcher=request){
 actionsOnly();requireKeys('threads');
 const c=await fetcher(base+'/me/threads',{method:'POST',headers:headers(),body:new URLSearchParams({media_type:'TEXT',text:post.text})});
 if(!c.id)throw new Error('Threads 未返回容器 ID');
 const r=await fetcher(base+'/me/threads_publish',{method:'POST',headers:headers(),body:new URLSearchParams({creation_id:c.id})});
 if(!r.id)throw new Error('Threads 未返回帖子 ID');
 const detail=await fetcher(base+'/'+r.id+'?fields=permalink',{headers:headers()});
 if(!detail.permalink)throw new Error('帖子可能已发布，请人工核对链接');return {media_id:r.id,url:detail.permalink};
}
export async function getThreadsMetrics(id,fetcher=request){
 requireKeys('threads');if(!/^\d+$/.test(id))throw new Error('帖子 ID 无效');
 return fetcher(base+'/'+id+'/insights?metric=views,likes,replies,reposts,quotes',{headers:headers()});
}
export async function refreshThreadsToken(fetcher=request){
 requireKeys('threads');const u=new URL('https://graph.threads.net/refresh_access_token');
 u.searchParams.set('grant_type','th_refresh_token');u.searchParams.set('access_token',process.env.THREADS_ACCESS_TOKEN);
 const r=await fetcher(u);if(!r.access_token)throw new Error('续期未返回令牌');return r.access_token;
}
