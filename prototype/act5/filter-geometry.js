// Shared authored physical geometry; no DOM, transport or random dependencies.
export const CHAMBER=Object.freeze({left:80,right:820,top:90,floor:520,bottom:600});
export const NOZZLE=Object.freeze({x:100,y:116});
// Collector walls are finite steel capsules, shared by drawing and collision code.
export const HOPPER=Object.freeze({mouthLeft:720,mouthRight:CHAMBER.right,mouthY:CHAMBER.floor,throatLeft:730,throatRight:810,throatY:560,collectionY:575,bottom:CHAMBER.bottom,wallRadius:5});
// Mouth coordinates denote clear edges; steel axes/caps remain outside them.
export const FLOOR=Object.freeze({ax:CHAMBER.left,ay:CHAMBER.floor,bx:HOPPER.mouthLeft-6,by:HOPPER.mouthY,radius:6});
export const HOPPER_GUIDES=Object.freeze([
 Object.freeze({ax:HOPPER.mouthLeft-HOPPER.wallRadius,ay:HOPPER.mouthY,bx:HOPPER.throatLeft,by:HOPPER.throatY,radius:HOPPER.wallRadius}),
 Object.freeze({ax:HOPPER.mouthRight+HOPPER.wallRadius,ay:HOPPER.mouthY,bx:HOPPER.throatRight,by:HOPPER.throatY,radius:HOPPER.wallRadius})
]);
export const HOPPER_WALLS=Object.freeze([
 Object.freeze({ax:HOPPER.throatLeft,ay:HOPPER.throatY,bx:HOPPER.throatLeft,by:HOPPER.bottom,radius:HOPPER.wallRadius}),
 Object.freeze({ax:HOPPER.throatRight,ay:HOPPER.throatY,bx:HOPPER.throatRight,by:HOPPER.bottom,radius:HOPPER.wallRadius})
]);
export const CHUTE=Object.freeze({left:HOPPER.throatLeft+HOPPER.wallRadius,right:HOPPER.throatRight-HOPPER.wallRadius,top:HOPPER.collectionY,bottom:HOPPER.bottom});
// Local extraction applies only where the circular footprint genuinely overlaps
// this 100×20 rectangle immediately above the visible mouth. Tangency is not entry.
export const SUCTION_ZONE=Object.freeze({left:HOPPER.mouthLeft,right:HOPPER.mouthRight,top:HOPPER.mouthY-20,bottom:HOPPER.mouthY,duration:.2});
export function overlapsSuctionZone(d){
 const x=Math.max(SUCTION_ZONE.left,Math.min(SUCTION_ZONE.right,d.x)),y=Math.max(SUCTION_ZONE.top,Math.min(SUCTION_ZONE.bottom,d.y));
 return (d.x-x)**2+(d.y-y)**2<d.radius*d.radius;
}
// Only renders an already-authorised capture; never chooses a collection outcome.
export function capturePosition(d,time){const c=d.capture,t=Math.max(0,Math.min(1,(time-c.startedAt)/SUCTION_ZONE.duration));return {x:c.fromX+(c.toX-c.fromX)*t,y:c.fromY+(c.toY-c.fromY)*t};}
export const BAFFLES=Object.freeze([{ax:270,ay:300,bx:420,by:340},{ax:545,ay:340,bx:685,by:380}]);
export const MAX_SPEED=650;
export const TYPES=Object.freeze({light:{mass:1,radius:11,weight:1},heavy:{mass:2.6,radius:18,weight:2},sticky:{mass:1.8,radius:14,weight:2}});
export const INITIAL_DEBRIS=Object.freeze([
 {type:'light',x:235,y:210},{type:'light',x:390,y:185},{type:'light',x:520,y:235},{type:'light',x:650,y:270},
 {type:'heavy',x:280,y:425},{type:'heavy',x:435,y:415},{type:'heavy',x:590,y:455},
 {type:'sticky',x:345,y:270},{type:'sticky',x:585,y:305},
 {type:'light',x:735,y:195},{type:'heavy',x:165,y:405}
]);
export const TOTAL_WEIGHT=INITIAL_DEBRIS.reduce((n,d)=>n+TYPES[d.type].weight,0);
export const JET_HALF_ANGLE=.18;
export function jetImpulse(d,angle,strength){const dx=d.x-NOZZLE.x,dy=d.y-NOZZLE.y,distance=Math.hypot(dx,dy),ux=Math.cos(angle),uy=Math.sin(angle),forward=dx*ux+dy*uy,lateral=Math.abs(dx*uy-dy*ux),width=12+Math.max(0,forward)*Math.tan(JET_HALF_ANGLE);
 if(forward<=0||distance>1100||lateral>width+d.radius)return {x:0,y:0,magnitude:0};
 const alignment=Math.max(0,1-lateral/(width+d.radius)),magnitude=strength*alignment*alignment/(1+distance/600);return {x:ux*magnitude,y:uy*magnitude,magnitude};}
