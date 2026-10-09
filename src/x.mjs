import {createHmac,randomUUID} from 'node:crypto';
import {request,requireKeys,actionsOnly} from './runtime.mjs';
const escape=v=>encodeURIComponent(v).replace(/[!'()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase());
export function sign(method,url,env=process.env){
 const p={oauth_consumer_key:env.X_API_KEY,oauth_token:env.X_ACCESS_TOKEN,oauth_nonce:randomUUID(),oauth_timestamp:String(Math.floor(Date.now()/1000)),oauth_signature_method:'HMAC-SHA1',oauth_version:'1.0'};
 const u=new URL(url),pairs=[...u.searchParams,...Object.entries(p)].map(([k,v])=>[escape(k),escape(v)]).sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:a[1]<b[1]?-1:a[1]>b[1]?1:0);
 const base=[method,u.origin+u.pathname,pairs.map(p=>p.join('=')).join('&')].map(escape).join('&');
 p.oauth_signature=createHmac('sha1',escape(env.X_API_SECRET)+'&'+escape(env.X_ACCESS_TOKEN_SECRET)).update(base).digest('base64');
 return 'OAuth '+Object.entries(p).map(([k,v])=>escape(k)+'="'+escape(v)+'"').join(', ');
}
export async function postX(post,fetcher=request){
 actionsOnly();requireKeys('x');const url='https://api.x.com/2/tweets';
 const r=await fetcher(url,{method:'POST',headers:{Authorization:sign('POST',url),'Content-Type':'application/json'},body:JSON.stringify({text:post.text})});
 if(!r.data?.id)throw new Error('X 未返回帖子 ID');return {media_id:r.data.id,url:'https://x.com/i/web/status/'+r.data.id};
}
export async function getXMetrics(id,fetcher=request){
 requireKeys('x');if(!/^\d+$/.test(id))throw new Error('帖子 ID 无效');
 const u='https://api.x.com/2/tweets/'+id+'?tweet.fields=public_metrics';return fetcher(u,{headers:{Authorization:sign('GET',u)}});
}
