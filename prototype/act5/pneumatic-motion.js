// Shared by the authoritative mechanism and its existing browser gauge module.
export const OPERATING_MAX=85;
export const isOverpressure=pressure=>pressure>OPERATING_MAX;
export function formatPneumaticPressure(pressure){const text=pressure.toFixed(1);return isOverpressure(pressure)&&text===OPERATING_MAX.toFixed(1)?'>'+text:text;}
// Interpolate within the authoritative pressure band, never predict a boundary crossing.
export function displayedPressure(pressure,candidate){return isOverpressure(pressure)?(isOverpressure(candidate)?candidate:pressure):Math.min(OPERATING_MAX,candidate);}
export const WHEEL={width:510,height:560,x:255,y:280,radius:175};
export const TAU=Math.PI*2;
export function gaugeArc(low,high){const point=p=>{const a=(150+p*2.7)*Math.PI/180;return `${80*Math.cos(a)} ${80*Math.sin(a)}`;};return `M${point(low)}A80 80 0 0 1 ${point(high)}`;}
export function angularDelta(from,to){return Math.atan2(Math.sin(to-from),Math.cos(to-from));}
export function wheelPoint(svg,e){const r=svg.getBoundingClientRect(),scale=Math.min(r.width/WHEEL.width,r.height/WHEEL.height);return {x:(e.clientX-r.left-(r.width-WHEEL.width*scale)/2)/scale-WHEEL.x,y:(e.clientY-r.top-(r.height-WHEEL.height*scale)/2)/scale-WHEEL.y};}
// Display predictor only: bounded short projection and continuous reconciliation.
export function createPneumaticAnimator({paint,now=()=>performance.now()}){
 let snapshot=null,received=0,angleOffset=0,pressureOffset=0,suspended=true;
 function position(){if(!snapshot)return null;const age=suspended||snapshot.status!=='running'?0:Math.min(.15,Math.max(0,(now()-received)/1000));
  return {angle:snapshot.brace.angle+snapshot.brace.speed*age+angleOffset*Math.max(0,1-age/.15),pressure:displayedPressure(snapshot.brace.pressure,Math.max(0,Math.min(100,snapshot.brace.pressure+snapshot.brace.pressureRate*age+pressureOffset*Math.max(0,1-age/.15))))};
 }
 return {update(next){const old=position(),fresh=!snapshot||suspended||next.epoch!==snapshot.epoch||next.status!==snapshot.status||next.brace.trips!==snapshot.brace.trips;
   if(!fresh&&next.elapsed===snapshot.elapsed&&next.brace.angle===snapshot.brace.angle&&next.brace.speed===snapshot.brace.speed&&next.brace.pressure===snapshot.brace.pressure&&next.brace.pressureRate===snapshot.brace.pressureRate){snapshot=next;paint(position());return;}
   snapshot=next;received=now();suspended=false;angleOffset=fresh?0:(old?.angle??next.brace.angle)-next.brace.angle;pressureOffset=fresh?0:(old?.pressure??next.brace.pressure)-next.brace.pressure;paint(position());
  },tick(){const p=position();if(p)paint(p);},suspend(){suspended=true;snapshot=null;angleOffset=pressureOffset=0;},position};
}
