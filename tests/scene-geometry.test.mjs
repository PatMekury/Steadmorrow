import test from 'node:test';
import assert from 'node:assert/strict';
import {buildingDisplayHeight,sceneBuildings,subjectFrame,linkedBuildingIds} from '../scene-geometry.js';
const rect=(x,y,w,h)=>[[[[x,y],[x+w,y],[x+w,y+h],[x,y+h],[x,y]]]];
const area=g=>g.reduce((s,p)=>s+p.reduce((a,r,i)=>a+(i?-1:1)*Math.abs(r.reduce((n,q,k)=>k?n+r[k-1][0]*q[1]-q[0]*r[k-1][1]:n,0)/2),0),0);
test('display estimates preserve original dimensions and disclose their basis',()=>{
 const source={id:'levels',geometry:rect(0,0,5,5),heightMeters:null,heightBasis:'levels',levels:4};const saved=JSON.stringify(source);
 assert.deepEqual(buildingDisplayHeight(source),{basis:'levels',base:0,top:12,approximate:true,placeholder:false,description:'Approximate height: 4 mapped storeys × 3 m per storey.'});
 assert.equal(JSON.stringify(source),saved);
 assert.equal(buildingDisplayHeight({heightMeters:20,heightBasis:'mapped'}).top,20);
 assert.equal(buildingDisplayHeight({heightMeters:null,levels:null}).placeholder,true);
 const overture=buildingDisplayHeight({heightMeters:7.1,heightBasis:'overture',heightSources:[{dataset:'USGS Lidar'}]});
 assert.equal(overture.basis,'overture');assert.equal(overture.top,7.1);assert.match(overture.description,/USGS Lidar/);assert.match(overture.description,/not a surveyed/);
});
test('part geometry replaces only covered parent volume, preserving uncovered parent and elevated base',()=>{
 const parent={id:'p',geometry:rect(0,0,20,20),heightMeters:12,heightBasis:'mapped',isOutlineWithParts:true};
 const part={id:'c',geometry:rect(0,0,10,10),heightMeters:18,minHeightMeters:3,heightBasis:'mapped',buildingPart:true};
 const rows=sceneBuildings([parent,part]);const p=rows[0];
 assert.equal(p.volumes.length,2);assert.equal(area(p.volumes[0].geometry),400);assert.equal(p.volumes[0].top,3);
 assert.equal(area(p.volumes[1].geometry),300);assert.equal(p.volumes[1].top,12);
 assert.equal(rows[1].display.base,3);assert.equal(rows[1].volumes[0].top,18);
 assert.equal(area(parent.geometry),400);
});
test('unknown-height parts cannot erase known parent massing; complete grounded parts avoid duplicate parent',()=>{
 const parent={id:'p',geometry:rect(0,0,20,20),heightMeters:12,heightBasis:'mapped'};
 const part={id:'c',geometry:rect(0,0,20,20),buildingPart:true,heightMeters:null,heightBasis:'unknown'};
 let rows=sceneBuildings([parent,part]);assert.equal(rows[0].volumes[0].top,12);assert.equal(rows[1].volumes.length,0);
 rows=sceneBuildings([parent,{...part,heightMeters:15,heightBasis:'mapped'}]);assert.equal(rows[0].volumes.length,0);assert.equal(rows[1].volumes[0].top,15);
});
test('selection framing stays centred and legible in desktop and narrow views',()=>{
 const points=[[-8,-5],[8,-5],[8,5],[-8,5]];
 for(const aspect of [1.5,.7]){const f=subjectFrame(points,{aspect});assert.equal(f.centerX,0);assert.equal(f.centerY,0);assert.ok(f.vertical<50);assert.ok(f.width>=16&&f.height>=10);}
});
test('a parent and distant parts remain one visible property after their volumes are cut',()=>{
 const buildings=[{id:'parent',onProperty:true,distance:50},{id:'part',sceneParentId:'parent',onProperty:false,distance:200},{id:'near-part',sceneParentId:'other-parent',distance:40},{id:'other-parent',distance:180},{id:'outside',distance:250}];
 assert.deepEqual([...linkedBuildingIds(buildings,b=>b.onProperty)],['parent','part']);
 assert.deepEqual([...linkedBuildingIds(buildings,b=>b.distance<125)],['parent','part','near-part','other-parent']);
});
