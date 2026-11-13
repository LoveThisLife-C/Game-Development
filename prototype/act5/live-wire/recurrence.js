// Timer/selection authority only: no browser clock, drawing or cable physics.
export const FAILURE_ORDER=Object.freeze(['vent','seal','supply','fan']);
export function createCycle(){return{phase:'INITIAL',wireId:null,protectedUntil:null,warningAt:null,releaseAt:null,nextIndex:0,restorations:0,failures:0,lastFailureAt:null};}
export function protect(c,time,config){c.phase='PROTECTED';c.wireId=null;c.protectedUntil=time+config.protectedInterval;c.warningAt=null;c.releaseAt=null;c.restorations++;}
export function recurrenceStep(c,time,config){
 if(c.phase==='PROTECTED'&&time+1e-9>=c.protectedUntil){c.phase='WARNING';c.wireId=FAILURE_ORDER[c.nextIndex];c.warningAt=time;c.releaseAt=time+config.warningDuration;return{type:'contact-warning',wire:c.wireId};}
 if(c.phase==='WARNING'&&time+1e-9>=c.releaseAt){c.phase='OUTAGE';c.failures++;c.lastFailureAt=time;c.nextIndex=(c.nextIndex+1)%FAILURE_ORDER.length;return{type:'connection-failed',wire:c.wireId};}
 return null;
}
