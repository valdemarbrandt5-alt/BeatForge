/** Only charted, isolated sustained sounds become holds. Never invent one from spacing. */
export function clearHoldDuration(duration:number|undefined,nextOnset:number|undefined,time:number):number{
  if(!Number.isFinite(duration)||!duration||duration<.9)return 0;
  const available=nextOnset===undefined?duration:Math.min(duration,nextOnset-time-.08);
  return available>=.9?Math.min(available,3):0;
}
