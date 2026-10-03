const note={type:'string',minLength:1,maxLength:500};
const ref={type:'object',additionalProperties:false,required:['sourceId','passageId'],properties:{sourceId:{type:'string'},passageId:{type:'string'}}};
export const designBriefSchema={type:'object',additionalProperties:false,required:['household','basis','rooms_per_home','interior_reserve_percent','floor_structure_meters','standards','unresolved_checks'],properties:{
  household:note,basis:note,
  rooms_per_home:{type:'object',description:'Areas in square metres inside ONE home. Do not multiply by the number of homes. Each bedroom array entry is one bedroom, not a whole dwelling.',additionalProperties:false,required:['bedroom_areas_m2','living_dining_m2','kitchen_m2','bathrooms_m2','storage_m2','other_m2'],properties:{bedroom_areas_m2:{type:'array',maxItems:6,items:{type:'number',minimum:4,maximum:40}},living_dining_m2:{type:'number',minimum:5,maximum:100},kitchen_m2:{type:'number',minimum:3,maximum:40},bathrooms_m2:{type:'number',minimum:3,maximum:40},storage_m2:{type:'number',minimum:1,maximum:40},other_m2:{type:'number',minimum:0,maximum:80}}},
  interior_reserve_percent:{type:'number',minimum:15,maximum:45,description:'Per home allowance for walls, hallways and stairs; separate from apartment shared circulation.'},
  floor_structure_meters:{type:'number',minimum:.2,maximum:.6,description:'Assumed depth of floors/ceilings, not clear room height.'},
  standards:{type:'array',maxItems:20,items:{type:'object',additionalProperties:false,required:['requirement','scope','applicability','metric','value','unit','support'],properties:{requirement:note,scope:{type:'string',enum:['applicable','program-benchmark','unresolved']},applicability:note,metric:{type:'string',enum:['home-area-min','bedroom-area-min','clear-height-min','building-height-max','edge-clearance-min','building-spacing-min','parking-width-min','parking-depth-min','parking-aisle-min','other'],description:'Use a numeric metric ONLY for a known source-stated number for that EXACT measured object. home-area-min means one dwelling, never site/lot area. building-spacing-min means gap between buildings, never street width or frontage. Site/lot/frontage standards use other and remain listed checks. Unknown or nonnumeric requirements use other, value 0, unit not-numeric; explain the missing check.'},value:{type:'number',minimum:0,maximum:100000},unit:{type:'string',enum:['sq-ft','sq-m','feet','meters','not-numeric']},support:{type:'array',minItems:1,maxItems:4,items:ref}}}},
  unresolved_checks:{type:'array',minItems:1,maxItems:12,items:note}
}};
export function validateDesignBrief(raw,sources){
  if(!raw)throw Error('Plan the homes before packing the land: supply a design_brief with the intended households, rooms, space for walls/stairs, sourced local requirements and precise unknowns.');
  const validate=(schema,value)=>{
    const type=schema.type;
    if(type==='object'){
      if(!value||Array.isArray(value)||typeof value!=='object'||schema.required.some(k=>!Object.hasOwn(value,k))||Object.keys(value).some(k=>!Object.hasOwn(schema.properties,k)))throw Error('Supply every home-design field using only the offered fields.');
      for(const [key,item]of Object.entries(value))validate(schema.properties[key],item);
    }else if(type==='array'){
      if(!Array.isArray(value)||value.length<(schema.minItems??0)||value.length>(schema.maxItems??100))throw Error('Use the stated bounds for home-design lists.');
      for(const item of value)validate(schema.items,item);
    }else if(type==='string'){
      if(typeof value!=='string'||!value.trim()||value.length>(schema.maxLength??500)||schema.enum&&!schema.enum.includes(value)||/<[^>]+>|https?:\/\//i.test(value))throw Error('Use concise plain text and offered categories in the home design.');
    }else if(!Number.isFinite(value)||value<(schema.minimum??-Infinity)||value>(schema.maximum??Infinity)||type==='integer'&&!Number.isInteger(value))throw Error('Use finite home-design numbers within the stated bounds.');
  };
  validate(designBriefSchema,raw);
  const support=[];
  const standards=raw.standards.map(rule=>{
    const refs=rule.support.map(r=>{const s=sources.find(s=>s.id===r.sourceId&&!s.scopeConflict),p=s?.passages?.find(p=>p.id===r.passageId);if(!p)throw Error('Home design needs an actual current source passage.');const q={sourceId:s.id,quote:p.text};support.push(q);return q;});
    if(rule.metric!=='other'){
      if(rule.metric==='edge-clearance-min'&&/\b(?:street|road|thoroughfare|frontage|front yard)\b/i.test(rule.requirement+' '+rule.applicability+' '+refs.map(r=>r.quote).join(' ')))throw Error('A street/frontage building line cannot be checked as a uniform clearance from EVERY parcel edge. Keep that original requirement as metric other with a precise unresolved frontage/applicability check. Use edge-clearance-min only for an established uniform all-edge clearance; do not discard the cited building-line requirement.');
      const area=rule.metric.includes('area');if(!(area?['sq-ft','sq-m']:['feet','meters']).includes(rule.unit)||rule.value<=0)throw Error('Numeric standard '+rule.requirement+' needs a positive original-source value in matching area or length units. Unknown/nonnumeric requirements use metric other, value 0, unit not-numeric; do not supply a fake numeric minimum.');
      const values=refs.flatMap(r=>r.quote.replace(/(?<=\d),(?=\d{3})/g,'').match(/\d+(?:\.\d+)?/g)??[]).map(Number);
      if(!values.includes(rule.value))throw Error('The numeric design standard must appear in its original cited passage; do not invent a minimum.');
    }
    return {...rule,support:refs};
  });
  const rooms=[...raw.rooms_per_home.bedroom_areas_m2.map((area,i)=>({name:'Bedroom '+(i+1),use:'sleeping',count:1,area_m2:area})),...Object.entries({living_dining_m2:['Living and dining','living'],kitchen_m2:['Kitchen','kitchen'],bathrooms_m2:['Bathrooms','bathroom'],storage_m2:['Storage','storage'],other_m2:['Other rooms','other']}).map(([key,[name,use]])=>({name,use,count:1,area_m2:raw.rooms_per_home[key]}))];
  for(const rule of standards.filter(r=>r.metric==='bedroom-area-min'&&r.scope!=='unresolved')){const min=rule.value*(rule.unit==='sq-ft'?.09290304:1);if(rooms.some(r=>r.use==='sleeping'&&r.area_m2+.001<min))throw Error('The bedroom allowance is below the cited '+rule.requirement+'. Each bedroom needs at least '+min.toFixed(2)+' square metres under this chosen standard. Increase its allowance before testing.');}
  const roomArea=rooms.reduce((n,r)=>n+r.count*r.area_m2,0);
  return {minimumAllocatedAreaPerHomeSquareMeters:roomArea/(1-raw.interior_reserve_percent/100),household:raw.household,bedrooms:raw.rooms_per_home.bedroom_areas_m2.length,basis:raw.basis,rooms,interiorReservePercent:raw.interior_reserve_percent,floorStructureMeters:raw.floor_structure_meters,standards,unresolvedChecks:raw.unresolved_checks,support:[...new Map(support.map(s=>[JSON.stringify(s),s])).values()]};
}
export function checkHomeDesign(p,brief){
  if(!brief)throw Error('A home-size brief must be reviewed before testing a layout.');
  const perHome=p.typology==='apartment'?p.unit_area:p.width*p.depth*p.storeys;
  const usable=perHome*(1-brief.interiorReservePercent/100),roomArea=brief.rooms.reduce((n,r)=>n+r.area_m2*r.count,0);
  if(roomArea>usable+.001)throw Error(`This layout leaves ${usable.toFixed(1)} square metres for rooms, below the agreed ${roomArea.toFixed(1)}. ${p.typology==='apartment'?'unit_area must be':'width × depth × storeys must be at least'} ${(Math.ceil(brief.minimumAllocatedAreaPerHomeSquareMeters*100)/100).toFixed(2)} square metres per home. ${p.typology==='apartment'?'Increasing storeys or home count does NOT increase unit_area. Increase unit_area, then provide sufficient floorplate space.':'Increase footprint or storeys, then test fewer homes if needed.'} Do not shrink the home brief just to fit.`);
  const clearHeight=p.storey_height-Math.min(1.35,p.storeys*p.storey_height*.18)/p.storeys-brief.floorStructureMeters;
  for(const rule of brief.standards){
    if(rule.scope==='unresolved'||rule.metric==='other')continue;
    const value=rule.value*(rule.unit==='sq-ft'?.09290304:rule.unit==='feet'?.3048:1);
    const values={ 'home-area-min':[perHome], 'bedroom-area-min':brief.rooms.filter(r=>r.use==='sleeping').map(r=>r.area_m2), 'clear-height-min':[clearHeight], 'building-height-max':[p.storeys*p.storey_height], 'edge-clearance-min':[p.edge_clearance], 'building-spacing-min':[p.spacing], 'parking-width-min':[p.parking_bay_width??2.6], 'parking-depth-min':[p.parking_bay_depth??5], 'parking-aisle-min':[p.parking_aisle_width??6]}[rule.metric];
    if(values.some(v=>rule.metric.endsWith('-max')?v>value+.001:v+.001<value)){
      const q=value+brief.floorStructureMeters,minHeight=q/.82<=7.5/p.storeys?q/.82:q+1.35/p.storeys;
      throw Error('The test conflicts with its cited design requirement: '+rule.requirement+'. '+(rule.metric==='clear-height-min'?`At ${p.storeys} storeys, use storey_height of at least ${(Math.ceil(minHeight*100)/100).toFixed(2)} metres to leave the required clear height after the roof and floor structure. `:'')+'Revise the layout; retain the requirement and its scope.');
    }
  }
  return {version:1,grossOrAllocatedAreaPerHome:perHome,roomAreaPerHome:roomArea,spaceAfterInteriorReserve:usable,approximateClearHeight:clearHeight,checks:brief.standards.filter(r=>r.scope!=='unresolved').map(r=>r.requirement),limitations:['Room areas are allowances, not a resolved floor plan. Doors, windows, accessible routes and fire escape still need design.','Only the listed numeric requirements were compared. Full building-code compliance and affordable delivery are unverified.']};
}
