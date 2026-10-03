import test from 'node:test';
import assert from 'node:assert/strict';
import {hasPrivateInput,privateInputFields,screenedLandSave,isPrivateRecordField} from '../input-privacy.js';
import {createFindingsService,handleFindings} from '../scripts/gloo.mjs';
import {createServer} from 'node:http';

// All people, contact details and private-record examples below are synthetic.
const blocked=[
 'Contact fictional@example.invalid', 'fictional @ example . invalid', 'fictional\u200b@example.invalid',
 'fictional [at] example [dot] invalid', 'Call (202) 555-0142', 'Phone 202-555-0142', '2025550142',
 'SSN: 000-00-0000', 'DOB: 2014-01-01', 'Bank account: 0000000',
 'Donor records: fictional pledges', 'Membership roster: Fictional Person',
 'Counseling notes: a made-up private conversation', 'Prayer request: a fictional personal story',
 'Child: Fictional Person, age 12', 'My daughter is twelve', 'Fictional Person donated $100',
];
const input=()=>({points:[{lat:29.76,lng:-95.37},{lat:29.76,lng:-95.369},{lat:29.759,lng:-95.369},{lat:29.759,lng:-95.37}],query:'Example church property',priorities:{purpose:'Affordable housing',matters:'',choices:[],exploring:true}});

test('local screening catches common private-record and contact signals without rejecting collective housing goals',()=>{
 for(const value of blocked)assert.equal(hasPrivateInput(value),true,value);
 for(const value of ['Affordable homes for local families with children','Retain church ownership','Understand local housing needs','Keep access to the sanctuary','Explore donor funding for affordable housing','Community counseling rooms','St. Mary’s Church','A 2027 discussion about 55+ housing'])assert.equal(hasPrivateInput(value),false,value);
 assert.equal(hasPrivateInput('100 Main Street, Example, NY 10022',{address:true}),false);
 assert.equal(hasPrivateInput('324056022',{address:true}),false);
 assert.deepEqual(privateInputFields({priorities:{purpose:'fictional',matters:'@example.invalid'}}),['purpose','matters']);
});

test('browser-save migration drops flagged fields and unknown properties while preserving the selected area and safe goals',()=>{
 const initial={version:1,points:input().points,mode:'click',confirmed:true,query:'100 Main Street',priorities:{purpose:'Counseling notes: fictional confidential text',preserve:'Retain ownership',choices:['Retain ownership'],saved:true},unexpected:'private extra data'};
 const clean=screenedLandSave(initial);
 assert.deepEqual(clean.points,initial.points);assert.equal(clean.confirmed,true);assert.equal(clean.priorities.purpose,'');assert.equal(clean.priorities.preserve,'Retain ownership');assert.equal(clean.priorities.saved,false);assert.equal(clean.unexpected,undefined);
 assert.ok(!JSON.stringify(clean).includes('confidential'));assert.ok(initial.priorities.purpose.includes('confidential'),'sanitizer does not mutate the editing draft');
 const badQuery=screenedLandSave({...initial,query:'fictional@example.invalid'});assert.equal(badQuery.query,'');
});

test('sensitive inputs are rejected before Gloo, tool-session construction, caching or diagnostics, even with a consent/synthetic claim',async()=>{
 let externalCalls=0,sessions=0,diagnostics=0;
 const review=createFindingsService({apiKey:'fixture-only',fetchImpl:async()=>{externalCalls++;throw new Error('Must not call');},sessionFactory:()=>{sessions++;throw new Error('Must not construct');},onDiagnostic:()=>diagnostics++});
 for(const text of blocked){
  const data=input();data.priorities.purpose=text;
  await assert.rejects(review({...data,consent:true,synthetic:true}),error=>error.status===400&&!error.message.includes(text));
 }
 const data=input();data.query='fictional@example.invalid';await assert.rejects(review(data),e=>e.status===400);
 assert.equal(externalCalls,0);assert.equal(sessions,0);assert.equal(diagnostics,0);
});

test('public-record field screening checks aliases and excludes names and private records without blocking property data',()=>{
 for(const field of [{name:'PROP_DATA',alias:'Owner Name'},{name:'OWN1'},{name:'CONTACT'},{name:'FIRST_NAME'},{name:'DOB'},{name:'DONOR_EMAIL'}])assert.equal(isPrivateRecordField(field),true,field.name);
 for(const name of ['PARCEL_ID','PAN','TMK','SITUS_ADDRESS','ZONING','LAND_USE','MAPPED_AREA'])assert.equal(isPrivateRecordField({name}),false,name);
});

test('both research HTTP paths return a generic privacy rejection and make zero model requests',async()=>{
 let calls=0;const review=createFindingsService({apiKey:'fixture-only',fetchImpl:async()=>{calls++;throw new Error('Must not call');}});
 const server=createServer((req,res)=>handleFindings(req,res,review));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin=`http://127.0.0.1:${server.address().port}`;
 try{
  for(const path of ['/api/first-look','/api/property-evidence']){
   const data=input();data.priorities.matters='Member: Fictional Person';
   const response=await fetch(origin+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(data)});
   assert.equal(response.status,400);const body=await response.text();assert.match(body,/property goals/i);assert.ok(!body.includes('Fictional Person'));
  }
  assert.equal(calls,0);
 }finally{await new Promise(resolve=>server.close(resolve));}
});
