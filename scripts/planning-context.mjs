import {explicitNoZoning} from './regulatory-path.mjs';
import {load} from 'cheerio';
import {matchesAuthority} from './jurisdiction.mjs';
import {isSourceUrl} from './evidence-client.mjs';
import {sourceFailure} from './public-web.mjs';

const clientCache=new WeakMap();
export async function municipalClient(read,locality){
  if(!locality.stateAbbr||locality.boundaryUncertain||locality.authorityUnresolved)return null;
  let cache=clientCache.get(read);if(!cache)clientCache.set(read,cache=new Map());
  const key=JSON.stringify([locality.stateAbbr,locality.authority,locality.city,locality.county]);
  const prior=cache.get(key);if(prior&&Date.now()-prior.at<(prior.success?3600000:60000))return prior.promise;
  const promise=(async()=>{
    const failures=[];const directory=`https://library.municode.com/api/Clients/stateAbbr?stateAbbr=${encodeURIComponent(locality.stateAbbr)}`;
    try{
      const response=await read(directory,{ttl:86400000});
      const matches=(Array.isArray(response.data)?response.data:[]).filter(c=>matchesAuthority(c.ClientName,locality)&&c.State?.StateAbbreviation===locality.stateAbbr);
      if(matches.length===1)return {...matches[0],discoveryFailures:failures};
      return null;
    }catch(e){failures.push({url:directory,...sourceFailure(e)});}
    // The publisher's own organization resolver is independent of its statewide
    // list. The response must match the same authority AND state; never accept a
    // similarly named county/town or infer identity merely from a URL slug.
    const names=[...new Set([locality.authority?.name,locality.authority?.base,locality.city||locality.county].filter(Boolean))].slice(0,2).reverse();
    for(const name of names){
      const slug=encodeURIComponent(name.toLowerCase().replaceAll(' ','_'));
      const target=`https://library.municode.com/localapi/Organizations/GetByUrlEncodedNames/${locality.stateAbbr.toLowerCase()}/${slug}`;
      try{const r=await read(target,{ttl:86400000});const c=r.data;
        if(c?.ClientID&&matchesAuthority(c.ClientName,locality)&&c.State?.StateAbbreviation===locality.stateAbbr)return {...c,discoveryFailures:failures,authorityProof:{url:r.url,hash:r.hash,retrievedAt:r.retrievedAt}};
      }catch(e){failures.push({url:target,...sourceFailure(e)});}
    }
    if(failures.length)throw Object.assign(new Error('The publisher authority lookup could not be completed'),{failures});
    return null;
  })();const record={at:Date.now(),promise,success:false};cache.set(key,record);promise.then(c=>{record.success=Boolean(c);},()=>{});return promise;
}
const unknown=()=>({type:'unresolved',codeLinks:[],sources:[],failures:[]});
function links(html,base){
  const $=load(html);return $('a[href]').map((_,a)=>{try{const url=new URL($(a).attr('href'),base);url.hash='';if(url.protocol==='http:')url.protocol='https:';return {url:url.href,label:$(a).text().replace(/\s+/g,' ').trim()};}catch{return null;}}).get().filter(Boolean);
}
// Follow published navigation from the exact municipality's official website.
// No invented /planning paths, inferred "no zoning", or city-name branches.
export async function planningContext(read,locality,{webRead,discoverRoots}={}){
  const result=unknown();let client;
  try{client=await municipalClient(read,locality);result.failures.push(...(client?.discoveryFailures??[]));}catch(e){result.failures.push(...(e.failures??[{url:'https://library.municode.com/',...sourceFailure(e)}]));}
  const roots=client?.Website?[{url:/^https?:/i.test(client.Website)?client.Website:`https://${client.Website}`}]:((await discoverRoots?.())?.sources??[]).filter(s=>s.scope==='authority');
  if(!roots.length)return result;
  let root;try{root=new URL(roots[0].url);root.protocol='https:';}catch{return result;}
  if(!webRead&&!isSourceUrl(root.href))return result;
  const hosts=new Set(roots.map(r=>new URL(r.url).hostname.replace(/^www\./,'')));
  const sameAuthority=url=>{const h=new URL(url).hostname.replace(/^www\./,'');return [...hosts].some(host=>h===host||h.endsWith('.'+host));};
  const queue=roots.map(r=>({url:r.url.replace(/^http:/,'https:'),depth:0,score:100})),visited=new Set(),codeLinks=new Map();
  for(let count=0;queue.length&&count<12;count++){
    queue.sort((a,b)=>b.score-a.score||a.depth-b.depth);
    const item=queue.shift();if(visited.has(item.url)){count--;continue;}visited.add(item.url);
    let page;try{page=webRead?await webRead(item.url,{maxBytes:1_500_000}):await read(item.url,{format:'text',maxBytes:1_500_000});if(webRead)page={...page,data:Buffer.from(page.data).toString('utf8')};}catch(e){result.failures.push({url:item.url,...sourceFailure(e)});continue;}
    if(page.url)hosts.add(new URL(page.url).hostname.replace(/^www\./,''));
    const $=load(page.data);$('script,style,noscript,iframe,nav,header,footer,form,button').remove();
    const content=($('main').length?$('main').text():$('body').text()).replace(/\s+/g,' ').trim();
    const statement=explicitNoZoning(content,locality);const match=statement?Object.assign([statement],{index:content.indexOf(statement)}):null;
    if(match){
      result.type='no-zoning';
      const start=Math.max(0,match.index-200),end=Math.min(content.length,match.index+2200);
      result.sources=[{id:'planning-system',kind:'planning-guidance',title:$('title').text().trim()||'Published development regulations',publisher:client?.ClientName||locality.label,url:page.url,retrievedAt:page.retrievedAt,hash:page.hash,authorityProof:[...(client?.authorityProof?[client.authorityProof]:[]),...(page.redirects??[]).map(r=>({url:r.from,redirectTo:r.to})),{url:page.url,hash:page.hash}],text:content.slice(start,end),statement:match[0]}];
    }
    for(const link of links(page.data,page.url||item.url)){
      const url=new URL(link.url),text=link.label+' '+url.pathname;
      if(url.hostname==='library.municode.com'&&url.searchParams.has('nodeId')&&/development|subdivision|platting|parking|floodplain|landscape|setback|land use|zoning/i.test(text))codeLinks.set(link.url,{...link,score:/development|subdivision|platting|land use/i.test(text)?3:/parking|floodplain/i.test(text)?2:1});
      if(item.depth>=3||!sameAuthority(link.url)||visited.has(link.url)||/\.(pdf|jpg|png|zip|docx?)$/i.test(url.pathname)||url.search||! /planning|development.?reg|developregs|land.?use|zoning|departments|ordinance|city.?codes/i.test(text))continue;
      const score=/development.?reg|developregs|land.?use|zoning/i.test(text)?30:/planning/i.test(text)?20:10;
      if(!queue.some(p=>p.url===link.url))queue.push({...link,depth:item.depth+1,score});
    }
    if(result.type==='no-zoning'&&codeLinks.size)break;
  }
  result.codeLinks=[...codeLinks.values()].sort((a,b)=>b.score-a.score).slice(0,4);
  return result;
}
