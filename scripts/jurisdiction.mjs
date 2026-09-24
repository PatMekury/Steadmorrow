// Census geography is an authority-discovery clue, not a legal zoning opinion.
const key=s=>String(s??'').toLowerCase().replace(/[^a-z0-9]/g,'');
export function jurisdictionFromGeographies(g){
  if(!g?.States?.length||!g?.Counties?.length)return null;
  const state=g.States[0],county=g.Counties[0],city=g['Incorporated Places']?.[0],sub=g['County Subdivisions']?.[0];
  const activeSubdivision=['A','B','C'].includes(sub?.FUNCSTAT);
  const authority=city?{name:city.NAME||city.BASENAME,base:city.BASENAME,id:city.GEOID,type:'municipality'}:
    activeSubdivision?{name:sub.NAME,base:sub.BASENAME,id:sub.GEOID,type:'county-subdivision'}:
    county.FUNCSTAT&&!['A','B','C'].includes(county.FUNCSTAT)?null:{name:county.NAME,base:county.BASENAME,id:county.GEOID,type:'county'};
  return {state:state.NAME,stateAbbr:state.STUSAB,stateId:state.STATE,county:county.NAME,countyBase:county.BASENAME,countyId:county.GEOID,countyFunctionalStatus:county.FUNCSTAT??null,
    city:city?.BASENAME??null,cityId:city?.GEOID??null,subdivision:sub?.NAME??null,subdivisionBase:sub?.BASENAME??null,subdivisionId:sub?.GEOID??null,subdivisionFunctionalStatus:sub?.FUNCSTAT??null,
    authority,authorityUnresolved:!authority,label:[authority?.name||sub?.NAME||county.NAME,state.STUSAB].join(', ')};
}
export function localityNames(locality){
  return [...new Set([locality.city,['A','B','C'].includes(locality.subdivisionFunctionalStatus)?locality.subdivisionBase:null,locality.countyBase,locality.state].filter(Boolean))];
}
export function authorityNames(locality){
  if(locality.authorityUnresolved)return [];
  const a=locality.authority;
  if(!a)return [locality.city||locality.county].filter(Boolean);
  const names=[a.name];
  if(a.type==='municipality')names.push(a.base);
  // Publisher directories use both "Example town" and "Town of Example".
  const type=String(a.name).slice(String(a.base).length).trim();
  if(type)names.push(`${type} of ${a.base}`,`${a.base}, ${type}`);
  return [...new Set(names.filter(Boolean).map(key))];
}
export function matchesAuthority(name,locality){
  return authorityNames(locality).some(n=>key(n)===key(name));
}
export function sameJurisdiction(a,b){
  return Boolean(a&&b&&a.stateId===b.stateId&&a.countyId===b.countyId&&a.cityId===b.cityId&&
    (!['A','B','C'].includes(a.subdivisionFunctionalStatus)&&!['A','B','C'].includes(b.subdivisionFunctionalStatus)||a.subdivisionId===b.subdivisionId));
}
