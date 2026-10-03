import test from 'node:test';
import assert from 'node:assert/strict';
import {boundaryLocation} from '../scripts/boundary-location.mjs';
const points=[{lng:-95,lat:30},{lng:-95,lat:30.001},{lng:-94.999,lat:30.001},{lng:-94.999,lat:30}];
const fields=[{NAME:'Texas',STUSAB:'TX',STATE:'48',GEOID:'48'},{NAME:'Example County',BASENAME:'Example',GEOID:'48001',FUNCSTAT:'A'},{NAME:'Chosen city',BASENAME:'Chosen',GEOID:'4812345',FUNCSTAT:'A'},{NAME:'Statistical CCD',BASENAME:'Statistical',GEOID:'4800199999',FUNCSTAT:'S'}];
const respond=(u,alter=()=>{})=>{const x=new URL(u),i=x.pathname.includes('State_County')?Number(x.pathname.split('/').at(-2)):x.pathname.includes('/4/')?2:3;const data={features:[{attributes:fields[i]}]};alter(data,x,i);return {data,url:u,hash:'f',retrievedAt:'2026-09-28'};};
test('boundary recovery checks full polygon containment and preserves statistical subdivision status',async()=>{
 const calls=[];const r=await boundaryLocation(async u=>{calls.push(u);return respond(u);},points);
 assert.equal(r.locality.authority.name,'Chosen city');assert.equal(r.locality.subdivisionFunctionalStatus,'S');assert.equal(r.locality.boundaryUncertain,false);assert.equal(calls.length,8);assert.equal(r.evidence.proof.length,8);
 assert(calls.slice(4).every(u=>new URL(u).searchParams.get('spatialRel')==='esriSpatialRelWithin'));
});
test('boundary recovery refuses crossings, truncation, incomplete service calls and partial containment',async()=>{
 for(const alter of [(d,u,i)=>{if(i===2)d.features.push({attributes:{GEOID:'other'}});},d=>{d.exceededTransferLimit=true;},(d,u,i)=>{if(i===2&&u.searchParams.get('spatialRel')==='esriSpatialRelWithin')d.features=[];}])assert.equal(await boundaryLocation(async u=>respond(u,alter),points),null);
 assert.equal(await boundaryLocation(async()=>{throw Error('offline');},points),null);
});
test('empty incorporated place and active township use township; absent active township uses county',async()=>{
 const r=await boundaryLocation(async u=>respond(u,(d,x,i)=>{if(i===2)d.features=[];if(i===3)d.features=[{attributes:{...fields[3],NAME:'Chosen town',BASENAME:'Chosen',FUNCSTAT:'A'}}];}),points);assert.equal(r.locality.authority.type,'county-subdivision');
 const c=await boundaryLocation(async u=>respond(u,(d,x,i)=>{if(i===2)d.features=[];}),points);assert.equal(c.locality.authority.type,'county');
});
