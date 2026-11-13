// Multiple independent actions may be in flight. A receipt settles only its own ID.
export function createActionChannel({nextSequence,getEpoch,transmit,onResult=()=>{},onPending=()=>{}}) {
  const pending=new Map();
  const key=(epoch,seq)=>`${epoch}:${seq}`;
  function send(action) {
    const message={...action,seq:nextSequence(),epoch:getEpoch()};
    pending.set(key(message.epoch,message.seq),message);
    onPending(pending.size);
    if(!transmit(message)) {
      pending.delete(key(message.epoch,message.seq));
      onResult({...message,status:'unconfirmed',code:'DISCONNECTED',message:'Input not sent: connection unavailable'});
      onPending(pending.size);
      return null;
    }
    return message.seq;
  }
  function receive(receipt) {
    const id=key(receipt.epoch,receipt.seq), action=pending.get(id);
    if(!action)return false;
    pending.delete(id);
    onResult({...receipt,gestureId:action.gestureId,action:action.type});
    onPending(pending.size);
    return true;
  }
  function clear(reason='Connection lost before acknowledgement; outcome unconfirmed') {
    for(const action of pending.values())onResult({...action,status:'unconfirmed',code:'UNCONFIRMED',message:reason});
    pending.clear();onPending(0);
  }
  return {send,receive,clear,get pendingCount(){return pending.size;}};
}
