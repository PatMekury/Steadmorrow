import {get} from 'node:https';
import {lookup} from 'node:dns/promises';
import {isIP,BlockList} from 'node:net';
import {digest} from './evidence-client.mjs';

const denied=new BlockList();
for(const [ip,n] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],['192.168.0.0',16],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',3]])denied.addSubnet(ip,n);
// Only globally routed IPv6 unicast. Explicitly exclude transition/tunnel and documentation ranges.
export function publicAddress(ip){
  if(isIP(ip)===4)return !denied.check(ip);
  return isIP(ip)===6&&/^[23][0-9a-f]{3}:/i.test(ip)&&!/^200[12]:|^2001:db8:|^2001:0:/i.test(ip);
}
export function webUrl(value){
  const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.port&&u.port!=='443'||isIP(u.hostname)||u.hostname.includes(':')||!u.hostname.includes('.')||/\.(localhost|local|internal)$/i.test(u.hostname))throw new Error('Unsupported public source URL');
  if([...u.searchParams.keys()].some(k=>/^(url|redirect|redirect_uri|returnurl|target|token|api_key)$/i.test(k)))throw new Error('Unsupported public source parameters');
  u.hash='';return u.href;
}
export async function publicRequest(value,{signal,maxBytes=6_000_000,resolveHost=lookup}={}){
  const url=webUrl(value),u=new URL(url);let addresses;
  try{addresses=await resolveHost(u.hostname,{all:true,verbatim:true});}catch(e){e.stage='dns';throw e;}
  signal?.throwIfAborted();
  if(!addresses.length||addresses.some(a=>!publicAddress(a.address)))throw new Error('Unsupported public source address');
  // Pin the checked address into the TLS connection, retaining hostname validation.
  return new Promise((resolve,reject)=>{
    let stage='connect';const req=get(url,{signal,headers:{'User-Agent':'Steadmorrow/0.1 (public land-use research)','Accept':'text/html,application/pdf,text/plain'},lookup:(_host,options,callback)=>options.all?callback(null,addresses):callback(null,addresses[0].address,addresses[0].family)},res=>{
      stage='response';const status=res.statusCode,location=res.headers.location,type=res.headers['content-type']??'';
      if(status>=300&&status<400||status>=400){res.resume();resolve({status,location,type,buffer:Buffer.alloc(0)});return;}
      if(Number(res.headers['content-length'])>maxBytes){res.destroy();reject(new Error('Source response exceeded the limit'));return;}
      const chunks=[];let size=0;
      res.on('data',chunk=>{size+=chunk.length;if(size>maxBytes){res.destroy();reject(new Error('Source response exceeded the limit'));}else chunks.push(chunk);});
      res.on('end',()=>resolve({status,type,buffer:Buffer.concat(chunks)}));res.on('error',reject);
    });req.on('socket',socket=>{socket.once('connect',()=>{stage='tls';});socket.once('secureConnect',()=>{stage='headers';});});req.on('error',e=>{e.stage=stage;reject(e);});
  });
}
// Never retain arbitrary error messages, request headers, or response bodies.
export function sourceFailure(error){
  const raw=error?.code??error?.cause?.code;
  const code=typeof raw==='string'&&/^[A-Z][A-Z0-9_]{1,60}$/.test(raw)?raw:undefined;
  const httpStatus=Number(error?.httpStatus)||Number(/\b([45]\d\d)\b/.exec(String(error?.message??''))?.[1])||undefined;
  const timeout=error?.name==='TimeoutError'||code==='ABORT_ERR'||/timeout|abort/i.test(String(error?.message??''));
  const status=[401,403].includes(httpStatus)?'access-blocked':httpStatus===429?'rate-limited':httpStatus===404?'not-found':timeout?'timed-out':/limit|large/i.test(String(error?.message??''))?'source-too-large':'source-error';
  const stage=['dns','connect','tls','headers','response','redirect','parse'].includes(error?.stage)?error.stage:code==='ENOTFOUND'||code==='EAI_AGAIN'?'dns':code?.includes('CERT')||code?.startsWith('ERR_TLS')?'tls':undefined;
  const message=httpStatus?`Source returned ${httpStatus}`:stage==='dns'?'The source hostname could not be resolved.':stage==='tls'?'The source could not establish a verified secure connection.':stage==='redirect'?'The source redirect could not be followed securely.':timeout?'The public source did not respond before its deadline.':'The public source could not be read.';
  return {status,message,diagnostic:{...(code?{code}:{}),...(httpStatus?{httpStatus}:{}),...(stage?{stage}:{}),...(error?.redirects?{redirects:error.redirects}:{}),retryable:timeout||httpStatus===429||httpStatus>=500||code==='EAI_AGAIN'},recovery:[401,403].includes(httpStatus)?'Use another official publication; do not bypass access restrictions.':'Choose another relevant discovered official source. Retain earlier evidence.'};
}
// Some official sites publish an HTTP canonical redirect even when HTTPS works.
// Attempt that exact destination over HTTPS; never make an insecure request.
export function secureRedirect(location,current){
  const next=new URL(location,current);if(next.protocol==='http:')next.protocol='https:';
  return webUrl(next.href);
}
export function createPublicWebClient({request=publicRequest,now=Date.now,maxCacheBytes=24_000_000,timeoutMs=12000}={}){
  const cache=new Map(),pending=new Map();let bytes=0;
  return async function read(value,{signal,ttl=900000,maxBytes=6_000_000}={}){
    const url=webUrl(value);signal?.throwIfAborted();const key=url+':'+maxBytes;
    const saved=cache.get(key);if(saved&&now()-saved.time<Math.min(ttl,86400000))return structuredClone(saved.result);
    if(!pending.has(key)){
      const task=(async()=>{let current=url;const chain=[];const deadline=AbortSignal.timeout(timeoutMs);
        for(let n=0;n<4;n++){
          let response;try{response=await request(current,{signal:deadline,maxBytes});}catch(e){e.redirects=chain;throw e;}
          if([301,302,303,307,308].includes(response.status)){
            if(!response.location)throw new Error('Source redirect missing');
            let next;try{next=secureRedirect(response.location,current);}catch(e){e.stage='redirect';e.redirects=chain;throw e;}
            if(next===current||chain.some(h=>h.from===next))throw Object.assign(new Error('Source redirect loop'),{stage:'redirect',redirects:chain});
            chain.push({from:current,to:next,status:response.status,httpsUpgrade:new URL(response.location,current).protocol==='http:'});current=next;continue;
          }
          if(response.status!==200)throw Object.assign(new Error(`Source returned ${response.status}`),{httpStatus:response.status,stage:'response',redirects:chain});
          if(response.buffer.length>maxBytes)throw new Error('Source response exceeded the limit');
          const result={data:response.buffer,url:current,requestedUrl:url,redirects:chain,contentType:response.type,hash:digest(response.buffer),retrievedAt:new Date(now()).toISOString()};
          if(cache.has(key)){bytes-=cache.get(key).size;cache.delete(key);}
          cache.set(key,{time:now(),result,size:response.buffer.length});bytes+=response.buffer.length;
          while(bytes>maxCacheBytes||cache.size>128){const oldest=cache.keys().next().value;bytes-=cache.get(oldest).size;cache.delete(oldest);}
          return result;
        }throw new Error('Source redirect limit');
      })();pending.set(key,task);task.finally(()=>pending.delete(key)).catch(()=>{});
    }
    // One cancelled case must not abort a different case sharing a public request.
    let abort;try{return structuredClone(await Promise.race([pending.get(key),...(signal?[new Promise((_,reject)=>{abort=()=>reject(signal.reason);signal.addEventListener('abort',abort,{once:true});})]:[])]));}
    finally{if(abort)signal.removeEventListener('abort',abort);}
  };
}
