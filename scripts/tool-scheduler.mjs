// Run only actions already chosen by Gloo. Shared state lanes protect geometry,
// code navigation and official-site traversal; reviews are full barriers.
export async function runChosenTools(calls, execute, laneFor = () => 'exclusive') {
  let batch=[];
  const results=[];
  async function flush() {
    const lanes=new Map();
    const tasks=batch.map(call=>{
      const lane=laneFor(call);
      const task=(lanes.get(lane)??Promise.resolve()).then(()=>execute(call));
      lanes.set(lane,task.catch(()=>{}));return task;
    });
    results.push(...await Promise.all(tasks));batch=[];
  }
  for(const call of calls){
    if(laneFor(call)==='exclusive'){await flush();results.push(await execute(call));}
    else batch.push(call);
  }
  await flush();return results;
}
