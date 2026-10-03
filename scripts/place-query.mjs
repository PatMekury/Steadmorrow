// Gloo supplies bounded OSM selectors, never executable Overpass syntax.
export const destinationProperties={
  kind:{type:'string',minLength:2,maxLength:80,description:'Human-readable destination category, or named place. Not restricted to preset categories.'},
  filters:{type:'array',minItems:1,maxItems:6,description:'Alternative OSM tag groups (OR). Tags within each group all apply (AND). Choose actual mapped tags, e.g. amenity=library, leisure=playground, shop=bakery, social_facility=food_bank.',items:{type:'object',additionalProperties:false,required:['tags'],properties:{tags:{type:'array',minItems:1,maxItems:4,items:{type:'object',additionalProperties:false,required:['key','value'],properties:{key:{type:'string',minLength:1,maxLength:64},value:{type:'string',minLength:1,maxLength:100}}}}}}},
  name_query:{type:'string',minLength:0,maxLength:120,description:'Use an EMPTY STRING for a category question such as nearest library. Only supply a nonempty value for an actual named destination quoted from the original question, such as Emancipation Park. Never repeat the category as a name. Do not guess a name or address.'}
};
const legacy={school:'amenity',police:'amenity',hospital:'amenity',clinic:'amenity',pharmacy:'amenity',supermarket:'shop',bus_stop:'highway'};
const literal=s=>typeof s==='string'&&s.trim()===s&&!/[\x00-\x1f\x7f]/.test(s);
export function destinationSearch({kind,filters,name_query}={}){
  if(name_query==='')name_query=undefined;
  if(!literal(kind)||kind.length<2||kind.length>80)throw new Error('Supply a bounded destination category.');
  if(name_query!==undefined&&(!literal(name_query)||name_query.length<2||name_query.length>120))throw new Error('Supply a literal place name.');
  const groups=filters??(legacy[kind]?[{tags:[{key:legacy[kind],value:kind}]}]:[]);
  if(!Array.isArray(groups)||groups.length>6||(!groups.length&&!name_query)||filters&&groups.length===0)throw new Error('Choose OSM tag filters or a literal destination name for this category.');
  for(const group of groups){
    if(!group||Object.keys(group).some(k=>k!=='tags')||!Array.isArray(group.tags)||!group.tags.length||group.tags.length>4)throw new Error('Invalid destination tag group.');
    for(const tag of group.tags)if(!tag||Object.keys(tag).some(k=>!['key','value'].includes(k))||!literal(tag.key)||!/^[a-zA-Z0-9_:]{1,64}$/.test(tag.key)||!literal(tag.value)||!tag.value||tag.value.length>100)throw new Error('Invalid literal destination tag.');
  }
  return {kind,filters:groups.map(g=>({tags:g.tags.map(t=>({...t})).sort((a,b)=>a.key.localeCompare(b.key)||a.value.localeCompare(b.value))})).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))),name_query:name_query??null};
}
const escapeRegex=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
export function placeQuery(search,origin,radius){
  const names=search.name_query?['name','brand','operator']:[''];
  const groups=search.filters.length?search.filters:[{tags:[]}];
  const clauses=groups.flatMap(g=>names.map(name=>'nwr'+g.tags.map(t=>'['+JSON.stringify(t.key)+'='+JSON.stringify(t.value)+']').join('')+(name?'['+JSON.stringify(name)+'~'+JSON.stringify(escapeRegex(search.name_query))+',i]':'')+`(around:${radius},${origin[1].toFixed(7)},${origin[0].toFixed(7)});`));
  return '[out:json][timeout:12][maxsize:16777216];('+clauses.join('')+');out geom;';
}
export function matchesDestination(tags,search){
  return !!tags&&(!search.filters.length||search.filters.some(g=>g.tags.every(t=>tags[t.key]===t.value)))&&(!search.name_query||['name','brand','operator'].some(k=>String(tags[k]??'').toLocaleLowerCase().includes(search.name_query.toLocaleLowerCase())));
}
