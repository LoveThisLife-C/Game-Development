// Full-width steel ducts meet exactly at the midpoints of 100-unit square tiles.
export const ductPaths={straight:'M50 0V100',elbow:'M50 0V25Q50 50 75 50H100',tee:'M50 0V100M50 50H100',dead:'M50 0V62'};
export function intakeBoardMarkup(tiles,{size=6,source=18,destination=17}={}){const width=size*100+200,height=size*100+150,sourceY=130+Math.floor(source/size)*100,outletY=130+Math.floor(destination/size)*100;return `<svg viewBox="0 0 ${width} ${height}" class="intake-board" aria-label="Rotate ducts to connect the left contaminated intake to the right external bypass"><defs><linearGradient id="duct-steel"><stop stop-color="#a6b09d"/><stop offset=".35" stop-color="#52665b"/><stop offset=".7" stop-color="#9eaa98"/><stop offset="1" stop-color="#34483e"/></linearGradient></defs><text x="${width/2}" y="32" text-anchor="middle" class="station-title">EMERGENCY VENTILATION / DIVERSION MANIFOLD</text><path d="M0 ${sourceY}H100M${width-100} ${outletY}H${width}" stroke="url(#duct-steel)" stroke-width="42"/><path d="M0 ${sourceY}H100M${width-100} ${outletY}H${width}" stroke="#101c16" stroke-width="28"/><path class="intake-source-flow" d="M0 ${sourceY}H100" stroke="#b3bd57" stroke-width="12"/><path id="intake-outlet-flow" class="intake-flow" d="M${width-100} ${outletY}H${width}" stroke="#b3bd57" stroke-width="12" opacity="0"/><text x="48" y="${sourceY-51}" text-anchor="middle" class="intake-label">CONTAMINATED</text><text x="48" y="${sourceY-33}" text-anchor="middle" class="intake-label">INTAKE →</text><text x="${width-47}" y="${outletY-51}" text-anchor="middle" class="intake-label">EXTERNAL</text><text x="${width-47}" y="${outletY-33}" text-anchor="middle" class="intake-label">BYPASS →</text>${tiles.map(t=>{const d=ductPaths[t.type];return `<g id="intake-tile-${t.id}" class="intake-tile" role="button" tabindex="${t.fixed?-1:0}" aria-label="Row ${Math.floor(t.id/size)+1}, column ${t.id%size+1}: ${t.type}${t.fixed?', fixed':', rotate clockwise'}" transform="translate(${100+t.id%size*100} ${80+Math.floor(t.id/size)*100})"><rect width="100" height="100" fill="#26362e" stroke="#435248" stroke-width="1"/><g transform="translate(50 50)"><g id="intake-turn-${t.id}" class="intake-turn"><g transform="translate(-50 -50)" fill="none" stroke-linejoin="round"><path d="${d}" stroke="#0a120e" stroke-width="46"/><path d="${d}" stroke="url(#duct-steel)" stroke-width="42"/><path d="${d}" stroke="#0c1711" stroke-width="28"/><path d="${d}" stroke="#24352a" stroke-width="23"/><path id="intake-flow-${t.id}" class="intake-flow" d="${d}" stroke="#b7c354" stroke-width="12" opacity="0"/>${t.type==='dead'?'<path d="M31 62H69" stroke="#8b9984" stroke-width="7"/>':''}</g></g></g>${t.fixed?'<g class="intake-bolts" stroke="#afbaa5" stroke-width="2"><path d="M7 7h12v12H7ZM81 81h12v12H81Z" fill="#19271e"/><path d="M9 9l8 8M83 83l8 8"/></g>':''}</g>`;}).join('')}<text x="${width/2}" y="${height-38}" text-anchor="middle" class="station-small">CLICK DUCTS TO TURN 90° · BOLTED SECTIONS ARE FIXED</text></svg>`;}
export function attachIntake({get,send,player,onTurn=()=>{},onComplete=()=>{}}){
 let state,online=false,built=false;const pending=new Map();
 const enabled=()=>online&&state?.status==='running'&&state.stations.INTAKE_DIVERSION===player&&!state.intake.complete;
 function paint(){if(!state)return;const v=state.intake;
  for(const t of v.tiles){const extra=[...pending.values()].filter(p=>p.tile===t.id&&p.epoch===state.epoch).length;
   get('intake-turn-'+t.id).style.transform=`rotate(${(t.turns+extra)*90}deg)`;
   get('intake-tile-'+t.id).setAttribute('aria-disabled',String(!enabled()||t.fixed));
   const flow=get('intake-flow-'+t.id);flow.setAttribute('opacity',v.reached.includes(t.id)&&!extra?'.75':'0');flow.setAttribute('data-active',String(v.reached.includes(t.id)&&!extra));
   let entry=v.entries[t.id]??1;for(let i=0;i<t.turns%4;i++)entry=(entry>>1)|((entry&1)<<3);
   flow.setAttribute('d',t.type==='tee'&&entry===2?'M100 50H50M50 50V0M50 50V100':t.type==='tee'&&entry===4?'M50 100V0M50 50H100':ductPaths[t.type]);
   flow.style.animationDirection=t.type==='tee'||entry===1?'normal, normal':'reverse, normal';flow.style.setProperty?.('--arrival',`${(v.distance[t.id]??0)*.045}s`);
   flow.style.animationPlayState=state.status==='running'?'running':'paused';
  }
  get('intake-outlet-flow').setAttribute('opacity',v.complete?'1':'0');get('intake-outlet-flow').style.animationPlayState=state.status==='running'?'running':'paused';
  get('intake-board-wrap').setAttribute('data-complete',String(v.complete));
  get('intake-panel').setAttribute('data-complete',String(v.complete));
  get('intake-status').textContent=v.complete?'INTAKE DIVERTED':state.status!=='running'?'SESSION '+state.status.toUpperCase():'INTAKE EXPOSED — ROUTE INCOMPLETE';
  get('intake-condition').textContent=v.complete?'CONTAMINATED SOURCE ISOLATED':'Contaminated intake remains open. Establish the external bypass.';
  get('intake-completion').textContent=v.complete?'PERMANENT REPAIR COMPLETE · YOU CAN LEAVE THIS STATION':'';
  get('intake-hint').textContent=v.complete?'Bypass secured permanently. Other cabin leaks may remain.':'CLICK TO TURN 90° · Bolted ducts stay fixed · Connect inlet to outlet.';
 }
 function rotate(tile){if(!enabled()||state.intake.tiles[tile].fixed)return;
  const seq=send({type:'intake_rotate',tile});if(seq!==null){pending.set(seq,{tile,epoch:state.epoch});onTurn();paint();}
 }
 return {update(next){const old=state;state=next;online=true;if(old&&old.epoch!==next.epoch)pending.clear();
  if(!built){get('intake-board-wrap').innerHTML=intakeBoardMarkup(next.intake.tiles,next.intake);for(const t of next.intake.tiles){const node=get('intake-tile-'+t.id);node.addEventListener('click',()=>rotate(t.id));node.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&!e.repeat){e.preventDefault();rotate(t.id);}});}built=true;}
  if(old&&old.epoch===next.epoch&&!old.intake.complete&&next.intake.complete)onComplete();paint();
 },onResult(result){if(pending.get(result.seq)?.epoch===result.epoch)pending.delete(result.seq);},suspend(){online=false;pending.clear();paint();}};
}
