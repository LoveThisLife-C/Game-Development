import {SCREEN,RULES,project,patchCentre,exposedEdges,clamp,COLLECTOR,TOGGLE,phase} from './model.js';
const points=nodes=>nodes.map(p=>`${p.x},${p.y}`).join(' ');
function shade(nodes,id) {
 const a=nodes[0],b=nodes[1],c=nodes[2],ux=b.x-a.x,uy=b.y-a.y,uz=b.z-a.z,vx=c.x-a.x,vy=c.y-a.y,vz=c.z-a.z;
 const nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;
 const lighting=Math.abs((nz+.3*ny-.2*nx)/(Math.hypot(nx,ny,nz)||1));
 return `hsl(${43+id%4} 17% ${27+lighting*16+(id%3)*.7}%)`;
}
export function apparatus(s,hover=null) {
 const ordered=s.patches.filter(p=>!p.secured).map(p=>({p,c:patchCentre(s,p)})).sort((a,b)=>a.c.z-b.c.z);
 const shadows=ordered.map(({p,c})=>`<polygon points="${points(p.ids.map(id=>s.nodes[id]))}" fill="#02080a" opacity="${Math.max(.03,.32-c.z*.002)}"/>`).join('');
 const depthCues=ordered.filter(({p,c})=>p.id%10===0&&c.z>30).map(({c})=>{const v=project(c);return `<path d="M${c.x} ${c.y}L${v.x} ${v.y}" stroke="#a8bbb0" stroke-dasharray="3 5" opacity=".4"/><ellipse cx="${c.x}" cy="${c.y}" rx="6" ry="2" fill="#02080a" opacity=".4"/>`;}).join('');
 const bridges=s.seams.filter(e=>!e.broken&&!s.patches[e.a].secured&&!s.patches[e.b].secured).map(e=>{
  const n=[s.nodes[e.pairs[0][0]],s.nodes[e.pairs[1][0]],s.nodes[e.pairs[1][1]],s.nodes[e.pairs[0][1]]];
  return `<polygon points="${points(n.map(project))}" fill="${e.stress>.68?'#9e875c':'#68634e'}"/>`;
 }).join('');
 const edges=exposedEdges(s).map(edge=>{
  const a=project(s.nodes[edge.a]),b=project(s.nodes[edge.b]);
  return {patch:edge.patch,path:`<path d="M${a.x} ${a.y}L${b.x} ${b.y}" stroke="${edge.torn?'#c3b28b':'#d6c494'}" stroke-width="${edge.torn?2.2:3}" fill="none"/>${edge.torn?`<path d="M${(a.x+b.x)/2} ${(a.y+b.y)/2}l3-4" stroke="#d6c7a0" stroke-width="2"/>`:''}`};
 });
 const stressed=s.seams.filter(e=>!e.broken&&e.stress>.5).map(e=>{
  const a=project(s.nodes[e.pairs[0][0]]),b=project(s.nodes[e.pairs[1][0]]);
  return {patch:e.a,path:`<path d="M${a.x} ${a.y}L${b.x} ${b.y}" fill="none" stroke="${e.stress>.82?'#e4b572':'#ad9669'}" stroke-width="${1+e.stress*2}" opacity="${clamp((e.stress-.5)*2,0,1)}"/>`};
 });
 // Edges share their patch's depth order: no highlighted grab edge is painted
 // over a nearer flap that actually occludes it.
 const fabric=ordered.map(({p})=>{
  const n=p.ids.map(id=>s.nodes[id]),v=n.map(project),a={x:v[0].x*.2+v[1].x*.3+v[2].x*.5,y:v[0].y*.2+v[1].y*.3+v[2].y*.5};
  return `<polygon points="${points([v[0],v[1],v[2]])}" fill="${shade([n[0],n[1],n[2]],p.id)}"/><polygon points="${points([v[0],v[2],v[3]])}" fill="${shade([n[0],n[2],n[3]],p.id)}"/><path d="M${a.x-7} ${a.y}l14-3" stroke="#393c2e" stroke-width="${2+p.id%3}" opacity=".5"/>`+edges.concat(stressed).filter(e=>e.patch===p.id).map(e=>e.path).join('')+n.filter(n=>n.adhered).map(n=>{const v=project(n);return `<circle cx="${v.x}" cy="${v.y}" r="2.3" fill="#b29462"/>`;}).join('')+(p.fragment?`<path d="M${v[0].x} ${v[0].y}L${v[1].x} ${v[1].y}" stroke="#e7c5a0" stroke-width="3" stroke-dasharray="5 4"/>`:'');
 }).join('');
 const wisps=s.field.map((blocked,i)=>{
  if(blocked||i%11)return '';
  const x=SCREEN.x+(i%RULES.sampleCols+.5)/RULES.sampleCols*SCREEN.w,y=SCREEN.y+(Math.floor(i/RULES.sampleCols)+.5)/RULES.sampleRows*SCREEN.h;
  const z=27*(1-(s.time*(s.purge==='running'?5:.6+s.open*.6)+i*.07)%1),p=project({x,y,z});
  return `<path d="M${p.x} ${p.y}l-3 7" stroke="#91c8c1" opacity="${.18+s.open*.45}" stroke-width="2"/>`;
 }).join('');
 let hand='';
 if(s.grip){const g=s.grip,a=s.nodes[g.a],b=s.nodes[g.b],p=project({x:a.x*(1-g.t)+b.x*g.t,y:a.y*(1-g.t)+b.y*g.t,z:a.z*(1-g.t)+b.z*g.t});hand=`<circle cx="${p.x}" cy="${p.y}" r="10" fill="none" stroke="#f4e4b9" stroke-width="2"/>`;}
 else if(hover)hand=`<circle cx="${hover.x}" cy="${hover.y}" r="10" fill="none" stroke="#e0d3af" stroke-width="2"/>`;
 return `<defs><pattern id="grille" width="22" height="22" patternUnits="userSpaceOnUse"><rect width="22" height="22" fill="#0d2029"/><path d="M0 0h22v22" fill="none" stroke="#627779" stroke-width="4"/><path d="M5 6h12" stroke="#263e46" stroke-width="2"/></pattern><linearGradient id="housing" x2="0" y2="1"><stop stop-color="#637572"/><stop offset=".3" stop-color="#243a43"/><stop offset="1" stop-color="#152933"/></linearGradient><clipPath id="screenClip"><rect x="${SCREEN.x}" y="${SCREEN.y}" width="${SCREEN.w}" height="${SCREEN.h}"/></clipPath></defs>
 <rect x="34" y="38" width="1212" height="650" rx="13" fill="#11242d" stroke="#455b62" stroke-width="3"/>
 <rect x="${SCREEN.x-27}" y="${SCREEN.y-27}" width="${SCREEN.w+54}" height="${SCREEN.h+54}" rx="10" fill="url(#housing)" stroke="#87938b" stroke-width="3"/>
 <rect x="${SCREEN.x}" y="${SCREEN.y}" width="${SCREEN.w}" height="${SCREEN.h}" fill="url(#grille)"/>
 <g clip-path="url(#screenClip)">${shadows}${wisps}</g>
 <rect x="${COLLECTOR.x}" y="${COLLECTOR.y}" width="${COLLECTOR.w}" height="${COLLECTOR.h}" rx="9" fill="#071419" stroke="#70877d" stroke-width="4"/>
 <path d="M284 582H1028M284 660H1028" stroke="#9b9b79" stroke-width="8"/>
 <text x="302" y="644" class="minor">WASTE TAKE-UP · FEED ALL FREED MATERIAL DOWN HERE</text>
 <text x="84" y="150" class="minor">PROTECTED</text><text x="84" y="170" class="minor">EXTRACTION</text><text x="84" y="190" class="minor">BEHIND GRILLE</text>
 <text x="78" y="85" class="minor">PURGE EXHAUST · SERVICE-SIDE ACCESS</text>
 <text x="302" y="702" class="minor">${s.stats.patchesCollected?'REMOVED MATERIAL SECURED IN COLLECTION CASSETTE':'ONE COLLECTOR · INTACT SHEET AND TORN PIECES'}</text>
 ${s.stats.patchesCollected?`<path d="M304 615q35-23 70 0t70 0t70 0" stroke="#746b4f" fill="none" stroke-width="${Math.min(19,5+s.stats.patchesCollected/5)}"/>`:''}
 ${depthCues}${bridges}${fabric}${hand}
 <g>${[310,650,1000].map(x=>{const feed=s.patches.some(p=>p.intake==='collector'),a=feed?s.time*14:0;return `<circle cx="${x}" cy="583" r="10" fill="#536c68" stroke="#9aa99a" stroke-width="3"/><path d="M${x+7*Math.cos(a)} ${583+7*Math.sin(a)}l${-14*Math.cos(a)} ${-14*Math.sin(a)}" stroke="#172e35" stroke-width="3"/>`;}).join('')}</g>
 ${s.purge==='running'?`<g clip-path="url(#screenClip)" opacity=".7">${Array.from({length:16},(_,i)=>{const x=SCREEN.x+25+i*46,y=SCREEN.y+(s.time*280+i*33)%SCREEN.h;return `<path d="M${x} ${y}l-5 60" stroke="#b8ebdf" stroke-width="5"/>`;}).join('')}</g><path d="M80 265h110l40-25v150l-40-25H80" fill="#8dbeb1" opacity="${.3+.2*Math.sin(s.time*15)}"/>`:''}
 <text x="78" y="101" class="minor">${s.grip?'PULL DOWN OR DIAGONALLY TO LIFT · SIDEWAYS LOADS SHEAR THE MATERIAL':'PEEL ↓  ·  ALL REMOVED MATERIAL GOES INTO THE LOWER COLLECTOR'}</text>`;
}
export function toggleApparatus(s){
 const t=s.toggle,x=TOGGLE.centreX+t.x,ready=phase(s)==='ready',running=s.purge==='running',flash=s.time-t.lastStroke<.12;
 return `<defs><linearGradient id="leverMetal" x2="0" y2="1"><stop stop-color="#a9b2a3"/><stop offset=".5" stop-color="#4c6467"/><stop offset="1" stop-color="#243c45"/></linearGradient></defs>
 <rect x="15" y="22" width="230" height="315" rx="18" fill="#142932" stroke="${ready?'#c5c48e':'#53696a'}" stroke-width="4"/>
 <path d="M45 90H215M45 236H215" stroke="#425956" stroke-width="9"/>
 <rect x="52" y="112" width="156" height="105" rx="15" fill="#08181f"/>
 <path d="M70 164H190" stroke="#a9b8a0" stroke-width="3" stroke-dasharray="7 7"/>
 <path d="M130 288L${x} ${TOGGLE.handleY}" stroke="#0a161c" stroke-width="21"/>
 <path d="M130 288L${x} ${TOGGLE.handleY}" stroke="url(#leverMetal)" stroke-width="14"/>
 <circle cx="130" cy="288" r="24" fill="url(#leverMetal)" stroke="#9caa96" stroke-width="4"/>
 <circle cx="130" cy="288" r="7" fill="#142b31"/>
 <rect x="${x-TOGGLE.handleW/2}" y="${TOGGLE.handleY-TOGGLE.handleH/2}" width="${TOGGLE.handleW}" height="${TOGGLE.handleH}" rx="12" fill="${flash?'#abb782':ready?'#6c805f':'#4b5b5b'}" stroke="${ready?'#e1d8a9':'#819189'}" stroke-width="5"/>
 ${[-37,-25,25,37].map(dx=>`<path d="M${x+dx} 145v42" stroke="#1b3336" stroke-width="3"/>`).join('')}
 <text x="${x}" y="172" text-anchor="middle" class="toggle-label">${ready?'GRIP':running?'PURGE':s.purge==='complete'?'SAFE':'LOCK'}</text>
 <text x="130" y="65" text-anchor="middle" class="toggle-label">← SHAKE FAST →</text>
 ${!ready&&!running?'<path d="M103 223h54" stroke="#bb9b69" stroke-width="8"/>':''}
 <path d="M130 315v30h90" fill="none" stroke="${flash||running?'#cedba5':'#627b70'}" stroke-width="9"/>
 ${flash?'<path d="M30 135l-9 10m218-10 9 10M27 188l-7 8m224-8 7 8" stroke="#e1d9a6" stroke-width="3"/>':''}`;
}
export function paintToggle(s,ui){
 const current=phase(s),t=s.toggle;
 ui.toggle.innerHTML=toggleApparatus(s);ui.toggle.style.cursor=t.grab?'grabbing':current==='ready'?'grab':'default';
 ui.toggle.setAttribute('aria-disabled',String(current!=='ready'));
 ui.toggleStatus.textContent=current==='ready'?'EXHAUST CLEAR — SHAKE TO PURGE':current==='purging'?'PURGE DISCHARGING':current==='stable'?'SYSTEM STABLE — YOU CAN LEAVE':'PURGE LOCKED — CLEAR EXHAUST';
 ui.charge.textContent=Math.round(t.charge)+'%';ui.chargeBar.style.width=t.charge+'%';ui.panel.dataset.phase=current;
}
export function paint(s,ui,hover=null) {
 ui.svg.innerHTML=apparatus(s,hover);ui.svg.style.cursor=s.grip?'grabbing':hover?'grab':'default';
 ui.obstruction.textContent=Math.round((1-s.open)*100)+'%';
 const running=s.purge==='running',done=s.purge==='complete';
 const title=done?'EMERGENCY PURGE COMPLETE':running?'EMERGENCY EXTRACTION ENGAGED':s.clear?'EXHAUST CLEAR — SHAKE TO PURGE':'PEEL THE FOULING · COLLECT ALL REMOVED MATERIAL';
 const note=done?'CABIN CONTAMINATION REDUCED · SYSTEM STABLE — YOU CAN LEAVE. The filter will need future attention.':running?'Protected replacement air admitted. Existing contamination is being expelled.':s.clear?'Hold the purge toggle. Shake rapidly LEFT and RIGHT until the system fires.': 'Grab a pale edge, pull clear, then feed ALL waste into the lower collector. Hard yanks create more pieces to handle.';
 if(ui.title.textContent!==title)ui.title.textContent=title;if(ui.note.textContent!==note)ui.note.textContent=note;
 ui.status.dataset.clear=String(s.clear||done);paintToggle(s,ui);ui.next.disabled=!done;
 ui.gas.textContent=Math.round(s.gas)+'%';ui.haze.style.opacity=String(s.gas/100);ui.gasBar.style.width=s.gas+'%';
 ui.cycle.textContent='TEST CYCLE '+s.cycle+' · GAS RESETS TO 60% EACH CYCLE';
}
