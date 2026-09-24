import {load} from 'cheerio';
import {matchesAuthority} from './jurisdiction.mjs';
import {isSourceUrl} from './evidence-client.mjs';

const canonical=s=>String(s??'').toLowerCase().replace(/[^a-z0-9]/g,'');
export async function municipalClient(read,locality){
  if(!locality.stateAbbr||locality.boundaryUncertain||locality.authorityUnresolved)return null;
  const response=await read(`https://library.municode.com/api/Clients/stateAbbr?stateAbbr=${encodeURIComponent(locality.stateAbbr)}`,{ttl:86400000});
  const matches=(Array.isArray(response.data)?response.data:[]).filter(c=>matchesAuthority(c.ClientName,locality)&&c.State?.StateAbbreviation===locality.stateAbbr);
  return matches.length===1?matches[0]:null;
}
const unknown=()=>({type:'unresolved',codeLinks:[],sources:[]});
function links(html,base){
  const $=load(html);return $('a[href]').map((_,a)=>{try{const url=new URL($(a).attr('href'),base);url.hash='';if(url.protocol==='http:')url.protocol='https:';return {url:url.href,label:$(a).text().replace(/\s+/g,' ').trim()};}catch{return null;}}).get().filter(Boolean);
}
// Follow published navigation from the exact municipality's official website.
// No invented /planning paths, inferred "no zoning", or city-name branches.
export async function planningContext(read,locality){
  const result=unknown();let client;
  try{client=await municipalClient(read,locality);}catch{return result;}
  if(!client?.Website)return result;
  let root;try{root=new URL(/^https?:/i.test(client.Website)?client.Website:`https://${client.Website}`);root.protocol='https:';}catch{return result;}
  if(!isSourceUrl(root.href)||!root.hostname.endsWith('.gov'))return result;
  const host=root.hostname.replace(/^www\./,'');
  const sameAuthority=url=>{const h=new URL(url).hostname.replace(/^www\./,'');return h===host||h.endsWith('.'+host);};
  const queue=[{url:root.href,depth:0,score:100}],visited=new Set(),codeLinks=new Map();
  const name=String(locality.authority?.base||locality.city||locality.county).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const noZoning=new RegExp(`\\b(?:(?:city|town|county|municipality)\\s+(?:of\\s+)?)?${name}\\s+(?:does\\s+not\\s+have|has\\s+no|does\\s+not\\s+use)\\s+(?:a\\s+)?(?:traditional\\s+|conventional\\s+)?zoning\\b`,'i');
  for(let count=0;queue.length&&count<12;count++){
    queue.sort((a,b)=>b.score-a.score||a.depth-b.depth);
    const item=queue.shift();if(visited.has(item.url)){count--;continue;}visited.add(item.url);
    let page;try{page=await read(item.url,{format:'text',maxBytes:1_500_000});}catch{continue;}
    const $=load(page.data);$('script,style,noscript,iframe,nav,header,footer,form,button').remove();
    const content=($('main').length?$('main').text():$('body').text()).replace(/\s+/g,' ').trim();
    const match=content.match(noZoning);
    if(match){
      result.type='no-zoning';
      const start=Math.max(0,match.index-200),end=Math.min(content.length,match.index+2200);
      result.sources=[{id:'planning-system',kind:'planning-guidance',title:$('title').text().trim()||'Published development regulations',publisher:client.ClientName,url:page.url,retrievedAt:page.retrievedAt,hash:page.hash,text:content.slice(start,end),statement:match[0]}];
    }
    for(const link of links(page.data,item.url)){
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
