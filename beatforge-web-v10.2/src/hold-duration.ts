/** Validate a measured sustain. Notes on other lanes do not end the sound. */
export function clearHoldDuration(duration:number|undefined,minDuration=.9):number{
  if(!Number.isFinite(duration)||!duration||duration<minDuration)return 0;
  return Math.min(duration,3);
}
