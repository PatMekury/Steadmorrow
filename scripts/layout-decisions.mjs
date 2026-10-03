import {evidenceId} from './concern-contract.mjs';
const prose=v=>typeof v==='string'&&v.trim().length>3&&v.length<=1200&&!/<[^>]+>|https?:\/\//i.test(v);
export const designRationale=v=>prose(v)&&!(/\d|\b(?:legal|compliant|approved|permitted|affordable rent|financially viable|safe|meets code)\b/i.test(v));
export function validateLayoutReview(args,{concept,brief,planVersion,observed}){
  if(!concept||!observed.has(concept.observationId))throw new Error('Read the returned test observation in a later model turn before reviewing it.');
  if(args.plan_version!==planVersion||args.evidence_version!==concept.evidenceVersion)throw new Error('Review the current plan and evidence versions.');
  if(!Array.isArray(args.observed_receipt_ids)||!args.observed_receipt_ids.includes(concept.observationId)||args.observed_receipt_ids.some(id=>!observed.has(id)))throw new Error('Reference observations already received, including this exact layout test.');
  if(!['ready-to-compare','revise','unresolved'].includes(args.verdict)||!prose(args.next_action)||!Array.isArray(args.limitations)||!args.limitations.length||args.limitations.some(x=>!prose(x)))throw new Error('Record a real verdict, limitations and next action.');
  const findings=Array.isArray(args.priority_findings)?args.priority_findings:[],missing=brief.filter(p=>!findings.some(f=>f.priority_id===p.id&&prose(f.finding)&&['addressed','tradeoff','unresolved'].includes(f.status)));
  if(!Array.isArray(findings)||missing.length||findings.some(f=>!brief.some(p=>p.id===f.priority_id))||new Set(findings.map(f=>f.priority_id)).size!==findings.length)throw new Error('Judge every original priority exactly once, including the housing purpose. Missing or invalid: '+missing.map(p=>p.id).join(', ')+'. Required IDs: '+brief.map(p=>p.id).join(', '));
  if(args.verdict==='ready-to-compare'&&!concept.buildings.length)throw new Error('An empty test cannot be ready to compare. Record unresolved or revise.');
  const review={conceptId:concept.id,planVersion,evidenceVersion:concept.evidenceVersion,observedReceiptIds:args.observed_receipt_ids,verdict:args.verdict,priorityFindings:args.priority_findings,limitations:args.limitations,nextAction:args.next_action};
  return {id:'review-'+evidenceId(review),...review};
}
export function explicitSelections(args,{options,concepts,reviews,planVersion}){
  if(!Array.isArray(args.selections)||!Array.isArray(args.unresolved_option_ids))throw new Error('Explicitly select each option version and list unresolved option IDs.');
  const ids=new Set(),explored=[];
  for(const choice of args.selections){
    const option=options.find(o=>o.id===choice.option_id),concept=concepts.get(choice.concept_id),review=reviews.get(choice.concept_id);
    if(!option||ids.has(option.id)||concept?.optionId!==option.id||concept.planVersion!==planVersion||!review||review.id!==choice.review_id||review.verdict==='revise'||!designRationale(choice.rationale))throw new Error('Choose an exact current option, concept and accepted review, with its own design rationale; omit numeric, legal, financial or safety conclusions.');
    if(concept.buildings.length&&review.verdict!=='ready-to-compare')throw new Error('A displayed option needs a ready-to-compare review.');
    ids.add(option.id);explored.push({...option,concept,review,reviewed:true,rationale:choice.rationale});
  }
  for(const id of args.unresolved_option_ids){const option=options.find(o=>o.id===id);if(!option||ids.has(id)||option.useStatus!=='unresolved')throw new Error('Only options with explicit unresolved use evidence can be omitted from tests.');ids.add(id);explored.push({...option,concept:null,reviewed:false});}
  if(options.some(o=>!ids.has(o.id)))throw new Error('Every planned option needs an explicit selected version or unresolved disposition. Missing: '+options.filter(o=>!ids.has(o.id)).map(o=>o.id).join(', ')+'. Include the exact reviewed no-fit test for a failed conditional option in selections; it stays in exploration history, not the displayed alternatives.');
  if(!explored.some(o=>o.concept?.id===args.concept_id))throw new Error('The recommendation must be one of the explicit selections.');
  return explored;
}
