import {createHash} from 'node:crypto';
import {union,intersect,multiArea,overlapArea} from './site-geometry.mjs';
// A study collection is not a legal merged parcel. Keep every member and its
// source attributes; never add parcel totals to infer development capacity.
export function parcelStudy(records,selected,selectedKey=null){
 const members=records.filter(p=>p.geometry?.length&&overlapArea(p.geometry,selected)>.5).sort((a,b)=>a.key.localeCompare(b.key));
 if(!members.length)return {parcel:null,issue:'No mapped parcel covers a material part of the selection.'};
 if(members.length===1)return {parcel:members[0],issue:null};
 for(let i=0;i<members.length;i++)for(let j=0;j<i;j++){
  const overlap=overlapArea(intersect(members[i].geometry,selected),intersect(members[j].geometry,selected));
  if(overlap>Math.max(.5,Math.min(members[i].overlapSquareMeters??multiArea(members[i].geometry),members[j].overlapSquareMeters??multiArea(members[j].geometry))*.01))return {parcel:members.find(p=>p.key===selectedKey)??null,issue:'Mapped parcel records overlap each other inside the selection. Confirm whether these are duplicate, stacked or conflicting records.'};
 }
 const geometry=union(members.map(p=>p.geometry));
 const key=createHash('sha256').update(JSON.stringify(members.map(p=>[p.key,p.geometry]))).digest('hex').slice(0,20);
 return {parcel:{key,id:members.length+' parcels',address:'Selected land across '+members.length+' parcels',geometry,mappedSquareMeters:multiArea(geometry),overlapSquareMeters:overlapArea(geometry,selected),attributes:{},members,studyCollection:true,controlStatus:'unverified',consolidationStatus:'unverified'},issue:null};
}
