const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);

// Break a long pointer drag into bounded samples accepted by the authoritative
// server while continuing toward the real cursor even when it stops moving.
export function nextDragTarget(target,goal,maxStep=240){
  const gap=distance(goal,target);
  if(gap<=.5)return {target:{...goal},dirty:false};
  const fraction=Math.min(1,maxStep/gap);
  const next={x:target.x+(goal.x-target.x)*fraction,y:target.y+(goal.y-target.y)*fraction};
  return {target:next,dirty:distance(goal,next)>.5};
}
