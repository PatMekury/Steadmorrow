// Adapt older scripted model turns to the explicit review/selection protocol.
// New protocol rejection tests call the production agent directly.
import {createScenarioAgent as createAgent} from '../scripts/scenario-agent.mjs';
export function createScenarioAgent(options){
  const original=options.fetchImpl;
  if(!original)return createAgent(options);
  return createAgent({...options,fetchImpl:async(url,request)=>{
    const payload=JSON.parse(request.body),state=JSON.parse(payload.input[0].content).studyState;
    const response=await original(url,request);if(!response.ok)return response;
    const data=await response.json();
    for(const call of data.output??[]){
      if(call.type!=='function_call')continue;
      const args=JSON.parse(call.arguments),concept=state?.concepts.find(c=>c.id===args.concept_id);
      if(call.name==='review_layout'&&concept&&!args.verdict)Object.assign(args,{
        plan_version:state.planVersion,evidence_version:concept.evidenceVersion,observed_receipt_ids:[concept.observationId],verdict:concept.buildingsCount?'ready-to-compare':'unresolved',
        priority_findings:state.brief.map(p=>({priority_id:p.id,status:'tradeoff',finding:'The measured cluster retains this priority for discussion; detailed delivery remains unresolved.'})),limitations:['Mapped footprints and assumed dimensions do not establish legal capacity.'],next_action:'Compare the measured arrangement with the retained alternatives.'
      });
      if(call.name==='select_layout'&&state.options&&!args.selections){
        args.selections=state.options.filter(o=>o.useStatus!=='unresolved').flatMap(o=>{
          const eligible=state.concepts.filter(c=>c.optionId===o.id&&state.reviews.some(r=>r.conceptId===c.id&&r.verdict!=='revise'));
          const chosen=eligible.find(c=>c.id===args.concept_id)??eligible.find(c=>c.buildingsCount)??eligible[0];
          return chosen?[{option_id:o.id,concept_id:chosen.id,review_id:state.reviews.find(r=>r.conceptId===chosen.id).id,rationale:args.rationale}]:[];
        });args.unresolved_option_ids=state.options.filter(o=>o.useStatus==='unresolved').map(o=>o.id);
      }
      if(call.name==='select_layout'){args.selections??=[];args.unresolved_option_ids??=[];}
      call.arguments=JSON.stringify(args);
    }
    return new Response(JSON.stringify(data),{status:response.status,headers:response.headers});
  }});
}
