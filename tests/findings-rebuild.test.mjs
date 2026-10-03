import test from 'node:test';
import assert from 'node:assert/strict';
import {runChosenTools} from '../scripts/tool-scheduler.mjs';
import {createResearchSession} from '../scripts/agent-tools.mjs';
import {createPublishedCodeSession} from '../scripts/published-code.mjs';
import {transcribeTables} from '../scripts/table-text.mjs';
import {parseReview} from '../scripts/gloo.mjs';
import {load} from 'cheerio';
import {createEvidenceClient} from '../scripts/evidence-client.mjs';

test('two section anchors share one downloaded chapter without merging their source identities',async()=>{
 let calls=0;const read=createEvidenceClient({fetchImpl:async url=>{calls++;assert.equal(url,'https://example.gov/chapter');return new Response('A complete chapter body');}});
 const [a,b]=await Promise.all([read('https://example.gov/chapter#1',{format:'text'}),read('https://example.gov/chapter#2',{format:'text'})]);
 assert.equal(calls,1);assert.equal(a.hash,b.hash);assert.equal(a.url,'https://example.gov/chapter');
});

test('spanning table labels retain the correct district column instead of shifting a condition',()=>{
 const $=load('<main><table><tr><th colspan="2">Uses</th><th>C4</th><th>C5</th></tr><tr><td rowspan="2">Residence</td><td>Detached</td><td>Permitted P</td><td>Permitted</td></tr><tr><td>Other types</td><td>Permitted P</td><td>Permitted</td></tr></table></main>');
 assert.deepEqual(transcribeTables($,$('main')),['C4','C5']);
 assert.match($('main').text(),/Uses: Residence; Uses: Other types; C4: Permitted P; C5: Permitted/);
 assert.ok(!$('main').text().includes('C5: Permitted P'));
});

test('a district equivalence table is not mistaken for a use table limited to its first data row',()=>{
 const $=load('<main><table><tr><th>Districts</th><th>Residential equivalent</th></tr><tr><td>C3</td><td>R3-2</td></tr><tr><td>C5 C6-4</td><td>R10</td></tr></table></main>');
 assert.deepEqual(transcribeTables($,$('main')),[]);
 assert.match($('main').text(),/C5 C6-4 \| R10/);
});

test('an assessment cannot cite a district table identified as conflicting with the mapped districts',()=>{
 const support=[{sourceId:'code-wrong',passageId:'code-wrong-p1'}];
 const value={assessment:{headline:'Housing route',summary:'A proposed route.',support},findings:[{heading:'Rule',summary:'A rule.',support}],obstacles:[{heading:'Condition',consequence:'Needs review.',nextStep:'Review.',support}]};
 const data={output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(value)}]}]};
 assert.throws(()=>parseReview(data,[{id:'code-wrong',kind:'code-provision',text:'Residential uses are allowed under this table, subject to specified exceptions.',scopeConflict:'This is a different district table.'}]),/different districts/);
});

test('independent chosen tools overlap, geometry stays ordered, review waits for all evidence',async()=>{
 const calls=[{name:'parcel'},{name:'code'},{name:'zoning'},{name:'review'}],events=[];
 let release;const ready=new Promise(r=>release=r);
 await runChosenTools(calls,async c=>{
  events.push(c.name+'-start');
  if(c.name==='parcel')await ready;
  if(c.name==='code')release();
  events.push(c.name+'-end');return c.name;
 },c=>c.name==='review'?'exclusive':c.name==='code'?'code':'geometry');
 assert.ok(events.indexOf('code-start')<events.indexOf('parcel-end'));
 assert.ok(events.indexOf('zoning-start')>events.indexOf('parcel-end'));
 assert.equal(events.at(-2),'review-start');
});

