const feet=m=>Math.round(m*3.28084).toLocaleString();
export function surroundingSummary(answer,conceptId){
  const receipt=answer?.receipts?.find(r=>r.kind==='surroundings-effects'&&r.conceptId===conceptId);
  if(!receipt)return answer?.receipts?.some(r=>r.kind==='surroundings-effects')?{detail:'This arrangement still needs its own check of nearby buildings and the environment.',next:'The detailed measurements below belong to another arrangement. We cannot use them to describe this one.',receipt:null}:null;
  const nearest=[...(receipt.structures??[])].filter(s=>Number.isFinite(s.minimumSeparationMeters)).sort((a,b)=>a.minimumSeparationMeters-b.minimumSeparationMeters)[0];
  return {
    detail:nearest?`In this layout, the new building would be about ${feet(nearest.minimumSeparationMeters)} feet from ${nearest.name||'the nearest mapped building'}. We can check the space between buildings, but we cannot yet say how this would affect the people next door.`:'We have checked the proposed building’s size and position. The available map does not yet tell us how it would affect the people next door.',
    next:'We still need an engineer to check whether construction could damage nearby buildings. Daylight, privacy, access, drainage, trees, noise and local restrictions also need checking.',
    receipt
  };
}
export function homeSizeDescription(concept){
  const p=concept.parameters,gross=p.width*p.depth*p.storeys;
  const area=p.typology==='apartment'?p.unit_area:gross;
  return `${p.storeys===1?'One storey':p.storeys+' storeys'} · about ${Math.round(area*10.7639).toLocaleString()} sq ft ${p.typology==='apartment'?'allocated per home':'per home before allowing for walls and stairs'}`;
}
