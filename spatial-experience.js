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
  if(answer?.status==='unresolved'||item.unresolved)return 'Not confirmed';
  if(item.pending||simulationState.busy)return 'Checking…';
  if(item.kind==='question')return 'Not established';
  if(item.target==='homes'){
    const count=scenario?.concept?.metrics?.homes;
    if(canDrawHousing(result,scenario)&&Number.isSafeInteger(count)&&count>0)return `${number(count)} ${count===1?'home':'homes'} drawn`;
    if(scenario?.concept?.status==='no-fit')return 'No fit yet';
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
  if(scenario?.status==='needs-evidence'&&scenario.assessmentVersion===result.version?.assessment)return 'The housing approval path for this site is still unresolved; no housing layout is proposed.';
  if(result.status==='needs-parcel')return 'Choose the property you want to explore.';
  const assessedVersion=scenario?.assessmentVersion??scenario?.version?.assessment;
  if(assessedVersion&&result.version?.assessment&&assessedVersion!==result.version.assessment)return 'This idea needs a new check against the updated findings.';
  if(scenario?.concept?.contextVersion&&result.siteContext?.geometryVersion&&scenario.concept.contextVersion!==result.siteContext.geometryVersion)return 'This idea needs a new check against the updated site.';
  if(scenario?.concept?.buildings?.length&&!canDrawHousing(result,scenario))return 'Housing-use permission is unresolved, so no housing is shown.';
  if(scenario?.concept?.buildings?.length)return `This study places ${scenario.concept.metrics.homes} homes on the selected land; permission to build is not established.`;
  if(scenario?.concept?.status==='no-fit')return 'This arrangement of homes does not fit the land you selected.';
  if(result.narrativeStatus==='researching')return 'Checking what this land could make possible.';
  if(result.housingRoute==='supported')return 'The rules suggest housing may be possible here; the site still needs checking.';
  return 'We cannot yet tell whether new housing is allowed on this land.';
}
function sourceLinks(host,support,sources){
  for(const item of support??[]){const source=sources.find(s=>s.id===item.sourceId);if(!source)continue;const d=el('details',undefined,'spatial-source');d.dataset.evidenceKey='housing-source:'+source.id+':'+(item.quote??'').slice(0,40);d.append(el('summary',source.title),el('blockquote',item.quote));const a=el('a','Open original source ↗');a.href=source.url;a.target='_blank';a.rel='noopener noreferrer';d.append(a);host.append(d);}
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
export function createSpatialExperience({result,scenario,simulationState={},userPriorities={},onSimulate,plan}){
  const root=el('div',undefined,'site-workspace');
  const left=el('aside',undefined,'priority-dashboard'),stage=el('section',undefined,'site-exploration'),inspector=el('aside',undefined,'site-inspector');
  left.setAttribute('aria-label','Your priorities');stage.setAttribute('aria-label','Your land in three dimensions');inspector.setAttribute('aria-label','What the findings mean');root.append(left,stage,inspector);
  const concept=scenario?.concept,presentation=scenePresentation(result,concept,scenario),context=sceneContext(result,scenario);
  const top=el('header',undefined,'scene-heading');top.append(el('h3','Your land, in context'));
  const mode=el('div',undefined,'scene-view-switch');mode.setAttribute('role','group');mode.setAttribute('aria-label','Scene view');top.append(mode);stage.append(top);
  const surface=el('div',undefined,'site-surface');stage.append(surface);
  const canvasKey=JSON.stringify(result.selectedArea?.geometry??[]);
  if(!retainedScene||retainedScene.key!==canvasKey){retainedScene?.view?.dispose();retainedScene={key:canvasKey,host:el('div',undefined,'site-canvas'),view:null,mode:'3d',onViewChange:null,onSelectFeature:null};}
  const retained=retainedScene;surface.append(retained.host);
  const connectors=document.createElementNS('http://www.w3.org/2000/svg','svg');connectors.setAttribute('class','scene-connectors');connectors.setAttribute('aria-hidden','true');surface.append(connectors);
  const callouts=el('div',undefined,'site-callouts');surface.append(callouts);
  const popover=el('section',undefined,'site-popover');popover.hidden=true;popover.tabIndex=-1;popover.setAttribute('aria-label','Site detail');surface.append(popover);
  let opener,active='',popoverTarget='selection';
  const close=()=>{popover.hidden=true;active='';retained.view?.setHighlight(null);for(const b of root.querySelectorAll('[aria-expanded]'))b.setAttribute('aria-expanded','false');callouts.classList.remove('has-active');opener?.focus({preventScroll:true});};
  const reveal=(trigger,target,title,body,extra)=>{
    if(opener===trigger&&active===target&&!popover.hidden){close();return;}
    opener=trigger;popoverTarget=target;active=target;
    for(const b of root.querySelectorAll('[aria-expanded]'))b.setAttribute('aria-expanded',String(b===trigger));
    callouts.classList.add('has-active');
    popover.replaceChildren(button('×',close,'site-popover-close'),el('h4',title),el('p',body));popover.querySelector('button').setAttribute('aria-label','Close detail');extra?.(popover);popover.hidden=false;retained.view?.setHighlight(target);const point=retained.view?.getAnchors?.()[target];const placeRight=point&&point.x<surface.clientWidth*.5;popover.style.left=placeRight?'auto':'';popover.style.right=placeRight?'14px':'auto';popover.focus({preventScroll:true});const box=popover.getBoundingClientRect();if(box.top<0||box.bottom>innerHeight)popover.scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
  };
  root.addEventListener('keydown',e=>{if(e.key==='Escape'&&!popover.hidden){e.preventDefault();close();}});
  const positions=[];
  const addCallout=(label,target,body,tone='normal',action)=>{
    const b=button('',()=>action?action(b):reveal(b,target,label,body),'site-callout '+tone);b.setAttribute('aria-expanded','false');b.setAttribute('aria-label',label);b.title=label;
    const index=positions.length+1;b.append(el('span',String(index),'callout-number'),el('span',label,'callout-label'));if(!positions.length)b.classList.add('primary-marker');
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
  }else retained.view.update({result:{...result,siteContext:context},scenario});
  const three=button('3D',()=>{retained.mode='3d';retained.view?.setView('3d');three.setAttribute('aria-pressed','true');two.setAttribute('aria-pressed','false');}),two=button('Plan',()=>{retained.mode='plan';retained.view?.setView('plan');two.setAttribute('aria-pressed','true');three.setAttribute('aria-pressed','false');});three.setAttribute('aria-pressed',String(retained.mode==='3d'));two.setAttribute('aria-pressed',String(retained.mode==='plan'));mode.append(three,two);
  const controls=el('div',undefined,'site-camera-controls');controls.append(button('↺',()=>retained.view?.rotate(),'camera-control'),button('Focus land',()=>retained.view?.focus('selection'),'camera-control'),button('Neighbourhood',()=>retained.view?.focus('context'),'camera-control'));controls.firstChild.setAttribute('aria-label','Rotate the site');surface.append(controls);
  const caption=el('div',undefined,'site-scene-caption');caption.append(el('span','Selected land','key-selection'),el('span','Mapped property','key-parcel'),el('span','Existing buildings','key-existing'));stage.append(caption);
  const heightNote=el('details',undefined,'scene-height-note');heightNote.append(el('summary','About the map and building heights'),el('p',heightExplanation),el('p','Streets follow mapped paths. Widths use mapped measurements where available, otherwise approximate widths based on lanes or road type. They are not surveyed road boundaries.'));stage.append(heightNote);
  const outcome=el('p',sceneOutcome(result,scenario),'site-outcome');outcome.setAttribute('role','status');stage.insertBefore(outcome,caption);
  if(simulationState.error){const error=el('p',simulationState.error,'scene-error');error.setAttribute('role','alert');stage.append(error,button('Try the study again',()=>onSimulate?.(''),'site-text-button'));}
  appendContextAttribution(stage,context,'scene-attribution');
  if(context?.status==='unavailable')stage.append(el('p','Nearby building shapes could not be loaded.','scene-context-note'));
  else if(context?.status==='partial')heightNote.append(el('p','The map may omit nearby buildings or building parts.'));
  const landmark=Object.entries(result.parcel?.attributes??{}).find(([k,v])=>/^landmark$/i.test(k)&&v&&!/^(0|none|no|n)$/i.test(String(v)));
  addCallout('Selected land','selection',`You selected approximately ${number(Math.round(result.selectedArea?.squareMeters??0))} m².`+(result.parcel?.geometry?' The subdued outline is the separately retrieved property boundary.':' The property boundary is still being checked.'));
  if(concept?.status==='no-fit'){
    const d=concept.diagnostics??{},p=concept.parameters;
    addCallout('Why this test does not fit',concept.blockedRegions?.[0]?.id??'selection',d.explanation||`${concept.metrics.mappedExistingFootprintSquareMeters>0?'Mapped buildings cover '+number(Math.round(concept.metrics.mappedExistingFootprintSquareMeters))+' m² of the area tested. ':''}This test used a ${number(d.testedFootprintWidthMeters??p.width)} × ${number(d.testedFootprintDepthMeters??p.depth)} m ${concept.typology==='apartment'?'apartment footprint':concept.typology==='attached'?'row of homes':'home footprint'}, plus space around it. It could not place this arrangement inside the selected land. This does not rule out every design.`,'constraint');
  }else if(presentation.placed&&concept?.parking?.length)addCallout('Parking in this idea','parking',`${concept.parking.length} spaces are drawn. A usable driveway connection and the required parking still need checking.`);
  if(concept?.status!=='no-fit'&&concept?.blockedRegions?.length){const blocked=concept.blockedRegions[0];addCallout('Existing building',blocked.id,'A mapped building footprint overlaps this selected land. The study keeps that building in place and excludes its footprint from new housing.','constraint');}
  if(landmark&&positions.length<3)addCallout('Landmark protection','property','The property record lists a landmark designation. Its effect on new building within the selected land has not been established.','constraint');

  left.append(el('h3','What matters to you'));
  const brief=simulationState.brief??scenario?.brief;
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
    const showPriority=trigger=>{if(measurement?.feature?.id)retained.view?.focus(measurement.feature.id);reveal(trigger,measurement?.feature?.id||item.target||'selection',distance!==null?`${(measurement.mode??'walking').replace(/^./,c=>c.toUpperCase())} route`:label,distance!==null?(measurement.feature?.name??'Mapped destination'):(answer?.detail||answer?.headline||answer?.explanation||item.meaning||'This is part of the request being explored.'),d=>{
      if(distance!==null){d.append(el('strong',`${value} · ${measurement.mode??'walking'}`,'priority-distance'));if(Number.isFinite(measurement.durationSeconds))d.append(el('p',`About ${Math.max(1,Math.round(measurement.durationSeconds/60))} min · estimated travel time`));}
      let detailHost=d;if(measurement?.detail){if(distance!==null){const check=el('details',undefined,'priority-original');check.open=answer?.status==='partial';check.append(el('summary','How this route was checked'),el('p',measurement.detail));d.append(check);detailHost=check;}else if(measurement.detail!==(answer?.detail||answer?.headline||answer?.explanation))d.append(el('p',measurement.detail));}
      if(measurement?.route?.attribution){const a=el('a',measurement.route.attribution+' ↗');a.href='https://valhalla.openstreetmap.de/';a.target='_blank';a.rel='noopener noreferrer';detailHost.append(a);}
      if(item.originalExcerpt){const asked=el('details',undefined,'priority-original');asked.append(el('summary','Your question'),el('blockquote','“'+item.originalExcerpt+'”'));detailHost.append(asked);}
      const url=answer?.feature?.sourceUrl??answer?.sourceUrl??measurement?.feature?.sourceUrl??measurement?.sourceUrl;if(url){const a=el('a','View the source ↗');a.href=url;a.target='_blank';a.rel='noopener noreferrer';detailHost.append(a);}
    });};
    const b=button('',()=>showPriority(b),'priority-tile');b.setAttribute('aria-expanded','false');b.dataset.answerState=answer?.status==='partial'?'partial':distance!==null||answer?.status==='answered'?'answered':'pending';b.append(el('span',label,'priority-title'),el('strong',value,'priority-answer'),el('span','+','priority-open'));left.append(b);
    if(measurement?.feature?.id&&positions.length<6)addCallout(distance!==null?`${(measurement.mode??'walking').replace(/^./,c=>c.toUpperCase())} route`:label,measurement.feature.id,'','priority',showPriority);
  }
  const canRefine=Boolean(result.version?.assessment&&result.parcel&&result.status!=='needs-parcel'&&!result.locality?.boundaryUncertain&&!result.locality?.authorityUnresolved&&!simulationState.busy);
  const add=button('Add a concern +',()=>{form.hidden=!form.hidden;if(!form.hidden)input.focus();},'add-concern');add.disabled=!canRefine;left.append(add);
  const form=el('form',undefined,'priority-refine');form.hidden=!simulationState.question;
  const label=el('label',simulationState.question||'What else matters to you?');label.htmlFor='scenario-refinement';const input=el('textarea');input.id='scenario-refinement';input.rows=3;input.maxLength=600;input.placeholder='For example, how close is the nearest school?';input.value=simulationState.refinement??'';
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
