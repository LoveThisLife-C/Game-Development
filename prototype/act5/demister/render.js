import {SURFACE,RULES,axes,adhesionAt} from './model.js';
const f=n=>Number(n).toFixed(2);
export function render(s){let out=`<defs>
 <linearGradient id="plate" x2=".25" y2="1"><stop stop-color="#67716a"/><stop offset=".32" stop-color="#485754"/><stop offset="1" stop-color="#293b3b"/></linearGradient>
 <radialGradient id="liquid" cx=".32" cy=".24" r=".82"><stop stop-color="#b8d9ae"/><stop offset=".38" stop-color="#7fb9a3"/><stop offset=".78" stop-color="#488c85"/><stop offset="1" stop-color="#225c60"/></radialGradient>
 <linearGradient id="drainLiquid" x2="0" y2="1"><stop stop-color="#90bda1"/><stop offset="1" stop-color="#376d69"/></linearGradient></defs>
 <rect x="153" y="63" width="907" height="652" rx="12" fill="#16282c" stroke="#5d716b" stroke-width="8"/>`;
 // Surrounding separator vanes stay OUTSIDE the one playable plate.
 for(const x of [170,977,1005])for(let y=132;y<615;y+=92)out+=`<path d="M${x} ${y}l17 25 -17 25 8 5 23 -30 -23 -30Z" fill="#81918a" stroke="#283c3e" stroke-width="2"/>`;
 out+=`<path d="M194 96H944L952 105V628H205L194 616Z" fill="#7c8780" stroke="#263d3e" stroke-width="3"/>
 <rect x="205" y="105" width="730" height="517" fill="url(#plate)"/>
 <path d="M205 105V622H935" fill="none" stroke="#b2b5a2" stroke-width="2"/>
 <path d="M193 91H949M960 105V621" fill="none" stroke="#0b2025" stroke-width="6"/>
 <text x="218" y="83" class="engraved">INCLINED COALESCER PLATE · D-10</text>
 <text x="977" y="91" class="small-label">TREATED</text><text x="977" y="105" class="small-label">AIR OUT</text>`;
 for(let y=123;y<612;y+=16)out+=`<path d="M216 ${y}h708" stroke="#b9c5b3" opacity=".055" stroke-width="1"/>`;
 for(let y=129;y<610;y+=36)for(let x=225;x<927;x+=48){const a=adhesionAt(x,y);out+=`<path d="M${x} ${y}l12 -2" stroke="#d2d2bd" opacity="${f(.04+(a-.9)*.25)}" stroke-width="1"/>`;}
 for(const x of [171,1039])for(const y of [84,686])out+=`<circle cx="${x}" cy="${y}" r="7" fill="#8b9b8d" stroke="#233b3b" stroke-width="2"/><path d="M${x-3} ${y}h6" stroke="#263c3e" stroke-width="2"/>`;
 for(const y of [182,458])out+=`<path d="M990 ${y}v36m-5 -6 5 6 5 -6" fill="none" stroke="#9fb4a8" stroke-width="2" opacity=".6"/>`;
 out+=`<text x="970" y="620" class="small-label">SEALED</text><text x="970" y="634" class="small-label">CASSETTE</text>`;
 for(const p of s.trails){const opacity=(1-(s.time-p.time)/.7)*.23;out+=`<ellipse data-liquid-trail="" cx="${f(p.x)}" cy="${f(p.y)}" rx="${f(p.r)}" ry="${f(p.r*2)}" fill="#b4d6ba" opacity="${f(opacity)}"/>`;}
 for(const d of s.drops){const {a,b}=axes(d),angle=d.angle*180/Math.PI;
  out+=`<g data-drop-id="${d.id}" transform="translate(${f(d.x)} ${f(d.y)}) rotate(${f(angle)})">
   <ellipse cx="1.8" cy="2.7" rx="${f(a+1)}" ry="${f(b+1)}" fill="#061b24" opacity=".7"/>
   <ellipse rx="${f(a)}" ry="${f(b)}" fill="url(#liquid)" stroke="#b2cdb0" stroke-width="1.15"/>
   <ellipse cx="${f(-a*.16)}" cy="${f(-b*.3)}" rx="${f(a*.51)}" ry="${f(b*.22)}" fill="#e2eed1" opacity=".38"/>
   <path d="M${f(a*.25)} ${f(b*.79)}Q${f(a*.82)} ${f(b*.52)} ${f(a*.87)} 0" fill="none" stroke="#133d46" stroke-width="1.4" opacity=".65"/>
  </g>`;
 }
 const fraction=Math.min(1,s.drainedVolume/s.totalVolume),level=12+fraction*27;
 out+=`<path d="M194 622h754l-14 70H208Z" fill="#0c1f26" stroke="#829b90" stroke-width="5"/>
 <path d="M${f(194+(level/62)*20)} ${f(692-level)}H${f(948-(level/62)*20)}L934 690H208Z" fill="url(#drainLiquid)" opacity="${fraction>0?'.95':'.15'}"/>
 <text x="430" y="716" class="engraved">DRAIN GUTTER → WASTE RECOVERY</text>`;
 for(const p of s.splashes){const u=(s.time-p.time)/.65,r=Math.sqrt(p.volume)*.7;out+=`<ellipse cx="${f(p.x)}" cy="652" rx="${f(10+r*u)}" ry="${f(2+7*u)}" fill="none" stroke="#ccdebe" stroke-width="2" opacity="${f(1-u)}"/>`;
  for(const direction of [-1,1])out+=`<path d="M${f(p.x)} 648Q${f(p.x+direction*r*.5*u)} ${f(640-30*Math.sin(Math.PI*u))} ${f(p.x+direction*r*u)} ${f(646-16*Math.sin(Math.PI*u))}" fill="none" stroke="#9bc8af" stroke-width="3" opacity="${f(1-u)}"/>`;
 }
 const t=s.tool;
 // Low-profile internal XY carriage; no long arm drawn over useful liquid paths.
 out+=`<rect x="${f(t.x-7)}" y="86" width="14" height="9" rx="2" fill="#aab7a2" stroke="#314648" stroke-width="2"/>
 <rect x="956" y="${f(t.y-6)}" width="8" height="12" rx="2" fill="#aab7a2" stroke="#314648" stroke-width="2"/>
 <rect x="${f(t.x-11)}" y="${f(t.y-24)}" width="22" height="10" rx="3" fill="#7d8f84" stroke="#233e40" stroke-width="2"/>
 <path d="M${f(t.x)} ${f(t.y-14)}v6" stroke="#c4cbb4" stroke-width="4"/>
 <circle class="demister-grab-ring" cx="${f(t.x)}" cy="${f(t.y)}" r="${t.held?18:30}" fill="${t.held?'#b6e7c8':'#f0d88e'}" fill-opacity=".06" stroke="${t.held?'#b6e7c8':'#f0d88e'}" stroke-width="${t.held?3:2.5}" stroke-dasharray="${t.held?'none':'7 5'}"/>
 <circle cx="${f(t.x)}" cy="${f(t.y)}" r="${RULES.toolRadius}" fill="${t.held?'#253e3f':'#63796f'}" fill-opacity="${t.held?'.9':'.65'}" stroke="${t.contact?'#e6d3a5':'#e7dfb3'}" stroke-width="3"/>
 <circle cx="${f(t.x)}" cy="${f(t.y)}" r="3.5" fill="#c1a36a"/>`;
 if(!t.held&&!s.complete)out+=`<text x="${f(Math.min(820,t.x+36))}" y="${f(Math.min(600,t.y+6))}" class="grab-label">CLICK + HOLD</text>`;
 if(t.held&&!s.complete)out+=`<text x="${f(Math.min(820,t.x+28))}" y="${f(Math.min(600,t.y+5))}" class="grab-label held">WIPER HELD</text>`;
 return out;
}
