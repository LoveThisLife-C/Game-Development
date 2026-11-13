// Pure, score-driven rendering parameters. No simulation state is changed.
export function accumulatedGasVisual(totalGas,sensitivity=1) {
  const depth=Math.max(0,totalGas)*sensitivity/30000;
  const coverage=depth/(depth+1.2);
  return {
    coverage,layerOpacity:.72,
    baseOpacity:.55*coverage,
    radiusX:180+1550*coverage,
    radiusY:140+600*depth/(depth+1),
    clouds:Array.from({length:12},(_,index)=>{
      const column=index%4,row=Math.floor(index/4);
      const threshold=.3+column*.65;
      return {cx:290+column*250,cy:105+row*215,
        rx:200+260*coverage,ry:150+150*coverage,
        opacity:.6*(depth/(depth+threshold+.5))**1.15};
    })
  };
}
