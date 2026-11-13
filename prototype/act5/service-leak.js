// Restored from saved Service Seal v0.6 source: narrow 25-unit wisps.
// Shared presentation only; coverage and simulation remain in their existing owners.
export function leakGradient(id){return `<linearGradient id="${id}" x1="0" y1="1" x2="0" y2="0"><stop stop-color="#bcc95d" stop-opacity=".7"/><stop offset="1" stop-color="#bcc95d" stop-opacity="0"/></linearGradient>`;}
export const leakCSS=`.narrow-leak{stroke-dasharray:9 13;animation:service-escape 1.8s linear infinite}
[data-animate="false"] .narrow-leak{animation-play-state:paused}
@keyframes service-escape{to{stroke-dashoffset:-22}}
@media(prefers-reduced-motion:reduce){.narrow-leak{animation:none;stroke-dasharray:none}}`;
export function narrowWisp(x,y,index,width=3,gradient='service-vapour'){
 const drift=((index*13)%9)-4;
 return `<path class="narrow-leak" d="M${x} ${y}q${drift} -7 ${drift+2} -13t${-drift} -12" fill="none" stroke="url(#${gradient})" stroke-width="${Math.min(4,width)}" stroke-linecap="round" style="animation-delay:-${(index%19)/10}s"/>`;
}
