import {createHash} from 'node:crypto';
export function sourceCompleteness(source){
  const text=source.text??'';
  return {textHash:createHash('sha256').update(text).digest('hex'),availableCharacters:text.length,complete:source.truncated!==true&&!source.page,scope:source.page?'retrieved PDF pages':'retrieved section or document',parserStatus:text.trim()?'readable':'empty',omittedCharacters:source.truncated?null:0,continuation:source.truncated?'Read the original linked continuation; omitted text is not available in this record.':source.page?'Inspect adjacent physical PDF pages and cross-references.':null};
}
export function sourceInventory(sources,passages,requested=new Map()){
  return sources.map(s=>{
    const all=passages(s),ids=requested.get(s.id),visible=ids?all.filter(p=>ids.has(p.id)):all.slice(0,2);
    const {text,...metadata}=s,visibleIds=new Set(visible.map(p=>p.id)),omitted=all.map((p,i)=>visibleIds.has(p.id)?null:i+1).filter(Boolean),ranges=[];
    for(const n of omitted){const last=ranges.at(-1);if(last&&last.end===n-1)last.end=n;else ranges.push({start:n,end:n});}
    return {...metadata,completeness:sourceCompleteness(s),passageCount:all.length,visiblePassageIds:visible.map(p=>p.id),omittedPassageCount:omitted.length,omittedPassageRanges:ranges,continuation:omitted.length?{tool:'read_source_passages',source_id:s.id,start_passage:omitted[0]}:null,passages:visible};
  });
}
