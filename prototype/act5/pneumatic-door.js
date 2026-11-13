// Mechanical feedback only. Leak strength is supplied by the authoritative gas projection.
export function doorFeedbackMarkup(){return `<g id="pneumatic-door" transform="translate(573 307) scale(.7)" pointer-events="none" aria-label="Pneumatic rams reduce the damaged door gap; permanent repair heads remain fitted">
 <rect x="25" y="2" width="214" height="230" rx="4" fill="#607366" stroke="#14271c" stroke-width="5"/><rect x="35" y="12" width="190" height="210" fill="#07140e"/>
 <rect id="door-gap" x="39" y="21" width="14" height="190" fill="#12140b"/>
 <g id="door-leak" fill="none" stroke="#bec853" stroke-width="5" stroke-linecap="round"><path d="M44 45Q17 39 10 22M44 95Q14 91 5 78M44 156Q16 157 6 141M44 198Q14 207 8 221"/></g>
 <g id="door-leaf" transform="translate(12 0)"><rect x="47" y="19" width="166" height="194" rx="3" fill="#314c3d" stroke="#a2ad94" stroke-width="3"/><path d="M61 28V203M199 28V203M63 53H197M63 174H197" stroke="#506d55" stroke-width="4"/><rect x="111" y="84" width="48" height="59" rx="3" fill="#17291e" stroke="#7d8f74"/><path d="M116 99H151" stroke="#b7c6a0" stroke-width="5"/>
 ${[0,1,2,3].map(i=>`<rect id="door-repair-head-${i}" x="54" y="${37+i*45}" width="20" height="13" rx="2" fill="#b5c7a0" opacity=".15"/>`).join('')}</g>
 ${[65,166].map((y,i)=>`<path id="door-ram-${i}" d="M245 ${y}H225" stroke="#d7dcc3" stroke-width="7"/><rect x="238" y="${y-11}" width="30" height="22" rx="3" fill="#718974" stroke="#b3c09f" stroke-width="2"/>`).join('')}
 <text x="28" y="252" fill="#bac9a8" font-size="15">RAMS → DOOR / GASKET</text></g>`;}
export function doorFeedbackGeometry(s){const gap=2+12*(1-s.brace.effectiveness*.65)*(1-s.repair.secured/4*.45);return {gap,leak:s.visual.doorLeak};}
export function paintDoorFeedback(get,s){const p=doorFeedbackGeometry(s);get('door-leaf').setAttribute('transform',`translate(${p.gap} 0)`);get('door-gap').setAttribute('width',8+p.gap);get('door-leak').setAttribute('opacity',p.leak===0?0:.12+.65*p.leak);for(let i=0;i<2;i++)get('door-ram-'+i).setAttribute('d',`M245 ${i===0?65:166}H${213+p.gap}`);for(let i=0;i<4;i++)get('door-repair-head-'+i).setAttribute('opacity',i<s.repair.secured?1:.15);}
