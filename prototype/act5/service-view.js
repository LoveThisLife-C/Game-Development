export function panelDeposits(deposits,panel){
  return (deposits??[]).filter(deposit=>deposit.panel===panel);
}
