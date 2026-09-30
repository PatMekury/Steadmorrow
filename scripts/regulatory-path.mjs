// The selected authority and its publications determine the research path.
// A state name alone never selects a zoning rule or implies permission.
export function explicitNoZoning(text,locality={}){
  const names=[locality.authority?.name,locality.authority?.base,locality.city,locality.authority?.type==='county'?locality.countyBase:null].filter(Boolean);
  for(const name of names){
    const escaped=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const re=new RegExp(`\\b${escaped}\\s+(?:does not have|has no|does not use|has not adopted)\\s+(?:a |any )?(?:(?:citywide|city-wide|comprehensive|traditional|conventional|countywide|county-wide)\\s+)*zoning(?:\\s+ordinance)?\\b`,'i');
    const match=String(text).match(re);if(match)return match[0];
  }
  return null;
}
export function regulatoryPath(evidence={}){
  const locality=evidence.locality??{},system=evidence.planningSystem?.type;
  const uncertain=locality.boundaryUncertain||locality.authorityUnresolved||!locality.authority&&!locality.city&&!locality.county;
  return {system:uncertain?'authority-unresolved':system==='no-zoning'?'development-review':evidence.zones?.length?'zoning':'planning-system-unresolved',authority:locality.authority??null,state:locality.state??null,stateAbbr:locality.stateAbbr??null,county:locality.county??null,
    instructions:uncertain?'Establish the governing authority. Do not substitute another city, county or state.':system==='no-zoning'?'Official evidence confirms an alternative to comprehensive zoning. Retrieve operative new-development/plat/site-plan provisions, relevant residential standards and recorded site restrictions. Do not demand a nonexistent zoning use table. No-zoning guidance alone is not permission.':'Retrieve the selected jurisdiction’s applicable district use provisions and exceptions, then site/development controls. Check state overrides or county/tribal/special authorities where source evidence makes them relevant. Never apply another jurisdiction’s rules.',
    remaining:'Applicability of state law, recorded restrictions, overlays and site-specific approvals is not established by geographic identification alone.'};
}

export function housingEvidenceBasis(support,sources,evidence={}){
  // This is only a coarse source-admissibility check. The separate Gloo audit
  // evaluates claim meaning, triggering conditions and exceptions.
  const countyAuthority=evidence.locality?.authority?.type==='county';
  const cited=support.map(item=>({source:sources.find(s=>s.id===item.sourceId),quote:item.quote})).filter(x=>x.source&&!x.source.scopeConflict&&(x.source.scope!=='county'||countyAuthority)&&x.source.scope!=='state');
  const housing=/\b(?:residential|residences?|dwelling|housing)\b/i;
  const operative=/\b(?:allow(?:ed)?|permit(?:ted|s)?|require(?:d|s)?|shall|must|may be (?:built|constructed|developed))\b|●/i;
  const eligible=cited.filter(({source})=>source.kind==='code-provision'&&!/\b(?:definitions?|purpose|intent|conversion|non.conforming)\b/i.test(source.title));
  if(evidence.planningSystem?.type==='no-zoning'){
    const established=(evidence.planningSystem.sources??[]).some(s=>sources.some(e=>e.id===s.id&&e.kind==='planning-guidance'&&!e.scopeConflict));
    if(!established)return null;
    // A waiver of subdivision requirements is not an affirmative new-housing
    // development path. Do not combine its housing noun with its negated rule.
    const pathway=eligible.some(({quote,source})=>{
      // A section's operative introduction can span the artificial passage's
      // sentence boundary. Parking/height clauses alone are not a use pathway.
      const residentialStandards=/residential.*(?:performance|development) standards/i.test(source.title)&&
        /residential (?:performance|development) standards (?:are as follows|shall apply|apply to)/i.test(quote)&&
        /\b(?:site|development)\b[^.;]{0,90}\b(?:must|shall)\b/i.test(quote)&&
        !/\b(?:not applicable|prohibited|not permitted)\b/i.test(quote);
      return residentialStandards||(quote.match(/[^.!?]+(?:[.!?]|$)/g)??[]).some(clause=>
      !/\b(?:shall|is|are|will|must)\s+not\s+(?:be\s+)?(?:required|permitted|allowed)|\b(?:residential|housing|dwellings?)\b[^.;]{0,60}\bprohibited\b/i.test(clause)&&operative.test(clause)&&(
        housing.test(clause)&&! /\b(?:parking|height|setback|fences?)\b/i.test(clause)&&/\b(?:residential|housing)\s+(?:development|construction)|\b(?:multi.family|multi.unit)\b[^.;]{0,45}\bresidential buildings\b/i.test(clause)||
        /development plat|site.plan|building permit/i.test(clause)&&/new (?:building|structure|construction)|erect|construct|development of/i.test(clause)
      )
    );});
    return pathway?'development-review':null;
  }
  const use=eligible.some(({source,quote})=>/use|residen|dwelling|housing/i.test(source.title)&&!/bulk|floor area|height|setback/i.test(source.title)&&housing.test(quote)&&operative.test(quote)&&!(/(?:residential|dwelling|housing)[^.;]{0,50}(?:prohibited|not permitted|not allowed)/i.test(quote)&&!/(?:allowed|permitted) (?:subject|with|by)/i.test(quote)));
  return use?'zoning-use':null;
}
