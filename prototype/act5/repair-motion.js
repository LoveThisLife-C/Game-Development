// Shared physical silhouettes and timing calculations, used by renderer and engine.
export const repairMultipliers=[1,.86,.72,.58,.45];
// Stable IDs retained; each toothed boundary is both the physical head and its keyed socket.
export const lockShapes=Object.freeze([
 {id:'elbow',name:'COMPRESSION HEAD A',color:'#91aaa4',path:'M-7.82,-49.38L7.82,-49.38L8.87,-36.95L19.85,-32.40L28.21,-38.83L38.83,-28.21L32.40,-19.85L36.95,-8.87L49.38,-7.82L49.38,7.82L29.17,7.00L25.58,15.67L38.83,28.21L28.21,38.83L19.85,32.40L8.87,36.95L7.82,49.38L-7.82,49.38L-8.87,36.95L-19.85,32.40L-25.86,35.60L-35.60,25.86L-32.40,19.85L-36.95,8.87L-49.38,7.82L-49.38,-7.82L-36.95,-8.87L-32.40,-19.85L-38.83,-28.21L-28.21,-38.83L-15.67,-25.58L-7.00,-29.17Z',slot:{x:505,y:210,angle:45},rack:{x:110,y:210,angle:0}},
 {id:'tee',name:'COMPRESSION HEAD B',color:'#a5a2b0',path:'M-7.82,-49.38L7.82,-49.38L8.87,-36.95L19.85,-32.40L28.21,-38.83L38.83,-28.21L25.58,-15.67L29.17,-7.00L49.38,-7.82L49.38,7.82L36.95,8.87L32.40,19.85L38.83,28.21L28.21,38.83L19.85,32.40L8.87,36.95L6.88,43.46L-6.88,43.46L-8.87,36.95L-19.85,32.40L-29.39,40.45L-40.45,29.39L-25.58,15.67L-29.17,7.00L-49.38,7.82L-49.38,-7.82L-36.95,-8.87L-32.40,-19.85L-38.83,-28.21L-28.21,-38.83L-19.85,-32.40L-8.87,-36.95Z',slot:{x:755,y:210,angle:-90},rack:{x:245,y:210,angle:0}},
 {id:'step',name:'COMPRESSION HEAD C',color:'#b5aa87',path:'M-7.82,-49.38L7.82,-49.38L7.00,-29.17L15.67,-25.58L28.21,-38.83L38.83,-28.21L32.40,-19.85L36.95,-8.87L43.46,-6.88L43.46,6.88L36.95,8.87L32.40,19.85L40.45,29.39L29.39,40.45L19.85,32.40L8.87,36.95L7.82,49.38L-7.82,49.38L-8.87,36.95L-19.85,32.40L-28.21,38.83L-38.83,28.21L-25.58,15.67L-29.17,7.00L-49.38,7.82L-49.38,-7.82L-36.95,-8.87L-32.40,-19.85L-38.83,-28.21L-28.21,-38.83L-19.85,-32.40L-8.87,-36.95Z',slot:{x:505,y:465,angle:90},rack:{x:110,y:465,angle:0}},
 {id:'notch',name:'COMPRESSION HEAD D',color:'#ae9390',path:'M-7.82,-49.38L7.82,-49.38L8.87,-36.95L19.85,-32.40L25.86,-35.60L35.60,-25.86L32.40,-19.85L36.95,-8.87L49.38,-7.82L49.38,7.82L36.95,8.87L32.40,19.85L38.83,28.21L28.21,38.83L15.67,25.58L7.00,29.17L7.82,49.38L-7.82,49.38L-7.00,29.17L-15.67,25.58L-28.21,38.83L-38.83,28.21L-32.40,19.85L-36.95,8.87L-49.38,7.82L-49.38,-7.82L-36.95,-8.87L-32.40,-19.85L-38.83,-28.21L-28.21,-38.83L-19.85,-32.40L-8.87,-36.95Z',slot:{x:755,y:465,angle:135},rack:{x:245,y:465,angle:0}}
]);
export const LOCK_COUNT=lockShapes.length;
export const LOCK_SCALE=1.2;
export const ROTATION_STEP=45;
export const shapeById=id=>lockShapes.find(s=>s.id===id);
export const angleDifference=(a,b)=>Math.abs(((a-b+540)%360+360)%360-180);
export function fittingError(id,slotId,pose,positionTolerance,angleTolerance){const shape=shapeById(id);if(!shape||slotId!==id)return 'WRONG_SLOT';if(!pose||!['x','y','angle'].every(k=>Number.isFinite(pose[k])))return 'INVALID_POSE';if(Math.hypot(pose.x-shape.slot.x,pose.y-shape.slot.y)>positionTolerance)return 'POSITION_MISALIGNED';if(angleDifference(pose.angle,shape.slot.angle)>angleTolerance)return 'ROTATION_MISALIGNED';return null;}
export function timingPosition(elapsed,speed){const phase=Math.max(0,elapsed)*speed%200;return phase<=100?phase:200-phase;}
export function timingOutcome(position,width,center){return Math.abs(position-center)<=width/2?'SUCCESS':'FAILURE';}
export function timingProfile(config,index,locked){return {speed:config['repairSpeed'+(index+1)]*(locked?config.repairBraceSpeedFactor:1),width:Math.min(90,config['repairWidth'+(index+1)]+(locked?config.repairBraceWidthBonus:0)),braceLocked:locked};}
// Independent seeded stream: never consumes or changes Door Brace randomness.
export function targetCenter(seed,serial,width){let x=(seed^Math.imul(serial,0x9e3779b9))>>>0;x^=x>>>16;x=Math.imul(x,0x85ebca6b);x^=x>>>13;x=Math.imul(x,0xc2b2ae35);x=(x^(x>>>16))>>>0;return width/2+4+(92-width)*(x/4294967296);}
