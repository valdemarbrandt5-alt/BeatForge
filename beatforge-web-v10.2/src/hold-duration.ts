/** Only charted, isolated sustained sounds become holds. Never invent one from spacing. */
export function clearHoldDuration(duration:number|undefined,nextOnset:number|undefined,time:number,minDuration=.9):number{
  if(!Number.isFinite(duration)||!duration||duration<minDuration)return 0;
  const available=nextOnset===undefined?duration:Math.min(duration,nextOnset-time-.08);
  return available>=minDuration?Math.min(available,3):0;
}
