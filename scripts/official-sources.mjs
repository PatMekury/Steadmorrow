import {load} from 'cheerio';
import {digest} from './evidence-client.mjs';
import {createPublicWebClient,webUrl,sourceFailure} from './public-web.mjs';
import {readPdf} from './pdf-reader.mjs';
import {municipalClient} from './planning-context.mjs';
import {matchesAuthority} from './jurisdiction.mjs';

export const directoryUrl='https://raw.githubusercontent.com/cisagov/dotgov-data/main/current-full.csv';
const tidy=s=>String(s??'').replace(/\s+/g,' ').trim();
const key=s=>tidy(s).toLowerCase().replace(/[^a-z0-9]/g,'');
function csv(text){
  const rows=[];let row=[],cell='',quoted=false;
  for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(!quoted&&(c===','||c==='\n')){row.push(cell.replace(/\r$/,''));cell='';if(c==='\n'){rows.push(row);row=[];}}else cell+=c;}
  if(cell||row.length){row.push(cell);rows.push(row);}return rows;
}
export function directoryMatches(text,locality){
  const normalize=s=>key(String(s).toLowerCase().replace(/\b(the|of|charter|township|town|village|borough|city|county|municipality|municipal|government)\b/g,'').replace(new RegExp(`,?\\s*${locality.state}$`,'i'),''));
  const authorities=[{base:locality.authority?.base||locality.city||locality.countyBase,type:locality.authority?.type==='county'?'County':'City',scope:'authority'},...(locality.authority?.type!=='county'?[{base:locality.countyBase,type:'County',scope:'county'}]:[])];
  return csv(text).slice(1).flatMap(row=>{
    const [domain,type,organization,suborganization,,state]=row;
    if(state!==locality.stateAbbr||!domain?.endsWith('.gov')||/police|court|sheriff|school|library|water|fire|election|attorney|hospital/i.test(domain+' '+organization+' '+suborganization))return [];
    if(type==='State'&&locality.state&&(key(organization)===key(locality.state)||key(organization)===key('State of '+locality.state)))return [{url:`https://${domain}/`,title:organization,scope:'state',proof:directoryUrl}];
    const a=authorities.find(a=>a.base&&a.type===type&&normalize(organization)===normalize(a.base));
    return a?[{url:`https://${domain}/`,title:organization,scope:a.scope,proof:directoryUrl}]:[];
  }).slice(0,6);
}
const topics=/planning|zoning|ordinance|municipal.code|development.code|land.use|parcel|assessor|cadastr|tax.map|\bgis\b|geographic|mapping|departments|equalization|community.development|chapter|article|residential|housing|district|permitted|setback|regulation/i;
const skip=/agenda|minutes|meeting|donor|counsel|prayer|membership|staff.directory|contact.us|login|sign.in|cart|calendar|news|events|employment|social.media|voter|election|commissioner|court|police|undefined/i;
const publishers=/^(?:library\.municode\.com|ecode360\.com|codelibrary\.amlegal\.com|www\.codepublishing\.com|codepublishing\.com)$/;
const gis=u=>/\/(?:MapServer|FeatureServer)(?:\/\d+)?\/?$/i.test(new URL(u).pathname);
const directory=u=>/\/rest\/services(?:\/[^.]+)?\/?$/i.test(new URL(u).pathname)&&!gis(u);
function cleanText(s){return tidy(s).replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g,'[contact omitted]').replace(/\b\(?\d{3}\)?[ .-]\d{3}[ .-]\d{4}\b/g,'[contact omitted]');}
export function documentSource({text,title,url,hash,retrievedAt,scope,publisher,proof,page,truncated=false}){
  const content=cleanText(text);if(content.length<100)return null;
  const legal=/ordinance|development code|municipal code|land use code|zoning (?:code|resolution)|\/codes?\//i.test(title+' '+url+' '+content.slice(0,600));
  const section=/\b(?:section|chapter|article)\s+[\dIVX]|§\s*\d/i.test(title+' '+content);
  const operative=/\b(shall|permitted|prohibited|minimum|maximum|required|must)\b/i.test(content);
  const uncertain=/\b(draft|proposed|repealed|superseded|comprehensive plan|general plan)\b/i.test(title+' '+content.slice(0,300));
  const toc=/table of contents/i.test(content.slice(0,400))&&!operative;
  if(toc)return null;
  const kind=scope==='authority'&&legal&&section&&operative&&!uncertain?'code-provision':'planning-guidance';
  return {id:`official-${digest(url+':'+(page??'html')).slice(0,20)}`,kind,title:page?`${title} · PDF page ${page}`:title,section:page?`PDF page ${page}`:null,url:page?url+`#page=${page}`:url,hash,retrievedAt,publisher,text:content.slice(0,16000),truncated:truncated||content.length>16000,authorityProof:proof,publication:'Publication currency and later amendments require confirmation.',scope};
}
export function createOfficialSession({locality,read,webRead=createPublicWebClient(),pdf=readPdf,signal}={}){
  const entries=new Map(),failures=[],visited=new Set(),outcomes=new Map(),reads=new Map();let discovered=false;
  const register=(url,title,scope,proof,depth=0)=>{
    try{url=webUrl(url);if(entries.size>=180)return null;const id=`web-${digest(url).slice(0,16)}`;if(!entries.has(id))entries.set(id,{url,title:tidy(title).slice(0,180),scope,proof,depth});return {source_id:id,...entries.get(id),read:visited.has(id)};}catch{return null;}
  };
  const choices=()=>[...entries].map(([source_id,e])=>({source_id,title:e.title,url:e.url,scope:e.scope,read:visited.has(source_id),outcome:outcomes.get(source_id)??'unread',priority:/ordinance|municipal.code|development.reg|land.use|zoning.code|chapter|article/i.test(e.title+' '+new URL(e.url).pathname)?100:/planning|zoning/i.test(e.title+' '+new URL(e.url).pathname)?80:e.scope==='authority'?40:10,format:gis(e.url)?'gis':/\.pdf(?:$|\?)/i.test(e.url)?'pdf':'web'}));
  const discover=async()=>{
    if(!discovered){discovered=true;
      try{const r=await webRead(directoryUrl,{ttl:86400000,signal});for(const e of directoryMatches(Buffer.from(r.data).toString('utf8'),locality))register(e.url,e.title,e.scope,[{url:e.proof,hash:r.hash,retrievedAt:r.retrievedAt}]);}catch(e){failures.push({url:directoryUrl,...sourceFailure(e)});}
      // A second, independent official website directory also covers non-.gov governments.
      try{const c=await municipalClient(read,locality);failures.push(...(c?.discoveryFailures??[]));if(c?.Website)register(/^https?:/i.test(c.Website)?c.Website.replace(/^http:/,'https:'):`https://${c.Website}`,c.ClientName,'authority',[{url:`https://library.municode.com/api/Clients/stateAbbr?stateAbbr=${locality.stateAbbr}`}]);}catch(e){failures.push(...(e.failures??[{url:'https://library.municode.com/',...sourceFailure(e)}]));}
    }
    return {sources:choices(),failures,note:'Choose an official source ID and follow its published navigation. Directory matches establish a publisher, not legal applicability. No matching directory entry does not prove no website exists.'};
  };
  const inspectPage=async(id,start=1)=>{
    const entry=entries.get(id);if(!entry)throw new Error('Choose an official source ID returned by discovery');visited.add(id);
    if(gis(entry.url))return {status:'gis-source',mapSource:entry};
    try{
      const original=new URL(entry.url),itemId=['webmap','id','appid'].map(k=>original.searchParams.get(k)).find(v=>/^[a-f0-9]{32}$/i.test(v??''));
      if(itemId&&/\barcgis\.com$/.test(original.hostname)){
        const data=await read(`https://www.arcgis.com/sharing/rest/content/items/${itemId}/data?f=json`,{signal});const links=[];
        const walk=(v,depth=0)=>{if(!v||typeof v!=='object'||depth>12)return;if(typeof v.url==='string'&&gis(v.url)){const e=register(v.url,v.title||v.name||entry.title,entry.scope,[...entry.proof,{url:data.url,hash:data.hash}],entry.depth+1);if(e)links.push(e);}for(const child of Object.values(v))if(typeof child==='object')walk(child,depth+1);};walk(data.data);
        return {status:'navigation',sources:[],links,note:'These services were linked by the authority’s map. Inspect a relevant service, then query its recorded geometry.'};
      }
      if(directory(entry.url)){
        const target=new URL(entry.url);target.searchParams.set('f','json');const r=await webRead(target.href,{signal}),data=JSON.parse(Buffer.from(r.data).toString('utf8')),links=[];
        const root=target.href.split('/rest/services')[0]+'/rest/services';
        for(const s of (data.services??[]).filter(s=>['MapServer','FeatureServer'].includes(s.type)).slice(0,100)){const e=register(`${root}/${s.name}/${s.type}`,s.name,entry.scope,[...entry.proof,{url:r.url,hash:r.hash}],entry.depth+1);if(e)links.push(e);}
        for(const folder of (data.folders??[]).filter(f=>topics.test(f)).slice(0,12)){const e=register(`${root}/${encodeURIComponent(folder)}`,folder,entry.scope,entry.proof,entry.depth+1);if(e)links.push(e);}
        return {status:'navigation',sources:[],links,note:'Choose the parcel or zoning service; a service catalogue alone is not a record.'};
      }
      const response=await webRead(entry.url,{signal,maxBytes:/pdf/i.test(entry.title+' '+entry.url)?16_000_000:6_000_000}),buffer=Buffer.from(response.data);
      const proof=[...entry.proof,...(response.redirects??[]).map(r=>({url:r.from,redirectTo:r.to,status:r.status})),{url:response.url,hash:response.hash,retrievedAt:response.retrievedAt}],base={url:response.url,hash:response.hash,retrievedAt:response.retrievedAt,scope:entry.scope,publisher:entry.scope==='state'?locality.state:locality.label,proof};
      if(buffer.subarray(0,5).toString()==='%PDF-'){
        const result=await pdf(buffer,start,{signal});
        const sources=result.pages.map(p=>documentSource({...base,title:entry.title,text:p.text,page:p.page,truncated:p.truncated})).filter(Boolean);
        const unreadable=result.pages.every(p=>tidy(p.text).length<50);
        return {status:sources.length?'retrieved':unreadable?'unreadable-document':'navigation',url:response.url,sources,pageIndex:result.pages.filter(p=>!sources.some(s=>s.url.endsWith(`#page=${p.page}`))).map(p=>({page:p.page,discoveryText:cleanText(p.text).slice(0,3000)})),pageCount:result.pageCount,pagesRead:result.pages.map(p=>p.page),nextPage:start+4<=result.pageCount?start+4:null,note:'Page numbers refer to PDF file pages. Only these pages were read. Page-index text is discovery, not cited evidence. Tables may lose layout; inspect original headings/footnotes. Scanned pages require a readable official copy; do not infer their content.'};
      }
      if(!/html|text\//i.test(response.contentType??'')&&!buffer.toString('utf8',0,300).includes('<'))return {status:'unsupported-format',sources:[],note:'Choose a readable HTML or PDF publication.'};
      const $=load(buffer.toString('utf8')),links=[];let count=0,linkBase=response.url;
      for(const [aliasId,e] of entries)if(e.url===response.url)visited.add(aliasId);
      try{const b=new URL($('base[href]').first().attr('href')||response.url,response.url),host=new URL(response.url).hostname.split('.').slice(-2).join('.');if(b.hostname===host||b.hostname.endsWith('.'+host))linkBase=webUrl(b.href);}catch{}
      $('a[href],iframe[src]').each((_,node)=>{
        if(count>=1000)return;count++;const label=tidy($(node).text()||$(node).attr('title')),href=$(node).attr('href')||$(node).attr('src');let target;
        try{target=webUrl(new URL(href,linkBase).href.replace(/^http:/,'https:'));}catch{return;}
        const u=new URL(target),origin=new URL(response.url);const authorityLink=entry.scope==='county'&&(matchesAuthority(label,locality)||key(label)===key(locality.authority?.base));const pathHint=u.pathname.replace(/departments(?:_and_officials)?/gi,'');const matching=authorityLink||topics.test(label+' '+pathHint)||/^departments$/i.test(label)||gis(target)||directory(target);
        if(!matching||/^skip to/i.test(label)||skip.test(label+' '+u.pathname)||/\.(zip|docx?|xlsx?|png|jpe?g|mp4)$/i.test(u.pathname))return;
        const baseHost=origin.hostname.split('.').slice(-2).join('.');
        const same=u.hostname===origin.hostname||u.hostname.endsWith('.'+origin.hostname.replace(/^www\./,''))||(!/civicplus|arcgis|revize|google|amazonaws/.test(baseHost)&&(u.hostname===baseHost||u.hostname.endsWith('.'+baseHost)));
        // Cross-host links must be an explicitly named official code, GIS or PDF publication.
        if(!same&&!authorityLink&&!publishers.test(u.hostname)&&!gis(target)&&!directory(target)&&!(/\barcgis\.com$/.test(u.hostname)&&/map|gis|parcel|zoning/i.test(label))&&!(/\.pdf$/i.test(u.pathname)&&/zoning|ordinance|code|land.use/i.test(label)))return;
        if(entry.depth>=5)return;
        const item=register(target,label||u.pathname,authorityLink?'authority':entry.scope,proof,authorityLink?0:entry.depth+1);if(item)links.push(item);
      });
      $('script,style,noscript,iframe,nav,header,footer,form,button,aside').remove();
      $('tr').each((_,tr)=>{$(tr).replaceWith($('<p>').text($(tr).find('th,td').map((_,td)=>tidy($(td).text())).get().join(' | ')));});
      const main=$('main').first().length?$('main').first():$('article').first().length?$('article').first():$('body');
      const title=tidy($('h1').first().text()||$('title').text()||entry.title);
      main.find('h1,h2,h3,h4,p,div,li,section').append(' ');const text=main.text();
      const relevant=/planning|zoning|ordinance|housing|land.use|regulation|development.code/i.test(title)&&!skip.test(title);
      const source=relevant?documentSource({...base,title,text}):null;
      const unique=[...new Map(links.map(l=>[l.source_id,l])).values()];unique.sort((a,b)=>Number(/zoning|ordinance|land.use|development.reg|chapter/i.test(b.title))-Number(/zoning|ordinance|land.use|development.reg|chapter/i.test(a.title)));
      return {status:source?'retrieved':unique.length?'navigation':'irrelevant',sources:source?[source]:[],links:unique.slice(0,50).map(({proof,...l})=>l),truncated:unique.length>50,note:'Follow original code links for operative provisions. A guidance page or table of contents is not permission to build. Publication currency remains unverified.'};
    }catch(e){const failure={url:entry.url,...sourceFailure(e)};failures.push(failure);return {...failure,sources:[],alternatives:choices().filter(e=>!e.read).slice(0,12)};}
  };
  const inspect=async(id,start=1)=>{
    const key=id+':'+start;if(reads.has(key))return {...structuredClone(await reads.get(key)),reused:true,note:'This source/page has already been attempted in this investigation. Choose another relevant unread source or a different unread PDF page.'};
    const task=inspectPage(id,start).then(r=>{
      const outcome=r.sources?.some(s=>s.kind==='code-provision')?'operative':r.sources?.length?'guidance':r.status==='navigation'?'navigation-only':r.status;
      outcomes.set(id,outcome);return {...r,outcome};
    });reads.set(key,task);return structuredClone(await task);
  };
  const frontier=()=>choices().filter(e=>!e.read&&e.priority>=40).sort((a,b)=>b.priority-a.priority).slice(0,12);
  const progress=()=>({attempted:outcomes.size,operative:[...outcomes.values()].filter(v=>v==='operative').length,outcomes:choices().filter(e=>e.read).map(({source_id,url,outcome})=>({source_id,url,outcome})),remaining:frontier()});
  return {discover,inspect,choices,frontier,progress,has:id=>entries.has(id),entry:id=>entries.get(id),failures,renewSignal:next=>{signal=next;}};
}
