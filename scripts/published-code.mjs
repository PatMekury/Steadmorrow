import {load} from 'cheerio';
import {digest} from './evidence-client.mjs';
import {publishedCodeConnections,connectionMatches} from './source-providers.mjs';
const clean=s=>String(s??'').replace(/\s+/g,' ').trim();
// Only links discovered within a verified authority's code publication enter
// this catalogue. Gloo selects page IDs; it cannot supply a fetch URL.
export function createPublishedCodeSession(read,locality){
 const roots=publishedCodeConnections.filter(c=>connectionMatches(c,locality)),pages=new Map(),visited=new Set();let blocked=false;
 const register=(target,title,connection)=>{const u=new URL(target);if(u.origin!==new URL(connection.root).origin||u.search||/\.(pdf|zip|png|jpg)$/i.test(u.pathname))return null;u.hash='';const id='page-'+digest(u.href).slice(0,16);if(pages.has(id)&&pages.get(id).title.length>clean(title).length)title=pages.get(id).title;pages.set(id,{url:u.href,title:clean(title),connection});return {section_id:id,title:clean(title),url:u.href,publisher:connection.publisher};};
 for(const c of roots)register(c.root,c.publisher,c);
 const parse=async id=>{
  const entry=pages.get(id);if(!entry)throw new Error('Choose a published page ID returned by code search');
  let response;try{response=await read(entry.url,{format:'text',maxBytes:4000000});}catch(error){blocked=true;return {status:'source-unavailable',url:entry.url,message:error.message,sections:[],sources:[]};}
  visited.add(id);const $=load(response.data),links=new Map();
  const main=$('main').length?$('main'):$('body');
  const contentLinks=main.find('a[href]').filter((_,a)=>{try{return /^\/(?:article-|appendix)/.test(new URL($(a).attr('href'),entry.url).pathname);}catch{return false;}});
  (contentLinks.length?contentLinks:$('a[href]')).each((_,a)=>{try{const target=new URL($(a).attr('href'),entry.url),title=clean($(a).text());if(title.length<3||!/^\/(?:article-|appendix)/.test(target.pathname))return;const found=register(target.href,title,entry.connection);if(found&&found.section_id!==id)links.set(found.section_id,found);}catch{}});
  // The publication distinguishes section nodes from article/chapter navigation.
  // Read only the selected section's own body, never the sidebar or a whole TOC.
  const node=main.find('article.node--type-section.node--view-mode-full').first();
  const body=node.find('.field--name-body').first().clone();body.find('script,style,nav,button').remove();
  body.find('tr').each((_,row)=>{$(row).replaceWith($('<p>').text($(row).find('th,td').map((_,c)=>clean($(c).text())).get().join(' | ')));});
  const text=clean(body.text()),title=clean(node.find('.field--name-title').first().text())||entry.title;
  const source=text.length>=50?{id:'code-'+digest(entry.url).slice(0,16),kind:'code-provision',title,section:title,publisher:entry.connection.publisher,url:entry.url,queryUrl:response.url,retrievedAt:response.retrievedAt,hash:response.hash,text:text.slice(0,14000),truncated:text.length>14000,authority:entry.connection.authority}:null;
  return {status:source?'retrieved':'navigation',sections:[...links.values()].sort((a,b)=>Number(b.url.startsWith(entry.url+'/'))-Number(a.url.startsWith(entry.url+'/'))).slice(0,100),sources:source?[source]:[],note:source?'Original section text; check linked conditions and exceptions.':'This page is navigation, not a retrieved legal provision. Choose an original section to read.'};
 };
 const search=async query=>{
  if(!roots.length)return {status:'unavailable',sections:[],note:'No additional verified code publication is connected for this authority.'};
  const terms=clean(query).toLowerCase().split(/[^a-z0-9]+/).filter(t=>t.length>2).map(t=>t.replace(/^residential$/,'residen')),score=p=>terms.reduce((s,t)=>s+(p.title.toLowerCase().includes(t)?1:0),0);
  const failures=[];
  // Expand a bounded number of navigation pages in response to the agent's
  // chosen query; section text is not accepted until Gloo requests that ID.
  for(let n=0;n<3;n++){
   const candidates=[...pages].filter(([id,p])=>!visited.has(id)&&!/\/\d{2,3}-\d+\/?$/.test(new URL(p.url).pathname)).sort((a,b)=>score(b[1])-score(a[1]));
   const next=candidates[0];if(!next)break;const result=await parse(next[0]);if(result.status==='source-unavailable'){failures.push({url:next[1].url,message:result.message});break;}
  }
  const choices=[...pages].sort((a,b)=>score(b[1])-score(a[1])).filter(([id,p])=>score(p)>0||!visited.has(id)).slice(0,35).map(([section_id,p])=>({section_id,title:p.title,url:p.url,publisher:p.connection.publisher}));
  return {sections:choices,failures,note:'Select a relevant original section. Article and chapter pages are navigation; they return further section IDs. Source access failures do not establish absence.'};
 };
 return {search,read:parse,has:id=>pages.has(id),ids:()=>[...pages.keys()],needsRead:()=>!blocked&&[...pages.keys()].some(id=>!visited.has(id))};
}
