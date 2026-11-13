// One continuous wall slot per site. Wear extends the SAME opening along its
// seam, about a fixed centre. Render, sealing samples and leakage share this data.
export const LEAK_SITES=Object.freeze([
 Object.freeze({x:450,y:170,side:'top'}),Object.freeze({x:690,y:170,side:'top'}),Object.freeze({x:575,y:570,side:'bottom'})
]);
const widths=[[80,56,84],[92,60,92],[96,88,96]];
// Targets are assigned only after normal-input calibration (calibration.json).
export const DAMAGE_STAGES=Object.freeze([
 Object.freeze({name:'INITIAL DAMAGE',target:.85}),
 Object.freeze({name:'SEAM DETERIORATION',target:.80}),
 Object.freeze({name:'ADVANCED DAMAGE',target:.76})
]);
export function damageLeaks(stage=0){
 if(!Number.isInteger(stage)||stage<0||stage>2)throw Error('Unknown damage stage');
 return LEAK_SITES.map((site,i)=>{
  const width=widths[stage][i],left=-width/2,right=width/2,near=2,depth=8,sign=site.side==='top'?1:-1;
  const outline=[{x:site.x+left,y:site.y+sign*near},{x:site.x+left,y:site.y+sign*depth},{x:site.x+right,y:site.y+sign*depth},{x:site.x+right,y:site.y+sign*near}];
  // A fixed two-unit world lattice makes growing openings a superset of old ones.
  const samples=[];for(let u=left+1;u<right;u+=2)for(let v=near+1;v<depth;v+=2)samples.push({x:site.x+u,y:site.y+sign*v});
  return {...site,left,right,width,near,depth,outline,samples,area:width*(depth-near)};
 });
}
