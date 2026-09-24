const el=(tag,text,className)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;};
const formatArea=value=>`${new Intl.NumberFormat(undefined,{maximumFractionDigits:0}).format(value)} m²`;
const date=value=>value?new Date(value).toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'}):'Date not supplied';
function sourceDetail(source,quote){
  const detail=el('details',undefined,'evidence-source');
  detail.append(el('summary',source.section||source.title));
  const link=el('a','Open source ↗');link.href=source.url;link.target='_blank';link.rel='noopener noreferrer';
  detail.append(el('p',`${source.publisher} · Retrieved ${date(source.retrievedAt)}`,'evidence-meta'));
  if(source.publication)detail.append(el('p',source.publication,'evidence-meta'));
  else if(source.sourceUpdatedAt)detail.append(el('p',`Source updated ${date(source.sourceUpdatedAt)}`,'evidence-meta'));
  if(quote)detail.append(el('blockquote',quote));
  else if(source.kind!=='code-provision')detail.append(el('p',source.kind==='mapped-record'?'Public mapping record. It is not a surveyed boundary or proof of title.':source.text));
  if(source.truncated)detail.append(el('p','Only part of this section was retrieved. Open the source for the complete provision.','evidence-meta'));
  if(source.amendmentsPending)detail.append(el('p','The publisher flags an amendment. Its effect requires review.','evidence-meta'));
  if(source.calculation)detail.append(el('p',source.calculation,'evidence-meta'));
  if(source.attribution)detail.append(el('p',source.attribution,'evidence-meta'));
  detail.append(link);return detail;
}
function support(container,items,sources){
  for(const item of items??[]){const source=sources.find(s=>s.id===item.sourceId);if(source)container.append(sourceDetail(source,item.quote));}
}
function finding(title,summary){
  const details=el('details',undefined,'finding-row'), heading=el('summary');
  heading.append(el('span',title,'finding-label'),el('span',summary,'finding-summary'),el('span','+','finding-toggle'));
  heading.lastChild.setAttribute('aria-hidden','true');details.append(heading);
  const body=el('div',undefined,'finding-detail');details.append(body);return {details,body};
}
function diagram(result){
  if(!result.parcel)return null;
  const shapes=[result.parcel.geometry,result.selectedArea.geometry];
  const points=shapes.flatMap(m=>m.flatMap(p=>p.flatMap(r=>r)));
  if(!points.length)return null;
  const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),cos=Math.cos(ys[0]*Math.PI/180);
  const minX=Math.min(...xs),maxY=Math.max(...ys);
  const width=(Math.max(...xs)-minX)*cos,height=maxY-Math.min(...ys),scale=Math.min(720/Math.max(width,.000001),270/Math.max(height,.000001));
  const xOffset=(760-width*scale)/2,yOffset=(310-height*scale)/2;
  const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 760 310');svg.setAttribute('role','img');svg.setAttribute('aria-label','Mapped parcel boundary and your selected exploration area');
  shapes.forEach((multi,i)=>{
    const path=document.createElementNS(ns,'path');let d='';
    for(const poly of multi)for(const ring of poly)d+=ring.map(([x,y],j)=>`${j?'L':'M'}${((x-minX)*cos*scale+xOffset).toFixed(2)},${((maxY-y)*scale+yOffset).toFixed(2)}`).join(' ')+' Z ';
    path.setAttribute('d',d);path.setAttribute('fill-rule','evenodd');path.setAttribute('class',i?'evidence-area':'evidence-parcel');svg.append(path);
  });
  const figure=el('figure',undefined,'evidence-diagram');figure.append(svg,el('figcaption','Dark outline: mapped parcel · Blue: your selected area. North is up. Mapping is not a survey.'));return figure;
}

