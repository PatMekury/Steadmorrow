import clipping from 'polygon-clipping';
import {createHash} from 'node:crypto';

const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0,20);
const area=multi=>multi.reduce((sum,p)=>sum+p.reduce((a,r,i)=>a+(i?-1:1)*Math.abs(r.reduce((s,c,j)=>j?s+r[j-1][0]*c[1]-c[0]*r[j-1][1]:s,0)/2),0),0);
const map=(m,f)=>m.map(p=>p.map(r=>r.map(f)));
const rect=(x,y,w,h)=>[[[[x,y],[x+w,y],[x+w,y+h],[x,y+h],[x,y]]]];
export const layoutRequiredParameters=['width','depth','storeys','storey_height','spacing','edge_clearance','angle','homes','parking_spaces'];
export const layoutParameters={
  width:{type:'number',minimum:4,maximum:40,description:'Metres. Detached/attached: footprint width of one dwelling (maximum 16). Apartment: complete building width.'},
  depth:{type:'number',minimum:5,maximum:40,description:'Metres. Detached/attached: footprint depth of one dwelling (maximum 24). Apartment: complete building depth.'},
  storeys:{type:'integer',minimum:1,maximum:3},storey_height:{type:'number',minimum:2.6,maximum:4},
  spacing:{type:'number',minimum:2,maximum:15,description:'Assumed spacing between detached blocks, whole attached rows or apartment buildings. Not a legal setback.'},edge_clearance:{type:'number',minimum:1,maximum:20},
  angle:{type:'number',minimum:0,maximum:179},homes:{type:'integer',minimum:1,maximum:80},parking_spaces:{type:'integer',minimum:0,maximum:80},
  typology:{type:'string',enum:['detached','attached','apartment'],description:'Optional; omitted means the previous detached-block study. Select the form based on the person’s intent and observed tests.'},
  homes_per_row:{type:'integer',minimum:2,maximum:8,description:'Required only for attached: target connected dwellings per row, each with the supplied width/depth. A final shorter row can contain at least two dwellings. Omit for other forms; if supplied it is ignored and reported.'},
  units_per_floor:{type:'integer',minimum:1,maximum:8,description:'Required only for apartment: maximum assumed dwelling allocation per floor, before capping to the requested homes. Omit for other forms; if supplied it is ignored and reported.'},
  circulation_percent:{type:'number',minimum:15,maximum:45,description:'Required only for apartment: assumed percentage of every full floor plate reserved for shared circulation, cores, walls and services. No corridor or egress plan is solved. Omit for other forms; if supplied it is ignored and reported.'},
  unit_area:{type:'number',minimum:35,maximum:150,description:'Required only for apartment: assumed square metres allocated per dwelling. The tool checks this area fits after the shared-space reserve. Not a regulatory minimum or a room plan. Omit for other forms; if supplied it is ignored and reported.'},
};
export function validateLayout(args){
  if(!args||typeof args!=='object'||Array.isArray(args)||Object.keys(args).some(k=>!layoutParameters[k]))throw new Error('Use only the supplied layout parameters.');
  const typology=Object.hasOwn(args,'typology')?args.typology:'detached';
  if(!layoutParameters.typology.enum.includes(typology))throw new Error('Invalid layout parameter: typology');
  const extras=typology==='attached'?['homes_per_row']:typology==='apartment'?['units_per_floor','circulation_percent','unit_area']:[];
  const canonical={};
  for(const k of [...layoutRequiredParameters,...extras]){
    if(!Object.hasOwn(args,k))throw new Error(extras.includes(k)?'Supply the explicit '+typology+' assumption: '+k:'Invalid layout parameter: '+k);
    const v=args[k];
    const p=layoutParameters[k];
    if(p.enum?!p.enum.includes(v):!Number.isFinite(v)||v<p.minimum||v>p.maximum||(p.type==='integer'&&!Number.isInteger(v)))throw new Error('Invalid layout parameter: '+k);
    canonical[k]=v;
  }
  // Form-irrelevant optional fields are not assumptions for this test. The
  // canonical object deliberately excludes them before quantities or IDs form.
  canonical.typology=typology;
  if(typology!=='apartment'&&(args.width>16||args.depth>24))throw new Error('Detached and attached home footprints are limited to 16 × 24 m per dwelling.');
  if(typology==='attached'&&args.homes<2)throw new Error('An attached row needs at least two requested homes.');
  if(typology==='apartment'&&args.units_per_floor*args.unit_area>args.width*args.depth*(1-args.circulation_percent/100)+.000001)throw new Error('The assumed apartments do not fit the floor area left after the shared circulation, walls and services reserve. Revise the full footprint, units per floor or unit-area assumption; no room plan has been resolved.');
  return canonical;
}
// Reproducible massing allocation, not a zoning envelope or legal capacity.
// Whole padded buildings/rows must lie within BOTH selection and parcel.
// Polygon clipping retains concavities, interior holes and disjoint pieces.
export function calculateConcept(evidence,input){
  const args=validateLayout(input),form=args.typology;
  const ignoredParameters=Object.keys(input).filter(key=>!Object.hasOwn(args,key)).sort();
  const parameterNotes=ignoredParameters.length?[`Ignored ${ignoredParameters.join(', ')} because they do not apply to the selected ${form} form. The selected form and its required assumptions are unchanged.`]:[];
  if(!evidence.parcel?.geometry?.length||evidence.status==='needs-parcel')throw new Error('Choose a matched parcel before simulating.');
  if(evidence.locality?.boundaryUncertain||evidence.locality?.authorityUnresolved)throw new Error('Resolve the governing authority before simulating.');
  const origin=evidence.selectedArea.geometry[0][0][0],mx=111195*Math.cos(origin[1]*Math.PI/180),my=111195;
  if(mx<10000)throw new Error('This projection is not supported at this latitude.');
  const a=args.angle*Math.PI/180,c=Math.cos(a),s=Math.sin(a);
  const project=([lng,lat])=>{const x=(lng-origin[0])*mx,y=(lat-origin[1])*my;return [x*c+y*s,-x*s+y*c];};
  const unproject=([x,y])=>[origin[0]+(x*c-y*s)/mx,origin[1]+(x*s+y*c)/my];
  const site=clipping.intersection(map(evidence.selectedArea.geometry,project),map(evidence.parcel.geometry,project));
  if(!site.length||area(site)<1)throw new Error('The selected land does not overlap this parcel.');
  const pts=site.flat(2),xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]);
  const x0=Math.min(...xs),y0=Math.min(...ys),x1=Math.max(...xs),y1=Math.max(...ys),margin=args.edge_clearance;
  const rowHomes=form==='attached'?Math.min(args.homes_per_row,args.homes):1;
  const massWidth=args.width*rowHomes,cellW=massWidth+args.spacing,cellH=args.depth+args.spacing;
  if((x1-x0)*(y1-y0)/(cellW*cellH)>20000)throw new Error('Select a smaller exploration area for this concept.');
  const blockedRegions=[];
  for(const feature of evidence.siteContext?.buildings??[]){
    if(!feature.geometry?.length)continue;
    const overlap=clipping.intersection(site,map(feature.geometry,project));
    if(overlap.length&&area(overlap)>.01)blockedRegions.push({id:feature.id,kind:'mapped-building',geometry:map(overlap,unproject),sourceUrl:feature.sourceUrl,label:feature.name??'Mapped existing building'});
  }
  const blocked=blockedRegions.length?clipping.union(...blockedRegions.map(b=>map(b.geometry,project))):[];
  let used=blocked,allocatedHomes=0,massCount=0;const buildings=[],parking=[],maneuver=[];
  const fits=(boundaryCell,collisionCell=boundaryCell)=>Math.abs(area(clipping.intersection(site,boundaryCell))-area(boundaryCell))<.0001&&(!used.length||area(clipping.intersection(used,collisionCell))<.0001);
  const occupy=cell=>{used=used.length?clipping.union(used,cell):cell;};
  // Parking dimensions and manoeuvring are assumptions; road access is unsolved.
  outer:for(let y=y0+margin;y+11+margin<=y1;y+=11+args.spacing){for(let x=x0+margin;x+2.6+margin<=x1;x+=2.6){
    if(parking.length>=args.parking_spaces)break outer;
    const cell=rect(x-margin,y-margin,2.6+2*margin,11+2*margin);
    if(!fits(cell,rect(x,y,2.6,11)))continue;
    occupy(rect(x,y,2.6,11));parking.push({id:'parking-'+(parking.length+1),geometry:map(rect(x,y,2.6,5),unproject)});maneuver.push(map(rect(x,y+5,2.6,6),unproject));
  }}
  outer:for(let y=y0+margin;y+args.depth+margin<=y1;y+=cellH){for(let x=x0+margin;x+args.width+margin<=x1;x+=cellW){
    if(allocatedHomes>=args.homes)break outer;
    const count=form==='attached'?Math.min(rowHomes,args.homes-allocatedHomes):1;
    if(form==='attached'&&count<2)break outer;
    const width=args.width*count,cell=rect(x-margin,y-margin,width+2*margin,args.depth+2*margin),spacingCell=rect(x-args.spacing/2,y-args.spacing/2,width+args.spacing,cellH);
    if(!fits(cell,spacingCell))continue;
    occupy(spacingCell);massCount++;
    for(let home=0;home<count;home++){
      const grossFloorArea=args.width*args.depth*args.storeys;
      const homes=form==='apartment'?Math.min(args.units_per_floor*args.storeys,args.homes-allocatedHomes):1;
      const b={id:(form==='apartment'?'apartment-':'home-')+(buildings.length+1),typology:form,groupId:form==='attached'?'row-'+massCount:null,geometry:map(rect(x+home*args.width,y,args.width,args.depth),unproject),height:args.storeys*args.storey_height,storeys:args.storeys,homes,grossFloorArea};
      if(form==='attached')b.homesInRow=count;
      if(form==='apartment'){
        b.unitAllocationByFloor=Array.from({length:args.storeys},(_,floor)=>Math.max(0,Math.min(args.units_per_floor,homes-floor*args.units_per_floor)));
        b.assumedUnitAreaSquareMeters=args.unit_area;
        b.assumedSharedAreaSquareMeters=grossFloorArea*args.circulation_percent/100;
        b.assumedDwellingAreaSquareMeters=homes*args.unit_area;
        b.unallocatedFloorAreaSquareMeters=Math.max(0,grossFloorArea-b.assumedSharedAreaSquareMeters-b.assumedDwellingAreaSquareMeters);
      }
      buildings.push(b);allocatedHomes+=homes;
    }
  }}
  const footprint=buildings.length*args.width*args.depth,siteArea=area(site),sum=key=>buildings.reduce((total,b)=>total+(b[key]??0),0);
  const metrics={typology:form,buildingMasses:massCount,mappedExistingFootprintSquareMeters:area(blocked),homes:allocatedHomes,requestedHomes:args.homes,parking:parking.length,requestedParking:args.parking_spaces,parkingRequirement:null,footprintSquareMeters:footprint,grossFloorSquareMeters:sum('grossFloorArea'),landOutsideBuildingsSquareMeters:Math.max(0,siteArea-footprint),siteSquareMeters:siteArea,heightMeters:args.storeys*args.storey_height,storeys:args.storeys};
  if(form==='apartment')Object.assign(metrics,{assumedSharedAreaSquareMeters:sum('assumedSharedAreaSquareMeters'),assumedDwellingAreaSquareMeters:sum('assumedDwellingAreaSquareMeters'),unallocatedFloorAreaSquareMeters:sum('unallocatedFloorAreaSquareMeters')});
  const formAssumption=form==='detached'?`One dwelling per block; ${args.width} × ${args.depth} m footprint, ${args.storeys} storey${args.storeys===1?'':'s'}. Interior rooms, stairs and wall areas are not resolved.`:form==='attached'?`One dwelling per attached block; ${args.width} × ${args.depth} m per dwelling, ${args.storeys} storeys, up to ${args.homes_per_row} connected homes in a row. Party walls, individual entrances, interior plans and safe egress are not resolved.`:`Apartment massing uses a ${args.width} × ${args.depth} m floor plate and ${args.storeys} storeys. Up to ${args.units_per_floor} assumed dwellings per floor receive ${args.unit_area} m² each, after reserving ${args.circulation_percent}% of every floor for shared circulation, cores, walls and services. This is an area allocation, not a floor plan; the reserve does not prove usable corridors, daylight, accessibility or safe egress. Allocations stop at the requested home count; remaining floor area stays unallocated.`;
  const kind=form==='attached'?'attached-row':form==='apartment'?'apartment-mass':'detached-block';
  return {id:hash([evidence.caseId,evidence.siteContext?.geometryVersion??null,args,buildings,parking]),evidenceVersion:evidence.caseId,contextVersion:evidence.siteContext?.geometryVersion??null,typology:form,blockedRegions,status:buildings.length?'illustrative':'no-fit',method:kind+'-grid-v3-existing-footprints',scope:'Selected land intersected with the chosen mapped parcel; all layout dimensions and dwelling allocations are assumptions.',parameters:args,site:map(site,unproject),buildings,parking,maneuver,metrics,
    ignoredParameters,parameterNotes,diagnostics:{testedFootprintWidthMeters:massWidth,testedFootprintDepthMeters:args.depth,testedFootprintSquareMeters:massWidth*args.depth,requestedTypology:form,unplacedHomes:args.homes-allocatedHomes},
    assumptions:[formAssumption,`${args.spacing} m spacing between ${form==='attached'?'whole rows':'buildings'} and ${args.edge_clearance} m edge clearance are design assumptions, not legal setbacks.`,`Parking assumes 2.6 × 5 m bays with a 6 m maneuvering strip. Connection to a public road, accessible spaces and the required number are unverified.`, 'Mapped existing footprints are excluded from placement. Map coverage may be incomplete; an empty map area does not establish vacancy. Easements, fire access, terrain, drainage and utility capacity remain unverified. No existing buildings are removed by this model.'],
    checks:{mappedBuildingAvoidance:'passed',geometricContainment:'passed',overlap:'passed',...(form==='apartment'?{assumedFloorAreaAllocation:'passed'}:{}),interiorPlanning:'not-established',legalCapacity:'not-established',affordableDelivery:'not-established',access:'not-established'},
    limitations:allocatedHomes<args.homes?`This ${kind} test allocated ${allocatedHomes} of the ${args.homes} homes it attempted. Other forms, dimensions and arrangements have not been ruled out.`:'This arrangement fits the geometric and stated area-allocation assumptions; it does not establish an approvable home count.'};
}
