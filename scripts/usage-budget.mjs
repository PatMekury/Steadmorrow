import {mkdirSync,readFileSync,writeFileSync,renameSync,openSync,closeSync,unlinkSync} from 'node:fs';
import {dirname} from 'node:path';

// Reserve BEFORE dispatch, including uncertain/failed calls. No prompts, keys or
// coordinates are written. An unreadable ledger fails closed instead of resetting.
export function createUsageBudget({file,now=Date.now}={}){
  let memory={version:1,entries:[]};
  return {reserve(bucket,units,limit){
    if(!Number.isSafeInteger(units)||units<1||!Number.isSafeInteger(limit)||limit<0)throw new Error('Invalid usage budget');
    let lock;
    try{
      if(file){mkdirSync(dirname(file),{recursive:true});lock=openSync(file+'.lock','wx');}
      let data=memory;
      if(file){try{data=JSON.parse(readFileSync(file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw new Error('Usage ledger unavailable');}}
      if(data.version!==1||!Array.isArray(data.entries)||data.entries.some(e=>typeof e.bucket!=='string'||!Number.isFinite(e.time)||!Number.isSafeInteger(e.units)||e.units<1))throw new Error('Usage ledger invalid');
      const time=now();data.entries=data.entries.filter(e=>time-e.time<86400000);
      const used=data.entries.filter(e=>e.bucket===bucket).reduce((s,e)=>s+e.units,0);
      if(used+units>limit)return false;
      data.entries.push({bucket,units,time});
      if(file){writeFileSync(file+'.tmp',JSON.stringify(data),{mode:0o600});renameSync(file+'.tmp',file);}else memory=data;
      return true;
    }finally{if(lock!==undefined){closeSync(lock);unlinkSync(file+'.lock');}}
  }};
}
