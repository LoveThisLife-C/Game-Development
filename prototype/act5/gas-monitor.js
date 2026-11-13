// Shared presentation of authoritative readings. No scoring or optimistic prediction.
export const formatIngress=n=>n===0?'0.0 gas units/s':n<.05?'<0.1 gas units/s':`${n.toFixed(1)} gas units/s`;
export function gasReadout(state){
 if(state.airQuality!=='WORKING'||!state.air)return {offline:true,level:'AIR QUALITY SENSOR OFFLINE',rate:'—',trend:'',scale:'Use visible leakage and mechanical condition.',note:'Numeric gas readings unavailable.'};
 const a=state.air;
 return {offline:false,level:`${a.contamination.toFixed(1)} CU`,rate:formatIngress(a.ingressRate),trend:`${a.rateTrend==='FALLING'?'↓':a.rateTrend==='RISING'?'↑':'—'} RATE ${a.rateTrend}`,scale:a.scale,note:state.status==='running'?'Repair limits ingress; scrubbing treats incoming burden. Purge removes current gas; historical exposure remains.':`SIMULATION ${state.status.toUpperCase()} · rate shown for these mechanical conditions.`};
}
export function gasMonitorMarkup(){return `<section class="gas-monitor" aria-label="Shared cabin gas monitor"><div><span>CURRENT CABIN GAS</span><strong id="gas-level">—</strong></div><div><span>NET GAS INGRESS</span><strong id="gas-rate">—</strong><small id="gas-rate-trend"></small></div><p id="gas-source"></p><small id="gas-scale"></small><small id="gas-note"></small></section>`;}
export function stationGasContext(s,player){
 const station=Object.keys(s.stations).find(k=>s.stations[k]===player),numeric=s.airQuality==='WORKING'&&s.air;
 const source=(name,key)=>numeric?`${name}: ${formatIngress(s.air.sources[key])}`:`${name}: sensor offline`;
 if(station==='DOOR_BRACE'||station==='DOOR_REPAIR')return `${source('Door ingress','door')} · ${s.repair.secured}/4 repair locks · pneumatic brace ${s.brace.engaged?'engaged':'disengaged'}`;
 if(station==='INTAKE_DIVERSION')return `${s.intake.complete?'BYPASS ESTABLISHED — intake source eliminated':'INTAKE OPEN — route to external bypass'} · ${source('Intake ingress','intake')}`;
 if(station==='SERVICE_SEAL')return `${source('Service ingress','service')} · ${Math.floor(s.service.coverage*100)}% sealed · local leaks follow actual coverage`;
 if(station==='EMERGENCY_PURGE')return `${s.purge.operatingState} · peel, collect, shake to purge · removes existing airborne contamination; historical exposure remains`;
 if(station==='DEMISTER_DRAINAGE')return `${s.demister.operatingState} · ${s.demister.model.drops.length} droplets remaining${numeric?' · scrubber capacity ×'+s.demister.modifier.toFixed(2):' · sensor offline'} · future treatment only`;
 if(station==='CHEMICAL_SCRUBBER')return `${s.scrubber.operatingState} · ${s.scrubber.progress.remaining} to treat${numeric?' · treating '+formatIngress(s.air.treatmentRate)+' of '+formatIngress(s.air.grossIngressRate)+' incoming':' · sensor offline'} · external leaks continue`;
 if(station==='LIVE_WIRE')return `${s.liveWire.secured}/4 connections secured${numeric?' · support factor ×'+s.air.electricalMultiplier.toFixed(2):' · sensor offline'} · reconnect to reduce future ingress`;
 if(station==='FILTER_BANK')return `${Math.round(s.filter.obstruction*100)}% filter obstruction${numeric?' · door/service amplification ×'+s.air.filterMultiplier.toFixed(2):''} · clearing debris reduces amplification`;
 return 'LIVE CABIN TOTALS · shared across all ten stations';
}
export function attachGasMonitor({get,player}){
 get('gas-monitor').innerHTML=gasMonitorMarkup();
 return {update(s){const r=gasReadout(s);get('gas-level').textContent=r.level;get('gas-rate').textContent=r.rate;get('gas-rate-trend').textContent=r.trend;get('gas-scale').textContent=r.scale;get('gas-note').textContent=r.note;get('gas-source').textContent=stationGasContext(s,player);get('gas-monitor').setAttribute('data-offline',String(r.offline));},suspend(){get('gas-level').textContent='AWAITING LIVE CABIN DATA';get('gas-rate').textContent='—';get('gas-rate-trend').textContent='';get('gas-source').textContent='';get('gas-scale').textContent='';get('gas-note').textContent='Connection unavailable — readings withheld.';}};
}
