const el=(tag,text,className)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;};
const formatArea=value=>`${new Intl.NumberFormat(undefined,{maximumFractionDigits:0}).format(value)} m²`;
const date=value=>value?new Date(value).toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'}):'Date not supplied';
function sourceDetail(source,quote){
  const detail=el('details',undefined,'evidence-source');detail.dataset.evidenceKey=source.id+':'+(quote??'').slice(0,40);
  detail.append(el('summary',source.section||source.title));
  const link=el('a','Open source ↗');link.href=source.url;link.target='_blank';link.rel='noopener noreferrer';
  detail.append(el('p',`${source.publisher} · Retrieved ${date(source.retrievedAt)}`,'evidence-meta'));
  if(source.publication)detail.append(el('p',source.publication,'evidence-meta'));
  else if(source.sourceUpdatedAt)detail.append(el('p',`Source updated ${date(source.sourceUpdatedAt)}`,'evidence-meta'));
  if(quote)detail.append(el('blockquote',quote));
  else if(source.kind!=='mapped-record')detail.append(el('p',source.text));
  if(source.truncated)detail.append(el('p','Only part of this section was retrieved. Open the source for the complete provision.','evidence-meta'));
  if(source.amendmentsPending)detail.append(el('p','The publisher flags an amendment. Its effect requires review.','evidence-meta'));
  if(source.calculation)detail.append(el('p',source.calculation,'evidence-meta'));
  if(source.attribution)detail.append(el('p',source.attribution,'evidence-meta'));
  detail.append(link);return detail;
}
function support(container,items,sources){
  for(const item of items??[]){const source=sources.find(s=>s.id===item.sourceId);if(source)container.append(sourceDetail(source,item.quote));}
}
function disclosure(label,key){const d=el('details',undefined,'findings-detail');d.dataset.evidenceKey=key;d.append(el('summary',label));return d;}
function spatialText(result){
  const zones=(result.spatial?.zones??[]).filter(z=>z.selectedSquareMeters>.5);
  if(!result.parcel)return 'Your blue outline shows the land you selected. A matching property boundary has not arrived yet.';
  if(result.spatial?.selectedParcelCoverage<.98)return 'Part of your selection extends beyond this parcel. Only the overlapping land belongs to this mapped record.';
  if(zones.length===1&&result.spatial.selectedZoningCoverage>=.98)return `Your selected area falls in ${zones[0].id}.${result.zones.length>1?' A different district covers another part of the parcel.':''} The diagram shows where the mapped rules change.`;
  if(zones.length>1)return `Your selected area crosses ${zones.map(z=>z.id).join(' and ')}. The dividing line matters when applying the housing rules.`;
  return 'The blue area is the portion you selected within the property context. The housing rules for that portion are still being checked.';
}
function siteView(result){
  const parcel=result.parcel?.geometry,selection=result.selectedArea?.geometry;
  if(!selection)return null;
  const shapes=[parcel,selection].filter(Boolean),points=shapes.flat(3);
  const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
  const cos=Math.cos(ys[0]*Math.PI/180),minX=Math.min(...xs),maxY=Math.max(...ys);
  const width=(Math.max(...xs)-minX)*cos,height=maxY-Math.min(...ys);
  const scale=Math.min(400/Math.max(width,.000001),270/Math.max(height,.000001));
  const x0=(480-width*scale)/2,y0=(320-height*scale)/2;
  const pathData=multi=>multi.map(poly=>poly.map(ring=>ring.map(([x,y],j)=>`${j?'L':'M'}${((x-minX)*cos*scale+x0).toFixed(2)},${((maxY-y)*scale+y0).toFixed(2)}`).join(' ')+' Z').join(' ')).join(' ');
  const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');
  svg.setAttribute('viewBox','0 0 480 320');svg.setAttribute('role','img');svg.setAttribute('aria-label','Property plan: mapped parcel, selected land, and retrieved zoning boundaries. North is up.');
  const draw=(shape,cls)=>{const p=document.createElementNS(ns,'path');p.setAttribute('d',pathData(shape));p.setAttribute('class',cls);p.setAttribute('fill-rule','evenodd');svg.append(p);return p;};
  if(parcel)draw(parcel,'site-parcel');
  const zonePaths=[];
  for(const [i,z] of (result.spatial?.zones??[]).entries())if(z.geometry?.length){const p=draw(z.geometry,`site-zone site-zone-${i%3}`);p.dataset.zone=z.id;zonePaths.push(p);}
  if(parcel)draw(parcel,'site-boundary');
  draw(selection,'site-selection');
  for(const [x,y] of selection[0][0].slice(0,-1)){const c=document.createElementNS(ns,'circle');c.setAttribute('cx',((x-minX)*cos*scale+x0).toFixed(2));c.setAttribute('cy',((maxY-y)*scale+y0).toFixed(2));c.setAttribute('r','3.5');c.setAttribute('class','site-corner');svg.append(c);}
  const label=(x,y,text)=>{const t=document.createElementNS(ns,'text');t.setAttribute('x',x);t.setAttribute('y',y);t.textContent=text;svg.append(t);};label(918,30,'N ↑');
  const metresPerPixel=111195/scale,barMetres=10**Math.floor(Math.log10(130*metresPerPixel));
  const bar=document.createElementNS(ns,'path');bar.setAttribute('d',`M32 282v5h${(barMetres/metresPerPixel).toFixed(1)}v-5`);bar.setAttribute('class','site-scale');svg.append(bar);label(32,306,`${barMetres} m`);
  const figure=el('figure',undefined,'site-view'),legend=el('figcaption',undefined,'site-legend');
  legend.append(el('span',`Selected land · ${formatArea(result.selectedArea.squareMeters)}`,'legend-selected'));
  if(result.parcel)legend.append(el('span',`Mapped parcel · ${formatArea(result.parcel.mappedSquareMeters)}`,'legend-parcel'));
  figure.append(svg,legend);
  const explanation=el('p',spatialText(result),'site-explanation'),controls=el('div',undefined,'site-controls');
  for(const z of result.spatial?.zones??[]){
    const b=el('button',z.id,'site-zone-button');b.type='button';b.setAttribute('aria-pressed','false');
    b.addEventListener('click',()=>{const selected=b.getAttribute('aria-pressed')!=='true';for(const button of controls.children)button.setAttribute('aria-pressed',String(selected&&button===b));zonePaths.forEach(p=>p.classList.toggle('is-dimmed',selected&&p.dataset.zone!==z.id));explanation.textContent=selected?`${z.id} covers ${formatArea(z.parcelSquareMeters)} of the mapped parcel${z.selectedSquareMeters>.5?` and ${formatArea(z.selectedSquareMeters)} of your selected area`:`, outside your selected area`}. These are map intersections; the original provisions below establish what that designation means.`:spatialText(result);});controls.append(b);
  }
  if(controls.children.length)figure.append(controls);
  figure.append(explanation);return figure;
}
function pendingAssessment(r){
  if(r.status==='needs-parcel')return ['Which property are you exploring?','Your selection crosses more than one mapped property. Choose the relevant parcel to keep its rules and development separate.'];
  if(r.locality?.boundaryUncertain)return ['The authority for this area needs resolving',r.locality.boundaryLookupIncomplete?'A location lookup failed for part of the outline. The retrieved parcel remains visible, but one authority’s rules cannot yet be applied to the whole area.':'The outline crosses a mapped government boundary. Housing rules may differ across it.'];
  if(r.parcel)return [r.narrativeStatus==='researching'?'The property is matched. Checking the housing route…':'The land is matched; housing permission is unresolved',r.narrativeStatus==='researching'?'The parcel and your selected portion are shown above. Gloo is reading the provisions that determine whether new housing can be considered here.':`The mapped record identifies ${r.parcel.address||'this property'}. ${r.codeAccess?.length?'The authority’s code publisher could not be read, so its residential-use conditions remain unknown.':'The retrieved evidence does not yet establish a residential-use route for the selected land.'}`];
  return ['Locating the property and its housing rules',r.narrativeStatus==='researching'?'Gloo is selecting public sources for this location. Verified property evidence will appear here as it arrives.':'The available sources did not establish the property boundary. Return to the map to check the selected land, or retry the public records.'];
}
export function renderFindings(container,result,{onParcel}={}){
  const focused=document.activeElement?.closest('details')?.dataset.evidenceKey;
  const opened=new Set([...container.querySelectorAll('details[open]')].map(d=>d.dataset.evidenceKey));
  const sources=result.sources??[];
  container.replaceChildren();
  const identity=el('header',undefined,'property-identity');identity.append(el('h3',result.parcel?.address||'Your selected land','property-address'),el('p',[result.locality?.label, result.parcel?`Parcel ${result.parcel.id}`:null].filter(Boolean).join(' · '),'findings-location'));
  container.append(identity);
  const visual=siteView(result);if(visual)container.append(visual);
  const fallback=pendingAssessment(result);
  const assessment=el('section',undefined,'housing-assessment');assessment.append(el('p','Affordable housing · first assessment','findings-kicker'),el('h3',result.assessment?.headline||fallback[0],'findings-answer'),el('p',result.assessment?.summary||fallback[1],'findings-answer-text'));
  if(result.assessment?.support?.length){const why=disclosure('Why this assessment','assessment');support(why,result.assessment.support,sources);assessment.append(why);}
  container.append(assessment);
  if(result.status==='needs-parcel'){
    const choices=el('div',undefined,'parcel-choices');for(const p of result.parcelCandidates??[]){const b=el('button',undefined,'parcel-choice');b.type='button';b.append(el('span',p.address||`Parcel ${p.id}`),el('small',`${p.id} · ${formatArea(p.mappedSquareMeters)}`));b.addEventListener('click',()=>onParcel?.(p.key));choices.append(b);}container.append(choices);
  }
  if(result.findings?.length){const reasons=el('div',undefined,'assessment-reasons');for(const f of result.findings){const row=el('section');row.append(el('h4',f.heading),el('p',f.summary));const why=disclosure('Read the supporting provision','finding-'+f.heading);support(why,f.support,sources);row.append(why);reasons.append(row);}container.append(reasons);}
  if(result.obstacles?.length){const next=el('section',undefined,'assessment-decision'),o=result.obstacles[0];next.append(el('p','The next useful step','findings-kicker'),el('h4',o.heading),el('p',o.consequence),el('p',o.nextStep,'decision-action'));const why=disclosure('Evidence for this step','next-step');support(why,o.support,sources);next.append(why);if(result.obstacles.length>1){const more=disclosure('One further condition','further-condition');const other=result.obstacles[1];more.append(el('h4',other.heading),el('p',other.consequence),el('p',other.nextStep));support(more,other.support,sources);next.append(more);}container.append(next);}
  const records=disclosure('Property evidence & sources','records');
  if(result.selectedArea?.geometry){const coordinates=disclosure('Selected corner coordinates','coordinates');coordinates.append(el('p',result.selectedArea.geometry[0][0].slice(0,-1).map(([lng,lat])=>lat.toFixed(8)+', '+lng.toFixed(8)).join(' · '),'selection-coordinates'));records.append(coordinates);}
  if(result.parcel){records.append(el('p',`Mapped parcel ${result.parcel.id}: ${formatArea(result.parcel.mappedSquareMeters)}. Selected land: ${formatArea(result.selectedArea.squareMeters)}.`));const table=el('dl',undefined,'property-fields');for(const [field,value] of Object.entries(result.parcel.attributes??{}).filter(([k])=>/bbl|lotarea|bldgarea|numbldgs|builtfar|residfar|spdist|histdist|landmark|zonedist/i.test(k))){table.append(el('dt',field),el('dd',value));}records.append(table);}
  for(const s of sources.filter(s=>s.id!=='housing'))records.append(sourceDetail(s));
  for(const issue of [...(result.codeAccess??[]),...(result.retrievalFailures??[])]){
    const p=el('p',`${issue.name||'Code publication'}: ${issue.status?.replaceAll('-',' ')||issue.message||'could not be read'}. `);
    if(/^https:\/\//.test(issue.url??'')){const a=el('a','Open official source ↗');a.href=issue.url;a.target='_blank';a.rel='noopener noreferrer';p.append(a);}records.append(p);
  }
  if(sources.length)container.append(records);
  const cited=new Set([...(result.assessment?.support??[]),...(result.findings??[]).flatMap(f=>f.support??[]),...(result.obstacles??[]).flatMap(o=>o.support??[])].map(s=>s.sourceId));
  if(result.parcel)cited.add('parcel');if(result.zones?.length)cited.add('zoning');
  const printSources=el('section',undefined,'print-sources');printSources.append(el('h4','Evidence links'));
  for(const s of sources.filter(s=>cited.has(s.id))){const p=el('p');p.append(el('strong',s.section||s.title),el('span',` · ${s.publisher} · Retrieved ${date(s.retrievedAt)}`));const a=el('a',s.url);a.href=s.url;p.append(el('br'),a);printSources.append(p);}
  if(cited.size)container.append(printSources);
  if(result.researchError==='local-call-limit')container.append(el('p','The local Gloo call budget is used. These records are retained; further research can resume when the budget becomes available.','findings-attribution'));
  container.append(el('p',`Researched with Gloo AI${result.generatedAt?' · '+date(result.generatedAt):''}`,'findings-attribution'));
  for(const d of container.querySelectorAll('details')){if(opened.has(d.dataset.evidenceKey))d.open=true;if(focused&&d.dataset.evidenceKey===focused)d.querySelector('summary').focus({preventScroll:true});}
}
