import {transcribeTables} from './table-text.mjs';
import {load} from 'cheerio';
import {digest} from './evidence-client.mjs';
import {publishedCodeConnections,connectionMatches} from './source-providers.mjs';
const clean=s=>String(s??'').replace(/\s+/g,' ').trim();
// Only links discovered within a verified authority's code publication enter
// this catalogue. Gloo selects page IDs; it cannot supply a fetch URL.
export function createPublishedCodeSession(read,locality){
 const roots=publishedCodeConnections.filter(c=>connectionMatches(c,locality)),pages=new Map(),visited=new Set();let blocked=false;
 const register=(target,title,connection)=>{const u=new URL(target);if(u.origin!==new URL(connection.root).origin||u.search||/\.(pdf|zip|png|jpg)$/i.test(u.pathname))return null;if(!/^#\d{2,3}-\d+[a-z]?$/.test(u.hash))u.hash='';const id='page-'+digest(u.href).slice(0,16);if(pages.has(id)&&pages.get(id).title.length>clean(title).length)title=pages.get(id).title;pages.set(id,{url:u.href,title:clean(title),connection});return describe(id,pages.get(id));};
 const describe=(id,p)=>({section_id:id,title:p.title,context:[...pages.values()].filter(q=>q.url!==p.url&&!new URL(q.url).hash&&(p.url.startsWith(q.url.replace(/\/$/,'')+'/')||p.url.startsWith(q.url.replace(/\/$/,'')+'#'))).sort((a,b)=>a.url.length-b.url.length).slice(-2).map(q=>q.title).join(' > ').slice(0,240),url:p.url,publisher:p.connection.publisher});
 for(const c of roots)register(c.root,c.publisher,c);
 const parse=async id=>{
  const entry=pages.get(id);if(!entry)throw new Error('Choose a published page ID returned by code search');
  let response;try{response=await read(entry.url,{format:'text',maxBytes:4000000});}catch(error){blocked=true;return {status:'source-unavailable',url:entry.url,message:error.message,sections:[],sources:[]};}
  visited.add(id);const $=load(response.data),links=new Map();
  const main=$('main').length?$('main'):$('body');
  const contentLinks=main.find('a[href]').filter((_,a)=>{try{return /^\/(?:article-|appendix)/.test(new URL($(a).attr('href'),entry.url).pathname);}catch{return false;}});
  (contentLinks.length?contentLinks:$('a[href]')).each((_,a)=>{try{const target=new URL($(a).attr('href'),entry.url),title=clean($(a).text());if(title.length<3||!/^\/(?:article-|appendix)/.test(target.pathname))return;const context=clean($(a).closest('.section-title,.chapter-title,.article-title,li').text());const found=register(target.href,context.length>title.length&&context.length<240?context:title,entry.connection);if(found&&found.section_id!==id)links.set(found.section_id,found);}catch{}});
  // The publication distinguishes section nodes from article/chapter navigation.
  // Read only the selected section's own body, never the sidebar or a whole TOC.
  const selectedNumber=new URL(entry.url).hash.slice(1)||new URL(entry.url).pathname.match(/\/(\d{2,3}-\d+[a-z]?)\/?$/)?.[1];
  const node=main.find('article.node--type-section').filter((_,n)=>selectedNumber&&clean($(n).find('.field--name-title').first().text())===selectedNumber).first();
  const body=node.find('.field--name-body').first().clone();body.find('script,style,nav,button').remove();
  const bodyLinks=body.find('a[href]').toArray().map(a=>new URL($(a).attr('href'),entry.url).href);
  const tableDistricts=transcribeTables($,body);
  const text=clean(body.text()),title=clean(node.find('.section-title').first().text())||entry.title;
  const source=text.length>=50?{id:'code-'+digest(entry.url).slice(0,16),kind:'code-provision',tableDistricts,title,section:title,publisher:entry.connection.publisher,url:entry.url,queryUrl:response.url,retrievedAt:response.retrievedAt,hash:response.hash,text:text.slice(0,14000),truncated:text.length>14000,authority:entry.connection.authority,publication:node.find('time[datetime]').first().attr('datetime')?'Last amended '+node.find('time[datetime]').first().attr('datetime').slice(0,10):undefined}:null;
  const headings=[];if(!selectedNumber)main.find('article.node--type-section').each((_,n)=>{const title=clean($(n).find('.section-title').first().text()),href=$(n).find('.section-title a[href]').first().attr('href');if(href&&title){const found=register(new URL(href,entry.url).href,title,entry.connection);if(found)headings.push(found);}});
  const localLinks=[...links.values()].filter(l=>l.url.startsWith(entry.url.split('#')[0]+'/')||l.url.startsWith(entry.url.split('#')[0]+'#'));
  const choices=source?[...links.values()].filter(l=>bodyLinks.includes(l.url)):(headings.length?headings:localLinks.length?localLinks:[...links.values()]);
  return {status:source?'retrieved':'navigation',sections:choices.sort((a,b)=>Number(b.url.startsWith(entry.url.split('#')[0]))-Number(a.url.startsWith(entry.url.split('#')[0]))).slice(0,70),navigationTruncated:choices.length>70,sources:source?[source]:[],note:source?'Original section text; check linked conditions and exceptions.':'This page is navigation, not a retrieved legal provision. Choose an original section to read.'};
 };
 const search=async query=>{
  if(!roots.length)return {status:'unavailable',sections:[],note:'No additional verified code publication is connected for this authority.'};
  const terms=clean(query).toLowerCase().split(/[^a-z0-9]+/).filter(t=>t.length>2).map(t=>t.replace(/^residential$/,'residen')),score=p=>terms.reduce((s,t)=>s+(p.title.toLowerCase().includes(t)?1:0),0);
  const failures=[];
  // Establish the publication's actual district/chapter hierarchy before
  // presenting full-text hits. A mention of a district in an exception is
  // not necessarily that district's operative housing-use section.
  for(const [id,p] of [...pages])if(roots.some(c=>c.root===p.url)&&!visited.has(id)){
    const root=await parse(id);if(root.status==='source-unavailable')failures.push({url:p.url,message:root.message});
  }
  const navigation=()=>[...pages].filter(([,p])=>!new URL(p.url).hash&&/^\/article-[^/]+\/?$/.test(new URL(p.url).pathname)).map(([id,p])=>describe(id,p));
  const hits=[];
  for(const connection of roots.filter(c=>c.searchPath)){
   const target=new URL(connection.searchPath,connection.root);target.searchParams.set(connection.searchParameter,query);
   try{
    const response=await read(target.href,{format:'text',maxBytes:4000000}),$=load(response.data);
    $('.view-online-zr-search .view-content .views-row').slice(0,20).each((_,row)=>{
     const link=$(row).find('.views-field-title a[href]').first(),href=link.attr('href');if(!href)return;
     const title=clean($(row).find('.views-field-title,.views-field-field-section-title').text());
     const entry=register(new URL(href,target).href,title,connection);
     if(entry)hits.push({...entry,excerpt:clean($(row).find('.views-field-search-api-excerpt').text()).slice(0,450)});
    });
   }catch(error){failures.push({url:target.href,message:error.message});}
  }
  if(hits.length){
   const group=clean(query).match(/use group ([a-z0-9]+)\b/i)?.[1]?.toLowerCase();
   const lookingForHousing=/dwelling|residen|housing/i.test(query),lookingForControls=/bulk|floor|height|setback|special|historic|landmark|parking/i.test(query);
   const relevant=hits.filter(h=>{
    if(group&&/use group /i.test(h.title)&&h.title.match(/use group ([a-z0-9]+)\b/i)?.[1]?.toLowerCase()!==group)return false;
    return !lookingForHousing||lookingForControls||/residen|dwelling|housing|use allowance|permitted use|uses permitted|allowed use/i.test(h.title);
   });
   return {sections:relevant,navigation:navigation(),incidentalMentionsOmitted:hits.length-relevant.length,failures,note:'Search results are mentions, not necessarily the governing use table. Results whose headings concern unrelated use groups or incidental topics are omitted from a housing-use search. If no operative heading is returned, use publication navigation: open the appropriate district article, then its use-allowance chapter. The table may cover the parent district family rather than a numeric subtype. Read original sections and conditions.'};
  }
  // Expand a bounded number of navigation pages in response to the agent's
  // chosen query; section text is not accepted until Gloo requests that ID.
  for(let n=0;n<3;n++){
   const candidates=[...pages].filter(([id,p])=>!visited.has(id)&&!/\/\d{2,3}-\d+\/?$/.test(new URL(p.url).pathname)).sort((a,b)=>score(b[1])-score(a[1]));
   const next=candidates[0];if(!next)break;const result=await parse(next[0]);if(result.status==='source-unavailable'){failures.push({url:next[1].url,message:result.message});break;}
  }
  const choices=[...pages].sort((a,b)=>score(b[1])-score(a[1])).filter(([id,p])=>score(p)>0||!visited.has(id)).slice(0,35).map(([id,p])=>describe(id,p));
  return {sections:choices,failures,note:'Select a relevant original section. Article and chapter pages are navigation; they return further section IDs. Source access failures do not establish absence.'};
 };
 return {search,read:parse,has:id=>pages.has(id),ids:()=>[...pages.keys()],needsRead:()=>!blocked&&[...pages.keys()].some(id=>!visited.has(id))};
}
