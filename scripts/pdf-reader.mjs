import {Worker} from 'node:worker_threads';
export function readPdf(bytes,start=1,{signal,timeoutMs=10000}={}){
  signal?.throwIfAborted();
  if(!Number.isSafeInteger(start)||start<1||start>3000)throw new Error('Invalid PDF page');
  return new Promise((resolve,reject)=>{
    const worker=new Worker(new URL('./pdf-worker.mjs',import.meta.url),{workerData:{bytes,start},resourceLimits:{maxOldGenerationSizeMb:192}});
    let done=false;const finish=(error,result)=>{if(done)return;done=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);worker.terminate();error?reject(error):resolve(result);};
    const abort=()=>finish(new Error('PDF extraction aborted')),timer=setTimeout(()=>finish(new Error('PDF extraction timeout')),timeoutMs);
    signal?.addEventListener('abort',abort,{once:true});worker.once('message',r=>r.error?finish(new Error(r.error)):finish(null,r));worker.once('error',e=>finish(e));worker.once('exit',()=>{if(!done)finish(new Error('PDF extraction ended without text'));});
  });
}
