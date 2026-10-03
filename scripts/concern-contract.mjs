import {createHash} from 'node:crypto';

export const evidenceId=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0,20);
const words=value=>value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
export function goalItems(priorities,previous=[],refinement=''){
  return [...new Set([priorities.purpose,priorities.matters,...(priorities.choices??[]),...previous,refinement].filter(Boolean))].map(text=>({id:'input-'+evidenceId(text),text}));
}
export function concernCoverage(inputs,items){
  const excerpts=items.map(p=>(p.originalExcerpt??p.original_excerpt).trim());
  if(new Set(excerpts).size!==excerpts.length)throw new Error('Interpret each distinct concern with its own exact excerpt. Do not duplicate a mixed sentence across different topics or kinds; split it into the actual clauses.');
  const coverage=inputs.map(input=>{
    const matches=items.filter(p=>input.text.includes(p.originalExcerpt??p.original_excerpt));
    let remaining=input.text;
    for(const p of matches.sort((a,b)=>(b.originalExcerpt??b.original_excerpt).length-(a.originalExcerpt??a.original_excerpt).length))remaining=remaining.split(p.originalExcerpt??p.original_excerpt).join(' ');
    // Only conjunctions/punctuation can be outside a quoted concern. This is a
    // coverage check, never a keyword classifier of the user's intent.
    remaining=words(remaining).replace(/\b(and|also|or|then|please)\b/g,'').trim();
    if(!matches.length||remaining)throw new Error('Interpret every part of '+input.id+' separately where concerns differ. Uncovered original text: '+remaining);
    return {inputId:input.id,priorityIds:matches.map(p=>p.id),status:'represented'};
  });
  return coverage;
}
export function citedAnswer(args,{priority,sources,measurements=[],concepts=[],evidenceVersion}){
  if(!priority)throw new Error('Choose a current original concern.');
  if(!['answered','partial','unresolved','needs-expert'].includes(args.status))throw new Error('Choose an explicit answer status.');
  for(const key of ['answer','applicability'])if(typeof args[key]!=='string'||!args[key].trim()||args[key].length>1200||/<[^>]+>|https?:\/\//i.test(args[key]))throw new Error('Supply concise plain-text answer and applicability.');
  if(!Array.isArray(args.evidence_refs)||args.evidence_refs.length>12||!Array.isArray(args.unresolved_checks)||args.unresolved_checks.some(x=>typeof x!=='string'||!x.trim()||x.length>500))throw new Error('Supply evidence references and precise unresolved checks.');
  const support=[],receipts=[];
  for(const item of args.evidence_refs){
    const parts=typeof item==='string'?item.split('::'):null;
    const ref=parts?(parts[0]==='receipt'?{receipt_id:parts[1]}:{source_id:parts[0],passage_id:parts[1]}):item;
    if(!ref||parts&&parts.length!==2)throw new Error('Select an exact offered evidence reference.');
    if(ref.source_id){const source=sources.find(s=>s.id===ref.source_id&&!s.scopeConflict),passage=source?.passages?.find(p=>p.id===ref.passage_id);if(!passage)throw new Error('Use an exact current source passage.');support.push({sourceId:source.id,passageId:passage.id,quote:passage.text});}
    else {const receipt=measurements.find(m=>m.id===ref.receipt_id);if(!receipt||receipt.originalExcerpt!==priority.originalExcerpt||receipt.evidenceVersion&&receipt.evidenceVersion!==evidenceVersion||receipt.conceptId&&!concepts.some(c=>c.id===receipt.conceptId))throw new Error('Use a current measurement bound to this exact concern and concept.');receipts.push(receipt);}
  }
  if(['answered','partial'].includes(args.status)&&!support.length&&!receipts.length)throw new Error('A factual answer requires original passages or measured receipts.');
  if(args.status!=='answered'&&!args.unresolved_checks.length)throw new Error('State what remains unresolved.');
  if(args.status==='answered'&&(args.unresolved_checks.length||receipts.some(r=>r.status!=='answered')))throw new Error('Retain partial status when measurements or checks remain incomplete.');
  if(/\b(?:is|are|will be)\s+(?:approved|legally permitted|code compliant|guaranteed|safe|financially viable)\b|\b(?:there (?:is|are)|has)\s+no\s+(?:restrictions|impact)\b/i.test(args.answer))throw new Error('Do not promote preliminary evidence to approval, absence of restrictions, safety or final feasibility.');
  return {id:'answer-'+evidenceId(args),status:args.status,headline:args.status==='answered'?'Evidence found':args.status==='partial'?'Partial answer':args.status==='needs-expert'?'Expert check needed':'Still to confirm',detail:args.answer,applicability:args.applicability,support,receipts,unresolvedChecks:args.unresolved_checks,evidenceVersion};
}
export function mergeTestHistory(previous=[],current=[]){
  const records=new Map();for(const item of [...previous,...current])if(item.concept?.id)records.set(item.concept.id,{...records.get(item.concept.id),...item});return [...records.values()];
}