export function renderFindings(container,result,{onParcel}={}){
  container.replaceChildren();
  const label=result.locality?.label??'Location unresolved';
  const meta=el('p',`${label} · ${date(result.generatedAt)}`,'findings-location');container.append(meta);
  let headline=result.assessment?.headline,summary=result.assessment?.summary;
  if(result.assessment&&result.assessmentScope==='local-rules')headline=result.parcel?'Local rules found; site applicability needs checking.':'Local rules found; the parcel still needs matching.';
  if(result.researchError==='local-call-limit'){headline='Property research is paused.';summary='The local Gloo call budget was reached. This does not mean public records are missing. Your area and priorities are saved.';}
  if(!headline){
    if(result.status==='needs-parcel'){headline='First, confirm the parcel.';summary='Your outline overlaps more than one property record. Choose the parcel you want to explore.';}
    else if(result.status==='unavailable'){headline='The local records could not be established.';summary='No housing permission or capacity has been inferred for this area.';}
    else if(result.locality?.boundaryUncertain){headline='The planning authority needs confirming.';summary=result.locality.boundaryLookupIncomplete?'The location is known, but a corner lookup failed. The authority for the whole area remains unconfirmed.':'The selected area crosses a mapped jurisdiction boundary. One authority’s rules cannot be applied to the whole site.';}
    else if(result.zones.length>1){headline='This site crosses zoning districts.';summary='We found different zoning designations across the mapped site. Confirm which rules govern the housing area before comparing possibilities.';}
    else if(result.planningSystem?.type==='no-zoning'){headline=result.parcel?'Development rules apply here.':'Local development rules found; parcel matching is incomplete.';summary='The municipality confirms it has no zoning. Its development regulations still apply; no building approval has been established.';}
    else if(result.code.length){headline=result.parcel?'Local provisions found; the housing route needs review.':'Local rules found; the parcel still needs matching.';summary='Published provisions are available. Their application to this property has not been established.';}
    else {headline='There is more to check before a housing assessment.';summary=result.parcel?'We found a parcel record, but the governing housing provisions remain unresolved.':'The available records do not yet establish a reliable parcel and housing route.';}
  }
  container.append(el('p',result.narrativeStatus==='ready'?(result.assessmentScope==='local-rules'?'Local rules · property checks incomplete':'Preliminary assessment'):'Available findings · checks remain','findings-kicker'),el('h3',headline,'findings-answer'),el('p',summary,'findings-answer-text'));
  if(result.assessment?.support?.length){const cited=el('div',undefined,'assessment-sources');support(cited,result.assessment.support,result.sources);container.append(cited);}
  if(result.status==='needs-parcel'){
    const choices=el('div',undefined,'parcel-choices');
    for(const parcel of result.parcelCandidates){const button=el('button',undefined,'parcel-choice');button.type='button';button.append(el('span',parcel.address||`Parcel ${parcel.id}`),el('small',`${parcel.id} · ${formatArea(parcel.mappedSquareMeters)} mapped area`));button.addEventListener('click',()=>onParcel?.(parcel.key));choices.append(button);}
    container.append(choices);
  }
  const rows=el('div',undefined,'finding-rows');
  const property=finding('The land we checked',result.parcel?`${result.parcel.address||`Parcel ${result.parcel.id}`} · ${formatArea(result.parcel.mappedSquareMeters)} mapped parcel area.`:'A confirmed parcel match is still needed.');
  if(result.parcel){
    property.body.append(el('p',`Parcel identifier: ${result.parcel.id}. Your marked area: ${formatArea(result.selectedArea.squareMeters)}. These areas are different measures; the marked outline is not a new legal lot.`));
    const visual=diagram(result);if(visual)property.body.append(visual);
  }
  property.body.append(el('p','Ownership, vacancy and authority to use the land have not been verified.'));
  for(const id of ['parcel','jurisdiction']){const s=result.sources.find(s=>s.id===id);if(s)property.body.append(sourceDetail(s));}
  rows.append(property.details);
  const zoning=finding('What the rules say',result.findings?.[0]?.summary??(result.planningSystem?.type==='no-zoning'?'The municipality confirms it has no zoning. Development regulations still govern the site.':result.zones.length?`The mapped district${result.zones.length>1?'s are':' is'} ${result.zones.map(z=>z.id).join(', ')}. ${result.code.length?'Published code sections are available below.':'Housing permission still needs checking against the code.'}`:'The local planning controls have not yet been fully established.'));
  const planningSource=result.sources.find(s=>s.id==='planning-system');if(planningSource)zoning.body.append(sourceDetail(planningSource,planningSource.statement));
  for(const item of result.findings??[]){zoning.body.append(el('h4',item.heading),el('p',item.summary));support(zoning.body,item.support,result.sources);}
  for(const issue of result.codeAccess??[]){const note=el('p','The published code could not be retrieved automatically. '),link=el('a','Open the publisher’s code ↗');link.href=issue.url;link.target='_blank';link.rel='noopener noreferrer';note.append(link);zoning.body.append(note);}
  const mapSource=result.sources.find(s=>s.id==='zoning');if(mapSource)zoning.body.append(sourceDetail(mapSource));
  if(result.code.length){const sections=el('details',undefined,'code-sections');sections.append(el('summary',`${result.code.length} retrieved code sections`));for(const s of result.sources.filter(s=>s.kind==='code-provision'))sections.append(sourceDetail(s));zoning.body.append(sections);}
  zoning.body.append(el('p','A district label is not permission to build. Special conditions, later amendments and approvals may change the route.'));
  rows.append(zoning.details);
  const h=result.housing;
  const housing=finding('Housing pressure nearby',h?`About ${h.percent}% of renter households in ${h.geography} spent at least 30% of income on rent.`:'Local housing estimates could not be retrieved.');
  if(h){
    housing.body.append(el('p',`ACS ${h.period} five-year estimates. This includes renter households whose rent-to-income ratio could be calculated. It does not establish demand for this particular site.`));
    if(h.medianRent!==null)housing.body.append(el('p',`Estimated median gross rent: $${h.medianRent.toLocaleString()}${h.medianRentMargin!==null?` (margin of error ±$${h.medianRentMargin.toLocaleString()})`:''}. This is an area-wide historical estimate, not a proposed affordable rent.`));
    const s=result.sources.find(s=>s.id==='housing');if(s)housing.body.append(sourceDetail(s));
  }else housing.body.append(el('p','We have not inferred local need from a church name, an address or the appearance of the land.'));
  rows.append(housing.details);container.append(rows);
  const main=result.gaps[0];
  if(main){const gap=el('aside',undefined,'findings-open-question');gap.append(el('p','What could change the answer','findings-kicker'),el('h4',main.title),el('p',main.detail),el('p',main.next,'finding-next-check'));container.append(gap);}
  const remaining=el('details',undefined,'findings-more');remaining.append(el('summary','Obstacles and remaining checks'));
  for(const item of result.obstacles??[]){remaining.append(el('h4',item.heading),el('p',item.consequence),el('p',item.nextStep));support(remaining,item.support,result.sources);}
  for(const item of result.gaps.slice(1)){remaining.append(el('h4',item.title),el('p',item.detail),el('p',item.next,'finding-next-check'));}
  const checks=el('ul',undefined,'evidence-checks');for(const check of result.checks)checks.append(el('li',`${check.name}: ${check.status.replaceAll('-',' ')}`));remaining.append(checks);container.append(remaining);
  if(result.narrativeMessage)container.append(el('p',result.narrativeMessage,'findings-attribution'));
  container.append(el('p',`${result.narrativeStatus==='ready'?'Researched and interpreted with Gloo AI. ':''}Preliminary research for discussion. Home count, buildability and financial feasibility have not been established.`, 'findings-attribution'));
}
