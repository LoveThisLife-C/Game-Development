// Shared authored geometry: curves are tessellated once for both drawing and coverage.
export const panels=[
 {id:0,name:'PIPE GASKETS',technique:'Follow the curved gasket seats around each pipe'},
 {id:1,name:'STEPPED HOUSING JOINT',technique:'Control the corners; lift to reposition'},
 {id:2,name:'BRANCHING CABLE PENETRATION',technique:'Choose a route through the forks; avoid retracing'},
];
const arc=(x,y,r,start,end,width)=>Array.from({length:121},(_,i)=>{const a=(start+(end-start)*i/120)*Math.PI/180;return [x+r*Math.cos(a),y+r*Math.sin(a),width];});
const line=(points,width=6)=>points.map((p,i)=>[...p,p[2]??(Array.isArray(width)?width[i%width.length]:width)].slice(0,3));
// Branch arms are separate repairable fractures sharing exact junction endpoints.
// No artificial connecting segment is added between disconnected cracks.
const authored=[
 [0,arc(220,245,105,0,360,6)],
 [0,arc(555,245,90,35,395,5)],
 [0,arc(555,245,122,200,325,8)],
 [1,line([[85,120],[255,120],[255,175],[355,175],[355,245],[210,245],[210,305],[90,305]],7)],
 [1,line([[440,110],[710,110],[710,180],[615,180],[615,260],[720,260]],5)],
 [1,line([[360,365],[440,365],[440,315],[540,315],[540,395],[650,395],[650,450],[390,450]], [5,8,6,7])],
 [2,line([[400,275],[392,335],[410,390],[400,455]],8)],
 [2,line([[400,275],[310,230],[260,170],[180,130],[90,150]], [8,7,6,5,4])],
 [2,line([[310,230],[245,280],[175,265],[95,320]], [7,6,5,4])],
 [2,line([[400,275],[480,220],[520,150],[610,120],[705,145]], [8,7,6,5,4])],
 [2,line([[480,220],[545,285],[605,270],[710,340]], [7,6,5,4])],
];
// The compact housing has full right-angle joints, not scaled copies of other panels.
for(const [panel,points] of authored)if(panel===1)for(const p of points){p[0]=400+(p[0]-400)*.78;p[1]=270+(p[1]-270)*.78;}
export const fractures=authored.map(([panel,points],id)=>({id,panel,name:`FRACTURE ${authored.slice(0,id).filter(([p])=>p===panel).length+1}`,points}));
export const cells=fractures.flatMap(f=>f.points.slice(1).flatMap((b,i)=>{const a=f.points[i],length=Math.hypot(b[0]-a[0],b[1]-a[1]),n=Math.ceil(length/6);return Array.from({length:n},(_,j)=>{const t=(j+.5)/n;return {panel:f.panel,fracture:f.id,x:a[0]+(b[0]-a[0])*t,y:a[1]+(b[1]-a[1])*t,width:a[2]+(b[2]-a[2])*t,length:length/n,a:[a[0]+(b[0]-a[0])*j/n,a[1]+(b[1]-a[1])*j/n],b:[a[0]+(b[0]-a[0])*(j+1)/n,a[1]+(b[1]-a[1])*(j+1)/n]};});}));
export const fractureLength=cells.reduce((sum,c)=>sum+c.length,0);

export const panelLengths=panels.map(p=>cells.filter(c=>c.panel===p.id).reduce((n,c)=>n+c.length,0));
export const LEGACY_LENGTH=1248.147171043894;

export const PREVIOUS_LENGTH=7261.233879438097;
