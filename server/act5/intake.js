// Authored, deterministic board. The reference is server/developer-only.
export const SIZE=6;
export const SOURCE=18, DESTINATION=17; // (3,0) west -> (2,5) east
const N=1,E=2,S=4,W=8;
const masks={straight:N|S,elbow:N|E,tee:N|E|S,dead:N};
export const REFERENCE_PATH=Object.freeze([18, 24, 30, 31, 32, 26, 25, 19, 13, 12, 6, 0, 1, 2, 8, 14, 15, 9, 3, 4, 10, 11, 17]);
export const REFERENCE=Object.freeze({18: 2, 24: 0, 30: 0, 31: 1, 32: 3, 26: 2, 25: 0, 19: 0, 13: 2, 12: 0, 6: 0, 0: 1, 1: 1, 2: 2, 8: 0, 14: 0, 15: 3, 9: 0, 3: 1, 4: 2, 10: 0, 11: 2, 17: 0});
const types=['elbow', 'straight', 'elbow', 'elbow', 'elbow', 'tee', 'straight', 'elbow', 'straight', 'straight', 'elbow', 'elbow', 'elbow', 'elbow', 'elbow', 'elbow', 'dead', 'elbow', 'elbow', 'straight', 'tee', 'straight', 'straight', 'dead', 'straight', 'elbow', 'elbow', 'tee', 'elbow', 'dead', 'elbow', 'straight', 'elbow', 'straight', 'elbow', 'dead'];
const turns=[2, 0, 2, 2, 2, 2, 1, 3, 2, 1, 3, 0, 0, 2, 2, 0, 3, 0, 2, 3, 2, 1, 3, 2, 1, 3, 0, 1, 3, 2, 1, 0, 3, 1, 3, 2];
const fixed=new Set([2, 4, 12, 13, 17, 18, 32]);
export function createIntake(){return {size:SIZE,source:SOURCE,destination:DESTINATION,complete:false,rotations:0,tiles:types.map((type,id)=>({id,type,turns:turns[id],fixed:fixed.has(id)}))};}
export function openings(tile){let mask=masks[tile.type];for(let i=0;i<tile.turns%4;i++)mask=((mask<<1)&15)|(mask>>3);return mask;}
export function connectivity(intake){
 const reached=[],distance={},entries={},queue=[];
 if(openings(intake.tiles[SOURCE])&W){queue.push(SOURCE);distance[SOURCE]=0;entries[SOURCE]=W;}
 for(let q=0;q<queue.length;q++){
  const id=queue[q],row=Math.floor(id/SIZE),col=id%SIZE,mask=openings(intake.tiles[id]);reached.push(id);
  for(const [bit,opposite,dr,dc] of [[N,S,-1,0],[E,W,0,1],[S,N,1,0],[W,E,0,-1]]){
   const r=row+dr,c=col+dc,j=r*SIZE+c;
   if(r<0||r>=SIZE||c<0||c>=SIZE||!(mask&bit)||!(openings(intake.tiles[j])&opposite)||Object.hasOwn(distance,j))continue;
   entries[j]=opposite;distance[j]=distance[id]+1;queue.push(j);
  }
 }
 return {reached,distance,entries,connected:reached.includes(DESTINATION)&&!!(openings(intake.tiles[DESTINATION])&E)};
}
export function intakeView(state){return {...state.intake,tiles:state.intake.tiles.map(t=>({...t})),...connectivity(state.intake)};}
export function intakeError(state,player,action){
 const fail=(code,message)=>({code,message});
 if(state.stations.INTAKE_DIVERSION!==player)return fail('NOT_OWNER','Enter Intake Diversion before rotating ducts');
 if(state.status!=='running')return fail('SESSION_NOT_RUNNING',`Session is ${state.status}`);
 if(state.intake.complete)return fail('INTAKE_COMPLETE','Bypass route established; ducts are secured');
 if(!Number.isInteger(action.tile)||action.tile<0||action.tile>=SIZE*SIZE)return fail('INVALID_TILE','Unknown duct tile');
 if(state.intake.tiles[action.tile].fixed)return fail('FIXED_TILE','This duct is mechanically secured');
 return null;
}
export function rotateIntake(state,action){
 state.intake.tiles[action.tile].turns++;state.intake.rotations++;
 if(connectivity(state.intake).connected)state.intake.complete=true;
}
