import test from 'node:test';
import assert from 'node:assert/strict';
import {scenePresentation,sceneOutcome} from '../spatial-experience.js';
const result={housingRoute:'supported',selectedArea:{geometry:[[[[-95,30],[-94.9999,30],[-94.9999,30.0001],[-95,30.0001],[-95,30]]]]}};
const noFit={status:'no-fit',buildings:[],parameters:{width:6,depth:9,storeys:3,storey_height:3.2,angle:0},metrics:{homes:0,parking:0,heightMeters:9.6}};
test('failed layout leaves land empty without a ghost building or capacity verdict',()=>{
 const saved=JSON.stringify({result,noFit}),p=scenePresentation(result,noFit);
 assert.deepEqual(p,{placed:false,probe:null,height:null,homes:null,parking:null});
 assert.equal(sceneOutcome(result,{concept:noFit}),'This arrangement of homes does not fit the land you selected.');
 assert.equal(JSON.stringify({result,noFit}),saved);
});
test('placed concepts preserve their measured quantities without implying permission',()=>{
 const concept={...noFit,buildings:[{id:'home-1'}],metrics:{homes:1,parking:2,heightMeters:6}};
 assert.deepEqual(scenePresentation(result,concept),{placed:true,probe:null,height:6,homes:1,parking:2});
 assert.deepEqual(scenePresentation(result,null),{placed:false,probe:null,height:null,homes:null,parking:null});
 assert.match(sceneOutcome(result,{concept}),/permission to build is not established/);
});

test('unresolved housing use withholds proposed geometry and count claims',()=>{
 const concept={...noFit,buildings:[{id:'home-1'}],metrics:{homes:1,parking:2,heightMeters:6}};
 const unresolved={...result,housingRoute:'unresolved'};
 assert.deepEqual(scenePresentation(unresolved,concept),{placed:false,probe:null,height:null,homes:null,parking:null});
 assert.equal(sceneOutcome(unresolved,{concept}),'Housing-use permission is unresolved, so no housing is shown.');
});

test('suppressed scenarios cannot leave visible counts or parking presentation behind',()=>{
 const concept={...noFit,buildings:[{id:'home-1'}],metrics:{homes:1,parking:2,heightMeters:6}};
 for(const gate of [{suppressed:true},{visualizationAllowed:false}]){
  const scenario={concept,...gate};
  assert.deepEqual(scenePresentation(result,concept,scenario),{placed:false,probe:null,height:null,homes:null,parking:null});
  assert.doesNotMatch(sceneOutcome(result,scenario),/places 1 homes/);
 }
});