const envelope=data=>({data,url:'https://example.gov/data',hash:'fixture',retrievedAt:'2026-09-25T00:00:00Z'});
const ring=(a,b)=>[[a,29],[b,29],[b,29.001],[a,29.001],[a,29]];
test('recognized BBL cannot be replaced with a borough or address; selected-area zoning differs from parcel zoning',async()=>{
 const points=ring(-95,-94.9996).slice(0,-1).map(([lng,lat])=>({lng,lat}));
 const read=async target=>{
  const u=new URL(target);
  if(u.hostname==='geocoding.geo.census.gov')return envelope({result:{geographies:{States:[{NAME:'Washington',STUSAB:'WA',STATE:'53'}],Counties:[{NAME:'Example County',BASENAME:'Example',GEOID:'53123'}]}}});
  const zone=u.pathname.includes('zoning')||u.searchParams.get('q')?.includes('title:zoning');
  if(u.pathname.endsWith('/search'))return envelope({results:[{title:zone?'Example Zoning':'Example Parcels',url:`https://example.gov/${zone?'zoning':'parcel'}/FeatureServer/0`}]});
  if(u.pathname.endsWith('/query'))return envelope({features:zone?[{attributes:{ZONE:'A'},geometry:{rings:[ring(-95,-94.9995)]}},{attributes:{ZONE:'B'},geometry:{rings:[ring(-94.9995,-94.999)]}}]:[{attributes:{BBL:1012860001,Borough:'MN',Address:'Example address'},geometry:{rings:[ring(-95,-94.999)]}}]});
  return envelope({geometryType:'esriGeometryPolygon',fields:zone?[{name:'ZONE'}]:[{name:'Borough'},{name:'BBL'},{name:'Address'}]});
 };
 const s=createResearchSession({points},{read});await s.execute('resolve_location');
 const parcel=(await s.execute('discover_map_sources',{kind:'parcel'})).sources[0];
 assert.equal(parcel.identifierField,'BBL');assert.ok(!parcel.identifierFields.some(f=>f.name==='Borough'));
 for(const identifier_field of ['Borough','Address'])await assert.rejects(s.execute('read_map_source',{source_id:parcel.source_id,identifier_field}));
 await s.execute('read_map_source',{source_id:parcel.source_id});
 const zone=(await s.execute('discover_map_sources',{kind:'zoning'})).sources[0];await s.execute('read_map_source',{source_id:zone.source_id});
 const r=s.snapshot();assert.equal(r.parcel.id,'1012860001');assert.equal(r.zones.length,2);
 assert.equal(r.spatial.zones.filter(z=>z.selectedSquareMeters>.5).length,1);
 assert.ok(r.spatial.selectedZoningCoverage>.999);assert.equal(r.assessmentScope,'local-rules');
 assert.ok(r.spatial.zones.every(z=>z.geometry.length));
});

test('chapter fragment selects its exact section, and whole chapter cannot masquerade as its first provision',async()=>{
 const content='<main><a href="/article-iii/chapter-2#32-121">Residential use allowances</a>'+['32-11','32-121'].map(n=>`<article class="node--type-section node--view-mode-full"><span class="field--name-title">${n}</span><div class="section-title">${n} Housing uses</div><div class="field--name-body">${n}: Original operative text with conditions applying to this section and no other section.</div></article>`).join('')+'</main>';
 const s=createPublishedCodeSession(async url=>({...envelope(content),url}),{cityId:'3651000'});
 const found=await s.search('residential');const choice=found.sections.find(p=>p.url.endsWith('#32-121'));
 assert.ok(choice);const r=await s.read(choice.section_id);assert.equal(r.sources.length,1);assert.match(r.sources[0].text,/^32-121:/);
 assert.ok(!r.sources[0].text.includes('32-11:'));assert.ok(r.sources[0].url.endsWith('#32-121'));
});

test('publisher search retains district hierarchy and a route beyond irrelevant full-text mentions',async()=>{
 const root='<aside><a href="/article-ii">Article II Residence District Regulations</a><a href="/article-iii">Article III Commercial District Regulations</a></aside><main>Publication home</main>';
 const results='<div class="view-online-zr-search"><div class="view-content"><div class="views-row"><div class="views-field-title"><a href="/article-iii/chapter-2#32-12">32-12</a></div><div class="views-field-field-section-title">Residences</div></div></div></div>';
 const s=createPublishedCodeSession(async url=>envelope(new URL(url).pathname==='/search'?results:root),{cityId:'3651000'});
 const r=await s.search('residences');assert.match(r.sections[0].context,/Commercial District Regulations/);assert.equal(r.navigation.length,2);
});

test('chapter navigation offers section headings with chapter context rather than inline cross-references',async()=>{
 const root='<main><a href="/article-iii">Commercial District Regulations</a></main>';
 const article='<main><a href="/article-iii/chapter-2">Use Regulations</a></main>';
 const chapter='<main><article class="node--type-section"><div class="section-title"><a href="/article-iii/chapter-2#32-121">32-121</a> Use Group II – general use allowances</div><div class="field--name-body">An incidental <a href="/article-iii/chapter-4/34-112">bulk cross-reference</a>.</div></article></main>';
 const s=createPublishedCodeSession(async url=>({...envelope(new URL(url).pathname.endsWith('/chapter-2')?chapter:new URL(url).pathname.endsWith('/article-iii')?article:root),url}),{cityId:'3651000'});
 const found=await s.search('use');const page=found.sections.find(p=>p.url.endsWith('/chapter-2'));
 const r=await s.read(page.section_id);assert.equal(r.status,'navigation');assert.equal(r.sources.length,0);assert.equal(r.sections.length,1);
 assert.match(r.sections[0].title,/Use Group II/);assert.match(r.sections[0].context,/Use Regulations/);assert.ok(r.sections[0].url.endsWith('#32-121'));
});
