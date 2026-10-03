import test from 'node:test';
import assert from 'node:assert/strict';
import {arrangeSceneMarkers,buildingHeightDescription,heightSourceLink,priorityValue,sceneContext,sceneOutcome,uniquePriorities,usesOvertureContext} from '../spatial-experience.js';

test('duplicate original priorities merge without losing factual answers or distinct targets',()=>{
  const receipt={status:'answered',distanceMeters:509,feature:{name:'A mapped school'}};
  const original=[
    {id:'purpose',originalExcerpt:'Affordable housing'},
    {id:'goal',originalExcerpt:' affordable   housing ',target:'homes',answer:receipt},
    {id:'school',originalExcerpt:'How close is the nearest school?',target:'school'},
    {id:'parking',originalExcerpt:'Keep access',target:'parking'},
    {id:'entrance',originalExcerpt:'Keep access',target:'entrance'},
  ];
  const before=JSON.stringify(original),deduped=uniquePriorities(original);
  assert.equal(deduped.length,4);
  assert.equal(deduped[0].target,'homes');
  assert.equal(deduped[0].answer,receipt);
  assert.equal(deduped[1].originalExcerpt,'How close is the nearest school?');
  assert.deepEqual(deduped.slice(2).map(p=>p.target),['parking','entrance']);
  assert.equal(JSON.stringify(original),before);
});

test('an actual measurement wins over an answered label for the same priority',()=>{
  const deduped=uniquePriorities([
    {originalExcerpt:'Nearest school',target:'school',answer:{status:'answered',headline:'Found'}},
    {originalExcerpt:'Nearest school',target:'school',answer:{status:'partial',measurement:{distanceMeters:509}}},
  ]);
  assert.equal(deduped.length,1);
  assert.equal(deduped[0].answer.measurement.distanceMeters,509);
});

test('current result context preserves later heights and cannot restore stale geometry',()=>{
  const saved={geometryVersion:'old',buildings:[{heightBasis:'unknown'}]};
  const enriched={geometryVersion:'old',renderVersion:'new-height-source',buildings:[{heightBasis:'overture',heightMeters:12.3}]};
  const changed={geometryVersion:'changed',buildings:[]};
  assert.equal(sceneContext({siteContext:enriched},{siteContext:saved}),enriched);
  assert.equal(sceneContext({siteContext:changed},{siteContext:saved}),changed);
  assert.equal(sceneContext({},{siteContext:saved}),saved);
  assert.equal(sceneContext({siteContext:enriched},null),enriched);
});

test('height descriptions distinguish source methods and never turn a footprint source into a height source',()=>{
  const lidar=buildingHeightDescription({heightBasis:'overture',heightMeters:7.1,heightSources:[
    {dataset:'OpenStreetMap',property:'/properties/geometry'},
    {dataset:'USGS Lidar',resource:'lidar',property:'/properties/height'},
  ]});
  assert.match(lidar,/7.1 m/);assert.match(lidar,/USGS Lidar/);assert.match(lidar,/lidar data/);assert.doesNotMatch(lidar,/OpenStreetMap|surveyed/);
  const machine=buildingHeightDescription({heightBasis:'overture',heightMeters:12.34,heightSources:[{dataset:'Microsoft ML Buildings',resource:'ml_buildings',property:'/properties/height'}]});
  assert.match(machine,/12.3 m/);assert.match(machine,/machine-learning height estimate/);assert.doesNotMatch(machine,/surveyed/);
  assert.match(buildingHeightDescription({heightBasis:'levels',displayHeightMeters:9}),/approximate height of 9 m/);
  assert.match(buildingHeightDescription({heightBasis:'unknown',displayHeightMeters:3.2}),/not as a measured building height/);
  assert.doesNotMatch(buildingHeightDescription({heightBasis:'unknown'}),/NaN|undefined/);
});

test('Overture attribution follows the height data actually present',()=>{
  assert.equal(usesOvertureContext({buildings:[{heightBasis:'overture'}]}),true);
  assert.equal(usesOvertureContext({heightEnrichment:{attribution:'Overture Maps'}}),true);
  assert.equal(usesOvertureContext({buildings:[{heightBasis:'mapped'}]}),false);
  assert.equal(usesOvertureContext(null),false);
});

test('height source links open documentation instead of downloading the PMTiles archive',()=>{
  const record={heightSourceUrl:'https://example.test/releases/buildings.pmtiles',heightRelease:'source-release',overtureId:'source-id'};
  assert.deepEqual(heightSourceLink(record),{url:'https://docs.overturemaps.org/guides/buildings/',label:'About height data ↗'});
  assert.equal(record.heightSourceUrl,'https://example.test/releases/buildings.pmtiles');
  assert.equal(heightSourceLink({heightSourceUrl:'https://example.test/height-record/123'}).url,'https://example.test/height-record/123');
  assert.equal(heightSourceLink({}),null);
});

test('six co-located callouts remain separate and inside mobile, tablet and desktop scenes',()=>{
  for(const [width,height] of [[360,470],[600,550],[980,700]]){
    const inputs=Array.from({length:6},(_,id)=>({id,x:width/2,y:height/2}));
    const markers=arrangeSceneMarkers(inputs,width,height);
    assert.equal(markers.length,inputs.length);
    assert.deepEqual(markers.map(m=>m.id),inputs.map(m=>m.id));
    for(let i=0;i<markers.length;i++){
      const a=markers[i];
      assert(a.x>=12&&a.y>=12&&a.x+44<=width-12&&a.y+44<=height-82,'marker stays clear of bounds and camera controls');
      for(let j=0;j<i;j++){
        const b=markers[j];assert(!(a.x<b.x+44&&a.x+44>b.x&&a.y<b.y+44&&a.y+44>b.y),'44 px touch targets do not overlap');
      }
    }
  }
});

test('housing priority shows only current eligible calculated homes and preserves factual answers',()=>{
  const result={housingRoute:'supported',version:{assessment:'current'},siteContext:{geometryVersion:'g1'}};
  const scenario={assessmentVersion:'current',concept:{status:'placed',contextVersion:'g1',buildings:[{id:'apartment',homes:12}],metrics:{homes:12}}};
  const priority={target:'homes',kind:'goal'};
  assert.equal(priorityValue(priority,{result,scenario}),'A possible housing layout');
  assert.equal(priorityValue({...priority,answer:{status:'answered',distanceMeters:509}},{result,scenario}),'509 m');
  assert.equal(priorityValue({...priority,answer:{status:'unresolved'}},{result,scenario}),'Not confirmed');
  for(const changed of [{...scenario,suppressed:true},{...scenario,visualizationAllowed:false},{...scenario,assessmentVersion:'old'}]){
    assert.equal(priorityValue(priority,{result,scenario:changed}),'For discussion');
  }
  assert.equal(priorityValue(priority,{result:{...result,housingRoute:'unresolved'},scenario}),'For discussion');
  assert.equal(priorityValue(priority,{result,scenario:{concept:{status:'no-fit',buildings:[],metrics:{homes:0}}}}),'Placement unresolved');
  assert.match(sceneOutcome(result,{...scenario,assessmentVersion:'old'}),/updated findings/);
});
