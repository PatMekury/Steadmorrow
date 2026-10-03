import {surroundingSummary,homeSizeDescription} from './pastor-copy.js';
import {normalizeHousingOptions} from './findings-session.js';
import {hasPrivateInput,privacyMessage} from './input-privacy.js';
import {createSiteScene,canDrawHousing} from './site-scene.js';
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const number=n=>new Intl.NumberFormat(undefined,{maximumFractionDigits:1}).format(n);
const button=(label,action,cls='scene-button')=>{const b=el('button',label,cls);b.type='button';b.addEventListener('click',action);return b;};
const conceptSummary=c=>c.metrics.homes<c.metrics.requestedHomes?`This arrangement placed ${c.metrics.homes} of the ${c.metrics.requestedHomes} homes it tested. Other arrangements have not been ruled out.`:'The drawn homes fit the tested arrangement. Permission, access and affordable delivery still need review.';
const heightExplanation='Buildings use available map heights. Where available, Overture adds heights from lidar or machine-learning datasets. Other surroundings use recorded storeys with an assumed floor height, or an illustrative height when neither is available. Select a building to see its source. Approximate heights do not establish shadows, overlooking or building permission.';
export function buildingHeightDescription(building){
  const displayed=Number.isFinite(building.displayHeightMeters)?`${number(building.displayHeightMeters)} m`:'an illustrative height';
  if(building.heightBasis==='levels')return `Its recorded storey count is shown at an approximate height of ${displayed}. The floor height is assumed.`;
  if(building.heightBasis==='unknown')return `No height or storey count was available. It is shown at ${displayed} to provide context, not as a measured building height.`;
  if(building.heightBasis==='overture'&&Number.isFinite(building.heightMeters)){
    const sources=(building.heightSources??[]).filter(s=>s&&typeof s==='object'&&(!s.property||/height/.test(s.property)));
    const names=[...new Set(sources.map(s=>s.dataset||s.provider).filter(Boolean))];
    const machine=sources.some(s=>/ml_|machine|\bML\b/i.test(`${s.resource??''} ${s.dataset??''}`));
    const lidar=sources.some(s=>/lidar/i.test(`${s.resource??''} ${s.dataset??''}`));
    return `Shown at ${number(building.heightMeters)} m${names.length?' from '+names.join(' and '):''}, supplied through Overture.${machine?' This is a machine-learning height estimate.':lidar?' This height comes from lidar data.':' The source does not identify how the height was measured.'}`;
  }
  return Number.isFinite(building.heightMeters)?`Its mapped height is ${number(building.heightMeters)} m.`:'Its height has not been established.';
}
// Keep targets readable without moving their true geographic anchor.
export function arrangeSceneMarkers(items,width,height){
  const size=44,padding=12,bottom=82,placed=[];
  for(const item of items){
    const candidates=[];
    for(const radius of [24,66,108,150])for(const angle of [-Math.PI/4,-3*Math.PI/4,Math.PI/4,3*Math.PI/4,0,Math.PI,-Math.PI/2,Math.PI/2]){
      const x=Math.max(padding,Math.min(width-size-padding,item.x+Math.cos(angle)*radius-size/2));
      const y=Math.max(padding,Math.min(height-size-bottom,item.y+Math.sin(angle)*radius-size/2));
      const collisions=placed.filter(p=>x<p.x+size+8&&x+size+8>p.x&&y<p.y+size+8&&y+size+8>p.y).length;
      candidates.push({x,y,score:collisions*100000+(x+size/2-item.x)**2+(y+size/2-item.y)**2});
    }
    candidates.sort((a,b)=>a.score-b.score);placed.push({...item,...candidates[0]});
  }
  return placed;
}
export function uniquePriorities(items){
  const groups=new Map();
  const score=item=>item.answer?.measurement||Number.isFinite(item.answer?.distanceMeters)?4:item.answer?.status==='answered'?3:item.answer?2:1;
  const merge=(a,b)=>score(b)>score(a)?{...a,...b}:{...b,...a};
  for(const item of items){
    const key=(item.originalExcerpt||item.label||'').trim().toLowerCase().replace(/\s+/g,' '),target=item.target||'';
    if(!groups.has(key))groups.set(key,new Map());
    const group=groups.get(key),previous=group.get(target);group.set(target,previous?merge(previous,item):item);
  }
  for(const group of groups.values()){
    const unspecified=group.get(''),targets=[...group.keys()].filter(Boolean);
    if(unspecified&&targets.length===1){const target=targets[0];group.set(target,{...merge(unspecified,group.get(target)),target});group.delete('');}
  }
  return [...groups.values()].flatMap(group=>[...group.values()]);
}
// The current result owns context. A saved scenario must not hide later height
// enrichment or restore geometry that would let an obsolete proposal reappear.
export function sceneContext(result,scenario){return result?.siteContext??scenario?.siteContext;}
export function usesOvertureContext(context){return Boolean(context?.buildings?.some(b=>b.heightBasis==='overture')||/overture/i.test(String(context?.heightEnrichment?.attribution??'')));}
export function heightSourceLink(building){
  const url=building?.heightSourceUrl;
  if(!url)return null;
  return /\.pmtiles(?:[?#]|$)/i.test(url)?{url:'https://docs.overturemaps.org/guides/buildings/',label:'About height data ↗'}:{url,label:'Height data source ↗'};
}
export function currentRouteAnswer(answer){
  const m=answer?.measurement??answer;
  if(m?.distanceType==='straight-line')return {...m,distanceMeters:null,durationSeconds:null,route:null,status:'unresolved',headline:'Route not checked',detail:'This saved result predates street routing. Run a new check for travel distance along streets and paths.'};
  return answer;
}
export function priorityValue(item,{result,scenario,simulationState={}}){
  const answer=currentRouteAnswer(item.answer),measurement=answer?.measurement??answer,distance=measurement?.distanceMeters;
  if(Number.isFinite(distance)){const value=distance>=1000?number(distance/1000)+' km':Math.round(distance)+' m';return answer?.status==='partial'?value+' · partial':value;}
  if(answer?.status==='answered')return 'Found';
  if(answer?.status==='partial')return 'Partial answer';
  if(answer?.status==='needs-expert')return 'Expert check needed';
  if(answer?.status==='unresolved'||item.unresolved)return 'Not confirmed';
  if(item.pending||simulationState.busy)return 'Checking…';
  if(item.kind==='question')return 'Not established';
  if(item.target==='homes'){
    const count=scenario?.concept?.metrics?.homes;
    if(canDrawHousing(result,scenario)&&Number.isSafeInteger(count)&&count>0)return 'A possible housing layout';
    if(scenario?.concept?.status==='no-fit')return 'Placement unresolved';
  }
  return 'For discussion';
}
function appendContextAttribution(host,context,cls=''){
  const add=(label,url)=>{const a=el('a',label,cls);a.href=url;a.target='_blank';a.rel='noopener noreferrer';host.append(a);};
  if(context?.attribution)add(context.attribution,'https://www.openstreetmap.org/copyright');
  if(usesOvertureContext(context))add('Overture Maps','https://docs.overturemaps.org/attribution/');
}
let retainedScene=null;
export function scenePresentation(result,concept,scenario={concept}){
  const placed=canDrawHousing(result,scenario);
  return {placed,probe:null,height:placed?concept.metrics.heightMeters:null,homes:placed?concept.metrics.homes:null,parking:placed?concept.metrics.parking:null};
}
export function housingRetrievalIncomplete(result){
  return Boolean(result.parcel&&!result.code?.length&&result.narrativeStatus!=='researching'&&((result.codeAccess?.length??0)||(result.retrievalFailures??[]).some(f=>/planning|code|publication|website/i.test(f.name??''))));
}
export function sceneOutcome(result,scenario){
  if(housingRetrievalIncomplete(result))return 'The housing rules could not be retrieved, so a housing layout has not been tested.';
  const option=scenario?.options?.find(o=>o.id===scenario.activeOptionId);
  if(option?.useStatus==='unresolved')return option.applicability;
  if(scenario?.status==='needs-evidence'&&scenario.assessmentVersion===result.version?.assessment)return 'The housing approval path for this site is still unresolved; no housing layout is proposed.';
  if(result.status==='needs-parcel')return 'The mapped property records conflict; confirm which boundary is correct.';
  const assessedVersion=scenario?.assessmentVersion??scenario?.version?.assessment;
  if(assessedVersion&&result.version?.assessment&&assessedVersion!==result.version.assessment)return 'This idea needs a new check against the updated findings.';
  if(scenario?.concept?.contextVersion&&result.siteContext?.geometryVersion&&scenario.concept.contextVersion!==result.siteContext.geometryVersion)return 'This idea needs a new check against the updated site.';
  if(scenario?.concept?.buildings?.length&&!canDrawHousing(result,scenario))return 'Housing-use permission is unresolved, so no housing is shown.';
  if(scenario?.concept?.buildings?.length)return `This study places ${scenario.concept.metrics.homes} homes on the selected land; permission to build is not established.`;
  if(scenario?.concept?.status==='no-fit'){const c=scenario.concept,d=c.diagnostics;if(d?.testedFootprintWidthMeters)return `No placement found for the tested ${number(d.testedFootprintWidthMeters)} × ${number(d.testedFootprintDepthMeters)} m ${c.typology==='attached'?'whole row':'building'}, with ${number(c.parameters.edge_clearance)} m of assumed edge clearance. This bounded search does not rule out a different layout.`;return 'The bounded search did not find a placement for this option. Other arrangements remain possible.';}
  if(result.narrativeStatus==='researching')return 'Checking what this land could make possible.';
  if(result.housingRoute==='supported')return 'The rules suggest housing may be possible here; the site still needs checking.';
  return 'We cannot yet tell whether new housing is allowed on this land.';
}
function sourceLinks(host,support,sources){
  for(const item of support??[]){const source=(sources??[]).find(s=>s.id===item.sourceId);if(!source)continue;const d=el('details',undefined,'spatial-source');d.dataset.evidenceKey='housing-source:'+source.id+':'+(item.quote??'').slice(0,40);d.append(el('summary',source.title),el('blockquote',item.quote));const a=el('a','Open original source ↗');a.href=source.url;a.target='_blank';a.rel='noopener noreferrer';d.append(a);host.append(d);}
}
function appendHousingAnalysis(host,result){
  const a=result.housingAnalysis;
  const detail=el('details',undefined,'spatial-source');detail.dataset.evidenceKey='housing-analysis';detail.append(el('summary','What supports the housing path'));
  for(const [label,value]of [['Housing use',a.applicability],['Approvals',a.approvals],['Site limits',a.siteLimits],['Affordable delivery',a.affordability]])detail.append(el('h3',label),el('p',value));
  sourceLinks(detail,a.support,result.sources);host.append(detail);
}
function saveBrief(result,scenario,svg,studyError){
  const doc=document.implementation.createHTMLDocument('Steadmorrow · discussion brief'),body=doc.body;
  const style=doc.createElement('style');style.textContent='body{font:17px/1.55 system-ui;max-width:900px;margin:40px auto;padding:24px;color:#161616}h1{font-size:30px}svg{max-width:100%;height:340px;background:#f6f6f6}.model-parcel,.model-roof{fill:white;stroke:#888}.model-selection{fill:#4285f433;stroke:#2469da}.model-face{fill:#ddd;stroke:#aaa}.model-parking,.model-maneuver{fill:#ddd;stroke:#888}.model-zone{fill:none;stroke:#bbb}.model-corner{fill:white;stroke:#222}.model-probe path{fill:#eee6d933;stroke:#9b7f53;stroke-dasharray:6 4}.model-dimension{fill:#6c5637}small{color:#555}a{overflow-wrap:anywhere}@media print{button,.edit-note{display:none}body{margin:0;padding:0}h2{break-after:avoid}p{orphans:3;widows:3}}';doc.head.append(style);
  body.append(el('p','Editable discussion brief · click text to edit, then use your browser’s Print / Save as PDF.','edit-note'));
  const article=el('article');article.contentEditable='true';article.append(el('h1',result.parcel?.address||'Selected church land'),el('h2',result.assessment?.headline||'Housing route unresolved'),el('p',result.assessment?.summary||'The retrieved records do not yet establish a housing route.'));
  if(typeof svg==='string'){const img=el('img');img.src=svg;img.alt='The same site concept shown in Steadmorrow';img.style.width='100%';article.append(img);}
  if(studyError&&!scenario?.concept)article.append(el('p','The housing study did not finish. The image shows the selected land and mapped surroundings; no housing arrangement has been selected.'));

  if(scenario?.concept&&(canDrawHousing(result,scenario)||!scenario.concept.buildings.length)){const c=scenario.concept;article.append(el('h2','Illustrative layout'),el('p',`${c.metrics.homes} homes drawn; ${c.metrics.parking} parking bays drawn; ${c.buildings.length?number(c.metrics.heightMeters)+' m assumed model height':'no building height established'}. Legal capacity and affordable delivery are not established.`),el('p',scenario.rationale),el('p',conceptSummary(c)));for(const a of c.assumptions)article.append(el('p',a));}
  if(scenario?.options?.length){article.append(el('h2','Housing options'));for(const o of scenario.options)article.append(el('h3',o.title),el('p',o.dimensionBasis),el('p',o.applicability),el('p',o.concept?conceptSummary(o.concept):'Housing use remains unresolved.'));}
  if(scenario?.brief?.length){article.append(el('h2','What matters to you'));for(const priority of scenario.brief){article.append(el('h3',priority.originalExcerpt||priority.label));const answer=currentRouteAnswer(priority.answer);if(answer){const measured=answer.measurement??answer;article.append(el('p',measured.headline||priority.meaning),el('p',measured.detail||''));if(measured.feature?.sourceUrl){const a=el('a','Map source');a.href=measured.feature.sourceUrl;article.append(a);}if(measured.route?.sourceUrl){const a=el('a','Street route · Valhalla / OpenStreetMap');a.href=measured.route.sourceUrl;article.append(a);}}else article.append(el('p',priority.meaning));}}
  const mappedContext=sceneContext(result,scenario);if(mappedContext?.attribution||usesOvertureContext(mappedContext)){article.append(el('p',heightExplanation));const attribution=el('p');appendContextAttribution(attribution,mappedContext);for(const a of attribution.querySelectorAll('a'))a.style.marginRight='16px';article.append(attribution);}
  if(result.obstacles?.[0])article.append(el('h2','Next conversation'),el('p',result.obstacles[0].consequence),el('p',result.obstacles[0].nextStep));
  if(result.housingAnalysis)appendHousingAnalysis(article,result);
  else article.append(el('h2','Affordable delivery'),el('p','A housing concept does not establish affordable rents. The affordability commitment, delivery partner and funding route remain to be established.'));
  article.append(el('h2','Sources'));
  const sources=new Map([...result.sources,...(scenario?.sources??[])].map(s=>[s.id,s]));
  for(const source of sources.values()){const p=el('p'),a=el('a',source.title);a.href=source.url;p.append(a,el('small',` · Retrieved ${source.retrievedAt??'date unavailable'}`));article.append(p);}
  article.append(el('small',`Evidence ${scenario?.version?.evidence??result.version?.evidence} · Assessment ${result.version?.assessment} · Scenario ${scenario?.version?.scenario??'none'}`));body.append(article);
  const blob=new Blob(['<!doctype html>\n'+doc.documentElement.outerHTML],{type:'text/html;charset=utf-8'}),url=URL.createObjectURL(blob),a=el('a');a.href=url;a.download='Steadmorrow-discussion-brief.html';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export function createSpatialExperience({result,scenario,simulationState={},userPriorities={},onSimulate,onOption,plan}){
  scenario=normalizeHousingOptions(scenario);
  const root=el('div',undefined,'site-workspace');
  const left=el('aside',undefined,'priority-dashboard'),stage=el('section',undefined,'site-exploration'),inspector=el('aside',undefined,'site-inspector');
  left.setAttribute('aria-label','Your priorities');stage.setAttribute('aria-label','Your land in three dimensions');inspector.setAttribute('aria-label','What the findings mean');root.append(left,stage,inspector);
  const concept=scenario?.concept,presentation=scenePresentation(result,concept,scenario),context=sceneContext(result,scenario);
  const top=el('header',undefined,'scene-heading');top.append(el('h3','Your land, in context'));
  const mode=el('div',undefined,'scene-view-switch');mode.setAttribute('role','group');mode.setAttribute('aria-label','Scene view');top.append(mode);stage.append(top);
  const options=scenario?.options??[];let optionDetail,optionControls;
  if(options.length){
    const tabs=el('div',undefined,'housing-options');tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Housing options');
    const activeId=scenario.activeOptionId??options[0].id;
    for(const [i,option] of options.entries()){
      const tab=button('',()=>onOption?.(option.id),'housing-option');tab.id='housing-tab-'+option.id;tab.setAttribute('role','tab');tab.setAttribute('aria-controls','housing-option-panel');tab.setAttribute('aria-selected',String(option.id===activeId));tab.tabIndex=option.id===activeId?0:-1;
      const metrics=option.concept.metrics,selected=option.id===activeId;
      const description=`${option.title} · ${metrics.homes} ${metrics.homes===1?'home':'homes'} · ${metrics.storeys} ${metrics.storeys===1?'storey':'storeys'} · ${metrics.parking} parking`;
      tab.setAttribute('aria-label',description);tab.title=description;
      const metric=el('span',undefined,'option-metric');metric.append(el('strong',String(metrics.homes)),el('span',metrics.homes===1?'home':'homes'));
      const action=el('span',undefined,'option-action');action.append(el('span',selected?'Selected':'View arrangement'),el('span',selected?'✓':'↗','option-action-mark'));
      tab.append(metric,optionIcon(option.typology),el('span',option.title,'option-title'),action);
      tab.addEventListener('keydown',event=>{const keys=['ArrowLeft','ArrowRight','Home','End'];if(!keys.includes(event.key))return;event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?options.length-1:(i+(event.key==='ArrowLeft'?-1:1)+options.length)%options.length;onOption?.(options[next].id);});tabs.append(tab);
    }
    requestAnimationFrame(()=>{if(!tabs.isConnected||tabs.scrollWidth<=tabs.clientWidth)return;const active=tabs.querySelector('[aria-selected=true]');if(active)tabs.scrollTo({left:tabs.scrollLeft+active.getBoundingClientRect().left-tabs.getBoundingClientRect().left-(tabs.clientWidth-active.offsetWidth)/2,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});});
    optionControls=el('div',undefined,'option-dock');optionControls.append(el('p',options.length===1?'One reviewed arrangement':'Explore the arrangements','option-dock-title'),tabs);if(options.length===1)optionControls.append(el('p','Only this arrangement currently has a placed, reviewed result. Other possibilities remain open.','option-dock-note'));
    const option=options.find(o=>o.id===activeId),detail=el('details',undefined,'housing-option-detail');detail.append(el('summary','Why this option · housing-use conditions'));optionDetail=detail;
    detail.append(el('p',option?.rationale??'Selection rationale was not recorded in this saved study.'),el('p',option?.dimensionBasis),el('p',option?.applicability,'option-qualification'));sourceLinks(detail,option?.support,scenario?.sources??result.sources);
    if(option?.review){const critique=el('details');critique.append(el('summary','Review of this arrangement'));for(const finding of option.review.priorityFindings??[])critique.append(el('p',finding.finding));for(const limitation of option.review.limitations??[])critique.append(el('p',limitation));detail.append(critique);}
  }
  const surface=el('div',undefined,'site-surface');if(options.length){surface.id='housing-option-panel';surface.setAttribute('role','tabpanel');surface.setAttribute('aria-labelledby','housing-tab-'+(scenario.activeOptionId??options[0].id));}stage.append(surface);if(optionControls)stage.append(optionControls);
  const canvasKey=JSON.stringify(result.selectedArea?.geometry??[]);
  if(!retainedScene||retainedScene.key!==canvasKey){retainedScene?.view?.dispose();retainedScene={key:canvasKey,host:el('div',undefined,'site-canvas'),view:null,mode:'3d',onViewChange:null,onSelectFeature:null};}
  const retained=retainedScene;surface.append(retained.host);
  const connectors=document.createElementNS('http://www.w3.org/2000/svg','svg');connectors.setAttribute('class','scene-connectors');connectors.setAttribute('aria-hidden','true');surface.append(connectors);
  const callouts=el('div',undefined,'site-callouts');surface.append(callouts);
  const popover=el('section',undefined,'site-popover');popover.hidden=true;popover.tabIndex=-1;popover.setAttribute('aria-label','Site detail');surface.append(popover);
  let opener,active='',popoverTarget='selection';
  const close=()=>{popover.hidden=true;active='';retained.view?.closeDetail();retained.view?.setHighlight(null);for(const b of root.querySelectorAll('[aria-expanded]'))b.setAttribute('aria-expanded','false');callouts.classList.remove('has-active');opener?.focus({preventScroll:true});};
  const reveal=(trigger,target,title,body,extra)=>{
    if(opener===trigger&&active===target&&!popover.hidden){close();return;}
    opener=trigger;popoverTarget=target;active=target;retained.view?.openDetail(target);
    for(const b of root.querySelectorAll('[aria-expanded]'))b.setAttribute('aria-expanded',String(b===trigger));
    callouts.classList.add('has-active');
    popover.replaceChildren(button('×',close,'site-popover-close'),el('h4',title),el('p',body));popover.querySelector('button').setAttribute('aria-label','Close detail');extra?.(popover);popover.hidden=false;retained.view?.setHighlight(target);const point=retained.view?.getAnchors?.()[target];const placeRight=point&&point.x<surface.clientWidth*.5;popover.style.left=placeRight?'auto':'';popover.style.right=placeRight?'14px':'auto';popover.focus({preventScroll:true});const box=surface.getBoundingClientRect();if(box.top<100||box.bottom>innerHeight-20)surface.scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
  };
  root.addEventListener('keydown',e=>{if(e.key==='Escape'&&!popover.hidden){e.preventDefault();close();}});
  const positions=[];
  const addCallout=(label,target,body,tone='normal',action)=>{
    const b=button('',()=>action?action(b):reveal(b,target,label,body),'site-callout '+tone);b.setAttribute('aria-expanded','false');b.setAttribute('aria-label',label);b.title=label;
    const index=positions.length+1;b.append(el('span',String(index),'callout-number'),el('span',label,'callout-label'));
    callouts.append(b);positions.push({b,target});return b;
  };
  const updateAnchors=()=>{
    if(!root.isConnected)return;
    const width=surface.clientWidth,height=surface.clientHeight,anchors=retained.view?.getAnchors?.()??{};
    connectors.setAttribute('viewBox',`0 0 ${width} ${height}`);connectors.replaceChildren();
    const visible=[];
    positions.forEach(({b,target})=>{
      const anchor=anchors[target];
      if(!anchor){b.hidden=true;return;}
      const ax=Array.isArray(anchor)?anchor[0]:anchor.x,ay=Array.isArray(anchor)?anchor[1]:anchor.y;
      if(anchor.visible===false||!Number.isFinite(ax)||!Number.isFinite(ay)){b.hidden=true;return;}b.hidden=false;
      visible.push({b,target,x:ax,y:ay,ax,ay});
    });
    arrangeSceneMarkers(visible,width,height).forEach(({b,target,x,y,ax,ay})=>{
      b.style.left=x+'px';b.style.top=y+'px';
      b.classList.toggle('label-left',x>width*.6);
      const line=document.createElementNS('http://www.w3.org/2000/svg','path');line.setAttribute('d',`M${ax},${ay} L${x+22},${y+22}`);connectors.append(line);
      const dot=document.createElementNS('http://www.w3.org/2000/svg','circle');dot.setAttribute('cx',ax);dot.setAttribute('cy',ay);dot.setAttribute('r','3');connectors.append(dot);
    });
  };
  retained.onViewChange=updateAnchors;
  retained.onSelectFeature=feature=>{
    if(!feature)return;
    if(feature.kind==='proposed-home'){const building=concept?.buildings?.find(b=>b.id===feature.id)??feature;const homes=building.homes??1;reveal(null,feature.id,homes>1?'Housing in this idea':'A home in this idea',`${building.storeys} assumed storeys, ${number(building.height)} m high. This block represents ${homes===1?'one assumed home':number(homes)+' assumed homes'}; its internal rooms, circulation and safe access have not been designed.`);return;}
    if(feature.kind==='proposed-parking'){reveal(null,feature.id,'Parking in this idea','One illustrative parking space. A usable driveway connection and the required parking still need checking.');return;}
    if(feature.kind==='parcel-candidate'){reveal(null,feature.id,'Possible property match','This is a mapped property boundary. Choose the intended property in the findings panel to continue.');return;}
    if(['school','police','place','hospital','clinic','pharmacy','supermarket','bus_stop'].includes(feature.kind)){reveal(null,feature.id,feature.name||'Mapped place','This is the mapped destination. Open your priority to see the checked travel route and its distance.',d=>{if(feature.sourceUrl){const a=el('a','View map source ↗');a.href=feature.sourceUrl;a.target='_blank';a.rel='noopener noreferrer';d.append(a);}});return;}
    const mapped={...context?.buildings?.find(b=>b.id===feature.id),...feature};
    reveal(null,feature.id,feature.name||'Mapped building',buildingHeightDescription(mapped),d=>{
      if(mapped.heightBasis==='overture'&&mapped.heightRelease)d.append(el('p',`Overture release ${mapped.heightRelease}`,'height-source-meta'));
      if(mapped.heightBasis==='overture'&&mapped.overtureId){const record=el('details',undefined,'height-record');record.append(el('summary','Source record'),el('p',`Overture building ${mapped.overtureId}`));d.append(record);}
      if(mapped.sourceUrl){const a=el('a','Building footprint source ↗');a.href=mapped.sourceUrl;a.target='_blank';a.rel='noopener noreferrer';d.append(a);}
      const heightLink=heightSourceLink(mapped);if(heightLink){const a=el('a',heightLink.label);a.href=heightLink.url;a.target='_blank';a.rel='noopener noreferrer';d.append(a);}
    });
  };
  if(!retained.view){
    try{retained.view=createSiteScene(retained.host,{result:{...result,siteContext:context},scenario,onViewChange:()=>retained.onViewChange?.(),onSelectFeature:f=>retained.onSelectFeature?.(f)});}
    catch{const fallback=el('div',undefined,'scene-fallback');fallback.append(el('p','The 3D view could not open on this device.'));if(plan)fallback.append(plan);retained.host.replaceChildren(fallback);}
  }else {retained.view.closeDetail();retained.view.update({result:{...result,siteContext:context},scenario});}
  const three=button('3D',()=>{retained.mode='3d';retained.view?.setView('3d');three.setAttribute('aria-pressed','true');two.setAttribute('aria-pressed','false');}),two=button('Plan',()=>{retained.mode='plan';retained.view?.setView('plan');two.setAttribute('aria-pressed','true');three.setAttribute('aria-pressed','false');});three.setAttribute('aria-pressed',String(retained.mode==='3d'));two.setAttribute('aria-pressed',String(retained.mode==='plan'));mode.append(three,two);
  const controls=el('div',undefined,'site-camera-controls');controls.append(button('↺',()=>retained.view?.rotate(),'camera-control'),button('Focus land',()=>retained.view?.focus('selection'),'camera-control'),button('Neighbourhood',()=>retained.view?.focus('context'),'camera-control'));controls.firstChild.setAttribute('aria-label','Rotate the site');surface.append(controls);
  const caption=el('div',undefined,'site-scene-caption');caption.append(el('span','Selected land','key-selection'),el('span','Mapped property','key-parcel'),el('span','Existing buildings','key-existing'));stage.append(caption);
  const heightNote=el('details',undefined,'scene-height-note');heightNote.append(el('summary','About the map and building heights'),el('p',heightExplanation),el('p','Proposed façades, entrances and roofs are illustrative. Roofs stay within the measured footprint and total assumed height; they are not surveyed elevations, resolved floor-to-ceiling heights or an interior design.'),el('p','Streets follow mapped paths. Widths use mapped measurements where available, otherwise approximate widths based on lanes or road type. They are not surveyed road boundaries.'));stage.append(heightNote);
  if(optionDetail)stage.append(optionDetail);
  if(scenario?.explorations?.length){const explored=el('details',undefined,'housing-option-detail explored-options');explored.append(el('summary',`Other exploration · ${scenario.explorations.length} unresolved`));for(const o of scenario.explorations){explored.append(el('h4',o.title),el('p',o.concept?sceneOutcome(result,{concept:o.concept}):o.applicability));}stage.append(explored);}
  if(presentation.placed){
    const design=el('details',undefined,'housing-option-detail');design.append(el('summary','Home sizes and design checks'),el('p',homeSizeDescription(concept)));
    const brief=concept.designBrief;
    if(brief){design.append(el('p',brief.household),el('p',brief.basis),el('p',`${brief.bedrooms} bedrooms allowed for in each home. Space for walls, halls and stairs is included in the size check.`));const checks=el('details');checks.append(el('summary','Standards cited for this idea'),el('p','These are the standards used in this early size check. Funding eligibility and full city building rules still need checking.'));for(const standard of brief.standards??[])checks.append(el('h4',standard.scope==='applicable'?'Cited standard':standard.scope==='program-benchmark'?'Chosen design target':'Still to confirm'),el('p',standard.requirement),el('p',standard.applicability));design.append(checks);for(const check of brief.unresolvedChecks??[])design.append(el('p',check));sourceLinks(design,brief.support,scenario.sources??result.sources);}
    else design.append(el('p','This saved idea has not yet been checked against a home-size brief or local building standards. Its home count is provisional.'));
    design.append(el('p',`The ${concept.typology==='apartment'?'whole building':'ground floor of each home'} measures about ${number(concept.parameters.width*3.28084)} by ${number(concept.parameters.depth*3.28084)} feet. The total model height is about ${number(concept.metrics.heightMeters*3.28084)} feet.`),el('p','Parking, a usable driveway, step-free access, fire access and outdoor space still need a detailed plan. Dimensions and room allowances do not prove that a home meets building rules.'));
    stage.append(design);
  }

  const outcome=el('p',sceneOutcome(result,scenario),'site-outcome');outcome.setAttribute('role','status');stage.insertBefore(outcome,caption);
  if(simulationState.error){const error=el('p',simulationState.error,'scene-error');error.setAttribute('role','alert');stage.append(error,button('Try the study again',()=>onSimulate?.(simulationState.refinement??''),'site-text-button'));}
  appendContextAttribution(stage,context,'scene-attribution');
  if(context?.status==='unavailable')stage.append(el('p','Nearby building shapes could not be loaded.','scene-context-note'));
  else if(context?.status==='partial')heightNote.append(el('p','The map may omit nearby buildings or building parts.'));
  const landmark=Object.entries(result.parcel?.attributes??{}).find(([k,v])=>/^landmark$/i.test(k)&&v&&!/^(0|none|no|n)$/i.test(String(v)));
  const askedTargets=new Set((simulationState.brief??scenario?.brief??[]).map(p=>p.target));
  if(presentation.placed&&concept?.parking?.length&&!askedTargets.has('parking'))addCallout('Driveway access to check','parking','Parking spaces are shown here, but a connection to the public road has not been established. A site review needs to check that connection.','constraint');
  if(concept?.blockedRegions?.length&&!askedTargets.has('land')){const blocked=concept.blockedRegions[0];addCallout('Existing building',blocked.id,'A mapped building footprint overlaps this selected land. The study keeps that building in place and excludes its footprint from new housing.','constraint');}
  if(landmark&&positions.length<3&&!askedTargets.has('land'))addCallout('Landmark protection','property','The property record lists a landmark designation. Its effect on new building within the selected land has not been established.','constraint');

  if(result.parcel?.members?.length>1&&positions.length<3&&!askedTargets.has('land'))addCallout('Separate property rights','property',`Your selection includes ${result.parcel.members.length} mapped parcels. This study retains each boundary. Common ownership and any consolidation needed for development remain unverified.`,'constraint');

  left.append(el('h3','What matters to you'),el('p','Open a priority to explore it on the map.','priority-guidance'));
  const brief=simulationState.brief??scenario?.brief??result.concernBrief;
  const original=[userPriorities.purpose,userPriorities.matters,...(userPriorities.choices??[])].filter(Boolean);
  const priorityInputs=brief?.length?brief:original.map((text,i)=>({id:'pending-'+i,label:text,originalExcerpt:text,pending:result.narrativeStatus==='researching',unresolved:result.narrativeStatus!=='researching'}));
  const priorities=uniquePriorities(priorityInputs.map(item=>({...item,answer:item.answer??(result.priorityMeasurements??[]).findLast(m=>m.originalExcerpt&&(item.originalExcerpt??'').includes(m.originalExcerpt))??(scenario?.priorityAnswers??[]).find(a=>a.priorityId===item.id)})));
  if(!priorities.length)left.append(el('p','Your housing priorities will appear here.','priority-empty'));
  for(const item of priorities){
    const answer=currentRouteAnswer(item.answer);
    const measurement=answer?.measurement??answer;
    const distance=Number.isFinite(measurement?.distanceMeters)?measurement.distanceMeters:null;
    const value=priorityValue(item,{result,scenario,simulationState});
    const sourceLabel=item.label||item.originalExcerpt||'Your priority';
    const label=sourceLabel.charAt(0).toUpperCase()+sourceLabel.slice(1);
    const plainEffects=surroundingSummary(answer,concept?.id);
    const showPriority=trigger=>{reveal(trigger,measurement?.id||item.target||'selection',distance!==null?`${(measurement.mode??'walking').replace(/^./,c=>c.toUpperCase())} route`:label,distance!==null?(measurement.feature?.name??'Mapped destination'):(plainEffects?.detail||answer?.detail||answer?.headline||answer?.explanation||item.meaning||'This is part of the request being explored.'),d=>{
      if(distance!==null){d.append(el('strong',`${value} · ${measurement.mode??'walking'}`,'priority-distance'));if(Number.isFinite(measurement.durationSeconds))d.append(el('p',`About ${Math.max(1,Math.round(measurement.durationSeconds/60))} min · estimated travel time`));}
      let detailHost=d;if(plainEffects){d.append(el('h5','What still needs checking'),el('p',plainEffects.next));const evidence=el('details',undefined,'priority-original');evidence.append(el('summary','Full findings and sources'),el('p',answer.detail));d.append(evidence);detailHost=evidence;}if(!plainEffects&&measurement?.detail){if(distance!==null){const check=el('details',undefined,'priority-original');check.open=answer?.status==='partial';check.append(el('summary','How this route was checked'),el('p',measurement.detail));d.append(check);detailHost=check;}else if(measurement.detail!==(answer?.detail||answer?.headline||answer?.explanation))d.append(el('p',measurement.detail));}
      if(measurement?.route?.attribution){const a=el('a',measurement.route.attribution+' ↗');a.href='https://valhalla.openstreetmap.de/';a.target='_blank';a.rel='noopener noreferrer';detailHost.append(a);}
      if(answer?.applicability)detailHost.append(el('p',answer.applicability));
      for(const check of answer?.unresolvedChecks??[])detailHost.append(el('p',check));
      sourceLinks(detailHost,answer?.support??[],scenario?.sources??result.sources);
      for(const receipt of answer?.receipts??[]){if(receipt.kind!=='surroundings-effects')continue;const measured=el('details');measured.append(el('summary','What was measured'),el('p',`Proposed building footprint: ${number(receipt.proposalGroundFootprintSquareMeters)} m². This does not establish net added paved area.`));for(const structure of receipt.structures.slice(0,10))measured.append(el('p',`${structure.name} (${structure.id}): ${number(structure.minimumSeparationMeters)} m from the proposed building. Existing height ${structure.existingHeightMeters===null?'unknown':number(structure.existingHeightMeters)+' m, '+structure.heightBasis}.`));if(receipt.structures.length>10)measured.append(el('p',`Showing the closest ten of ${receipt.structures.length} mapped structures.`));for(const sample of receipt.shadows)measured.append(el('p',sample.status==='unresolved'?`${sample.instant}: ${sample.reason}`:`${sample.instant}: proposed ground-shadow projection ${number(sample.proposedGroundShadowSquareMeters)} m². This is a sampled ground-plane estimate, not indoor daylight loss.`));for(const limitation of receipt.limitations)measured.append(el('p',limitation));detailHost.append(measured);}
      if(item.originalExcerpt){const asked=el('details',undefined,'priority-original');asked.append(el('summary','Your question'),el('blockquote','“'+item.originalExcerpt+'”'));detailHost.append(asked);}
      const url=answer?.feature?.sourceUrl??answer?.sourceUrl??measurement?.feature?.sourceUrl??measurement?.sourceUrl;if(url){const a=el('a','View the source ↗');a.href=url;a.target='_blank';a.rel='noopener noreferrer';detailHost.append(a);}
    });};
    const b=button('',()=>showPriority(b),'priority-tile');b.setAttribute('aria-expanded','false');b.dataset.answerState=answer?.status==='partial'?'partial':distance!==null||answer?.status==='answered'?'answered':'pending';b.append(el('span',label,'priority-title'),el('strong',value,'priority-answer'),el('span','+','priority-open'),el('small','Explore on map','priority-hint'));left.append(b);

  }
  if(!options.length&&result.version?.assessment&&result.parcel&&!simulationState.busy&&result.narrativeStatus!=='researching')stage.append(button('Explore housing arrangements',()=>onSimulate?.(''),'site-text-button'));
  const canRefine=Boolean(result.version?.assessment&&result.parcel&&result.status!=='needs-parcel'&&!result.locality?.boundaryUncertain&&!result.locality?.authorityUnresolved&&!simulationState.busy);
  const add=button('Add a concern +',()=>{form.hidden=!form.hidden;if(!form.hidden)input.focus();},'add-concern');add.disabled=!canRefine;left.append(add);
  const form=el('form',undefined,'priority-refine');form.hidden=!simulationState.question;
  const label=el('label',simulationState.question||'What else matters to you?');label.htmlFor='scenario-refinement';const input=el('textarea');input.id='scenario-refinement';input.rows=3;input.maxLength=600;input.placeholder='Ask what matters to you. You can include several concerns together.';input.value=simulationState.refinement??'';
  const send=el('button','Update the study','priority-submit');send.type='submit';send.disabled=!canRefine;form.append(label,input,send);left.append(form);
  form.addEventListener('submit',e=>{e.preventDefault();if(!input.value.trim()){input.focus();return;}if(hasPrivateInput(input.value)){input.setCustomValidity(privacyMessage);input.reportValidity();return;}input.setCustomValidity('');onSimulate?.(input.value.trim());});
  input.addEventListener('input',()=>input.setCustomValidity(''));

  const reading=el('dialog',undefined,'site-reading'),readingHead=el('header'),title=el('h2','The finding');title.id='site-reading-title';reading.setAttribute('aria-labelledby',title.id);const closeReading=button('Close ×',()=>reading.close(),'reading-close');readingHead.append(title,closeReading);const readingBody=el('div',undefined,'reading-body');reading.append(readingHead,readingBody);root.append(reading);
  const sections=new Map();
  const openReading=section=>{for(const [key,node]of sections)node.hidden=key!==section;title.textContent=section==='sources'?'The sources':section==='assumptions'?'About this housing idea':'The finding';reading.dataset.section=section;if(!reading.open)reading.showModal();readingBody.scrollTop=0;};
  reading.addEventListener('click',e=>{if(e.target===reading){const b=reading.getBoundingClientRect();if(e.clientX<b.left||e.clientX>b.right||e.clientY<b.top||e.clientY>b.bottom)reading.close();}});
  const finish=()=>{
    const full=el('div',undefined,'full-findings'),sources=el('div',undefined,'full-sources');
    const choices=inspector.querySelector('.parcel-choices');choices?.remove();
    const records=inspector.querySelector('[data-evidence-key="records"]');if(records){records.remove();sources.append(records);records.open=true;}
    while(inspector.firstChild)full.append(inspector.firstChild);
    if(result.housingAnalysis)appendHousingAnalysis(full,result);
    sections.set('findings',full);sections.set('sources',sources);
    const assumptions=el('div');if(concept&&(presentation.placed||!concept.buildings.length)){assumptions.append(el('p',conceptSummary(concept)),el('p',scenario.rationale));for(const a of concept.assumptions)assumptions.append(el('p',a));sourceLinks(assumptions,scenario.support,scenario.sources);}else assumptions.append(el('p','Housing-use permission has not been established, so the housing blocks are not shown.'));
    sections.set('assumptions',assumptions);readingBody.append(full,sources,assumptions);
    inspector.append(el('p','The first read','inspector-eyebrow'));
    const pending=result.narrativeStatus==='researching';
    const heading=housingRetrievalIncomplete(result)?'The housing rules could not be retrieved':result.researchError?'The property check was interrupted':result.narrativeStatus==='unavailable'?'The housing check is incomplete':result.status==='needs-parcel'?'Which property do you mean?':(result.housingRoute==='supported'&&/unless|except|exempt/i.test(result.housingAnalysis?.applicability??'')?'New housing may be possible, subject to the conditions below':result.assessment?.headline)??(pending?'Checking what could work here':'Housing permission is unresolved');
    inspector.append(el('h3',heading,'finding-title'));
    if(housingRetrievalIncomplete(result))inspector.append(el('p','Your property and priority answers are kept. This research failure does not tell us whether housing is allowed.','finding-snippet'));
    else if(result.researchError)inspector.append(el('p','Your land and the information found so far are kept. Retry findings to continue the property check.','finding-snippet'));
    else if(choices)inspector.append(choices);
    else if(landmark)inspector.append(el('p','This property is listed as a landmark. Its protection may affect new building.','finding-snippet'));
    else if(result.housingAnalysis?.applicability&&/unless|except|exempt/i.test(result.housingAnalysis.applicability))inspector.append(el('p',result.housingAnalysis.applicability,'finding-snippet'));
    else if(result.obstacles?.[0]?.heading)inspector.append(el('p',result.obstacles[0].heading,'finding-snippet'));
    else inspector.append(el('p',pending?'The site will take shape as its records arrive.':'The available records have not settled the housing question.','finding-snippet'));
    inspector.append(button(result.assessment?'Read the finding ↗':'What we found ↗',()=>openReading('findings'),'site-text-button'));
    const links=el('div',undefined,'source-actions');links.append(button('Sources ↗',()=>openReading('sources'),'site-text-button'));if(concept)links.append(button('About this idea ↗',()=>openReading('assumptions'),'site-text-button'));inspector.append(links);
    if(result.assessment)inspector.append(button('Save discussion brief ↓',()=>saveBrief(result,{...scenario,brief:scenario?.brief??simulationState.brief??[]},retained.view?.capture?.(),simulationState.error),'save-discussion'));
    requestAnimationFrame(updateAnchors);
  };
  return {root,inspector,finish,openReading};
}

function optionIcon(form){
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 64 48');svg.setAttribute('class','option-icon');svg.setAttribute('aria-hidden','true');
  const paths=form==='apartment'?['M12 42V10L38 4L53 12V42Z','M38 4V42','M18 16H23M29 14H34M18 24H23M29 22H34M18 32H23M29 30H34M44 17H49M44 25H49M44 33H49']:form==='attached'?['M5 22L15 12L25 22V42H5Z M25 22L35 12L45 22V42H25Z M45 22L53 14L61 22V42H45Z','M12 42V30H18V42M32 42V30H38V42M51 42V30H56V42']:['M9 23L29 7L51 23V42H9Z','M9 23H51M27 42V28H35V42M15 28H21V34H15Z','M29 7L40 5L59 20L51 23M51 42L59 37V20'];
  for(const d of paths){const p=document.createElementNS(svg.namespaceURI,'path');p.setAttribute('d',d);p.setAttribute('fill','none');p.setAttribute('stroke','currentColor');p.setAttribute('stroke-width','1.7');p.setAttribute('stroke-linejoin','round');svg.append(p);}return svg;
}
