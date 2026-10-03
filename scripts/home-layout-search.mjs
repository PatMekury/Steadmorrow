import {calculateConcept,describeStudyShape,validateLayout} from './scenario-geometry.mjs';
import {checkHomeDesign} from './home-design.mjs';

// Gloo selects the reviewed home brief, form, floors, grouping and parking.
// This calculator supplies bounded footprint candidates that satisfy the area
// arithmetic. Gloo still observes, critiques and selects the actual result.
export function fitHomeLayout(evidence,input,brief){
  if(!brief)throw Error('Plan and source-review the home brief before fitting it.');
  const minimum=Math.max(brief.minimumAllocatedAreaPerHomeSquareMeters,...brief.standards.filter(r=>r.metric==='home-area-min'&&r.scope!=='unresolved').map(r=>r.value*(r.unit==='sq-ft'?.09290304:1)));
  const unitArea=Math.ceil(minimum*100)/100,form=input.typology??'detached';
  if(form==='attached'&&(!Number.isInteger(input.homes_per_row)||input.homes_per_row<2))throw Error('Choose at least two homes per attached row; the calculator preserves that grouping.');
  if(form==='apartment'&&(!Number.isInteger(input.units_per_floor)||!Number.isFinite(input.circulation_percent)))throw Error('Choose units_per_floor and circulation_percent for an apartment test.');
  const floorArea=form==='apartment'?unitArea*input.units_per_floor/(1-input.circulation_percent/100):unitArea/input.storeys;
  if(!Number.isFinite(floorArea)||floorArea<=0)throw Error('Choose valid storeys and apartment shared-space allowance.');
  const shape=describeStudyShape(evidence),row=form==='attached'?Math.min(input.homes_per_row,input.homes):1;
  const siteRatios=(shape?.parcelIntersections??[]).flatMap(p=>p.enclosingFrames.slice(0,2).flatMap(f=>{
    const w=f.widthMeters-2*input.edge_clearance,d=f.depthMeters-2*input.edge_clearance;
    return w>0&&d>0?[w/row/d,d/row/w]:[];
  }));
  const ratios=[...new Set([1,.6,1.6,...siteRatios,.4,2.4].filter(r=>Number.isFinite(r)&&r>0).map(r=>Math.round(Math.max(.25,Math.min(3,r))*100)/100))].slice(0,8);
  const ceil=v=>Math.ceil(v*20)/20,candidates=[],seen=new Set();let best=null;
  for(const ratio of ratios){
    const width=ceil(Math.max(4,Math.sqrt(floorArea*ratio))),depth=ceil(Math.max(5,floorArea/width));
    const key=width+':'+depth;if(seen.has(key))continue;seen.add(key);
    const parameters={...input,width,depth,...(form==='apartment'?{unit_area:unitArea}:{})};
    // Unsupported dimensions are omitted, never shrunk below the home budget.
    if(width>(form==='apartment'?40:16)||depth>(form==='apartment'?40:24))continue;
    validateLayout(parameters);const designCheck=checkHomeDesign(parameters,brief);
    const concept=calculateConcept(evidence,parameters);
    candidates.push({parameters:concept.parameters,status:concept.status,homes:concept.metrics.homes,parking:concept.metrics.parking});
    if(!best||concept.metrics.homes>best.metrics.homes||concept.metrics.homes===best.metrics.homes&&concept.metrics.parking>best.metrics.parking){best=concept;best.designBrief=brief;best.designCheck=designCheck;}
    if(best.metrics.homes===input.homes&&best.metrics.parking===input.parking_spaces)break;
  }
  if(!best)throw Error('The home area and chosen form exceed the supported footprint range. Keep the home brief and choose another number of storeys, apartment allocation or represented form.');
  best.diagnostics.sizingSearch={bounded:true,exhaustive:false,minimumAreaPerHomeSquareMeters:unitArea,candidates};
  best.assumptions.push('Footprint dimensions were calculated from the reviewed room budget and tested in a bounded set of proportions. The selected home area, floors, grouping and parking assumptions remain explicit. These are not resolved floor plans or legal capacity.');
  return best;
}
