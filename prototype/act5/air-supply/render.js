import {WORLD,CHAMBER,centre,radius,area,FLOW_RULES} from './model.js';
const names=['A','B','C'];
const polygon=b=>'M'+b.nodes.map(p=>p.x.toFixed(2)+','+p.y.toFixed(2)).join('L')+'Z';
export function scene(s){const m=s.metrics,mainStroke=Math.min(m.passage*.2,Math.max(2,m.flow*8)),fineStroke=Math.min(2,m.passage*.08);return `<defs>
<linearGradient id="housing" x2="0" y2="1"><stop stop-color="#3e555c"/><stop offset=".5" stop-color="#1d3038"/><stop offset="1" stop-color="#34474d"/></linearGradient>
<radialGradient id="rubber"><stop stop-color="#7b9186"/><stop offset=".6" stop-color="#4d6a64"/><stop offset="1" stop-color="#263f40"/></radialGradient>
<pattern id="mesh" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M24 0H0V24" fill="none" stroke="#77968f" stroke-opacity=".08"/></pattern>
</defs><rect x="103" y="131" width="1074" height="478" rx="22" fill="url(#housing)" stroke="#84978a" stroke-width="3"/>
<rect x="${CHAMBER.left}" y="${CHAMBER.top}" width="${CHAMBER.right-CHAMBER.left}" height="${CHAMBER.bottom-CHAMBER.top}" rx="4" fill="#0d2027" stroke="#728c86" stroke-width="5"/>
<rect x="140" y="170" width="1000" height="400" fill="url(#mesh)"/>
<path d="M25 292H140V448H25M1140 292H1255V448H1140" fill="#203d43" stroke="#80a69b" stroke-width="3"/>
<path d="M30 310H130M30 430H130M1150 310H1250M1150 430H1250" stroke="#4c6866"/>
<text x="55" y="274" class="minor">CLEAN AIR IN</text><text x="1149" y="274" class="minor">TO CABIN</text>

<g data-flow-mode="${m.route}" data-passage-width="${m.passage}" pointer-events="none">
${m.streamlines.map((line,i)=>`<path class="flow-line" data-streamline="${i}" d="M${line.map(p=>p.x.toFixed(2)+','+p.y.toFixed(2)).join('L')}" stroke-width="${i===1?mainStroke:fineStroke}" opacity="${.12+.32*m.flow}"/><path class="flow-line" d="M${line.map(p=>p.x.toFixed(2)+','+p.y.toFixed(2)).join('L')}" stroke-width="${i===1?Math.min(3,mainStroke):Math.min(1.5,fineStroke)}" stroke-dasharray="8 24" stroke-dashoffset="${-s.time*(30+80*m.flow)}" opacity="${.15+.5*m.flow}"/>`).join('')}
</g>
${[0,1,2].map(i=>{const x=40+(s.time*60+i*32)%82,y=m.path[0]?.y??370,endY=m.path.at(-1)?.y??370;return `<path d="M${x} ${y}h14m-5-5 5 5-5 5M${x+1110} ${endY}h14m-5-5 5 5-5 5" fill="none" stroke="#a3dccc" stroke-width="3" opacity="${.8*m.supply}"/>`;}).join('')}
${s.leaks.map((l,i)=>{const cover=m.leaks[i],sign=l.side==='top'?-1:1,j=l.y+sign*17,color=cover>=FLOW_RULES.sealCoverage?'#a7d4a9':cover>=.4?'#e1c274':'#e59b87';return `<path data-leak="${i}" d="M${l.outline.map(p=>p.x+','+p.y).join('L')}Z" fill="#482f30" stroke="${color}" stroke-width="2"/>
${[-1,0,1].map((a,n)=>`<path d="M${l.x+a*l.width*.22} ${j}q${a*13} ${sign*17} ${a*22} ${sign*(29+(Math.sin(s.time*7+n)+1)*9)}" fill="none" stroke="${color}" stroke-width="${2+(1-cover)*4}" opacity="${(1-cover)*.8}"/>`).join('')}
<text x="${l.x+l.left-12}" y="${l.side==='top'?154:594}" text-anchor="end" class="leak-number">L${i+1}</text>`;}).join('')}
${s.cushions.map(b=>{const c=centre(b),sel=s.selected===b.id,p=polygon(b),compression=area(b.nodes)/(Math.PI*radius(b)**2);return `<g data-cushion="${b.id}"><path d="${p}" fill="url(#rubber)" stroke="${sel?'#e7cc8a':'#92b2a1'}" stroke-width="${sel?4:2.5}" stroke-linejoin="round"/>
<path d="M${b.nodes[2].x} ${b.nodes[2].y}Q${c.x} ${c.y} ${b.nodes[14].x} ${b.nodes[14].y}M${b.nodes[8].x} ${b.nodes[8].y}Q${c.x} ${c.y} ${b.nodes[20].x} ${b.nodes[20].y}" fill="none" stroke="#a8ba9b" stroke-opacity=".33" stroke-width="2"/>
<path d="M${b.anchor.x} ${b.anchor.y}L${c.x} ${c.y}" stroke="#b7bdad" stroke-dasharray="3 4" opacity=".6"/><circle cx="${b.anchor.x}" cy="${b.anchor.y}" r="5" fill="none" stroke="#c2c4ac" opacity=".7"/>
<rect x="${c.x-23}" y="${c.y-23}" width="46" height="46" rx="12" fill="#263d40" stroke="#a7b7a2"/><text x="${c.x}" y="${c.y+9}" text-anchor="middle" class="cushion-label">${names[b.id]}</text>
${compression<.9?`<path d="M${c.x-12} ${c.y+32}l8-5 7 5 9-5" fill="none" stroke="#ccb787" opacity=".7"/>`:''}</g>`;}).join('')}
${[123,1157].map(x=>[151,589].map(y=>`<circle cx="${x}" cy="${y}" r="7" fill="#12262c" stroke="#91a295"/><path d="M${x-3} ${y+3}l6-6" stroke="#7b918a"/>`).join('')).join('')}
`;}
