import {resolve} from 'node:path';
import {root,records,jsonWrite,isMain,redact} from './runtime.mjs';
import {getXMetrics} from './x.mjs';
import {getThreadsMetrics} from './threads.mjs';
export async function collect({base=root,now=new Date(),readX=getXMetrics,readThreads=getThreadsMetrics}={}){
 const results=[];
 for(const p of await records(resolve(base,'posted'))){
  const row={id:p.id,platform:p.platform,source:p.source??null,collected_at:now.toISOString()};
  try{if(!p.media_id)throw new Error('缺少平台帖子 ID');row.data=await (p.platform==='x'?readX:readThreads)(p.media_id);}
  catch(e){row.error=redact(e.message);}results.push(row);
 }
 await jsonWrite(resolve(base,'metrics',now.toISOString().replace(/[:.]/g,'-')+'.json'),results);
 console.log('互动数据已写入 metrics/，共 '+results.length+' 条。');return results;
}
if(isMain(import.meta.url))collect().catch(e=>{console.error(redact(e.message));process.exitCode=1;});
