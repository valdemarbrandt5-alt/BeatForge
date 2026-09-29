export type PlayerSettings={
  volume:number;
  keys:string[];
  resetKey:string;
  pauseKey:string;
  notePalette:'combo'|'guitar';
  laneColors:string[];
  comboColors:string[];
  guitarComboLaneColors:string[][];
  guitarBackgroundColors:string[];
  noteTravel:number;
};

const color=(value:unknown)=>typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value);
const colorList=(value:unknown,length:number):value is string[]=>Array.isArray(value)&&value.length===length&&value.every(color);
const key=(value:unknown):value is string=>typeof value==='string'&&value.length>0&&value.length<24;

export function parsePlayerSettings(value:unknown):Partial<PlayerSettings>|null{
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const raw=value as Record<string,unknown>,result:Partial<PlayerSettings>={};
  if(typeof raw.volume==='number'&&Number.isFinite(raw.volume))result.volume=Math.max(0,Math.min(1,raw.volume));
  if(Array.isArray(raw.keys)&&raw.keys.length===5&&raw.keys.every(key))result.keys=raw.keys;
  if(key(raw.resetKey))result.resetKey=raw.resetKey;
  if(key(raw.pauseKey))result.pauseKey=raw.pauseKey;
  if(raw.notePalette==='combo'||raw.notePalette==='guitar')result.notePalette=raw.notePalette;
  if(colorList(raw.laneColors,5))result.laneColors=raw.laneColors;
  if(colorList(raw.comboColors,4))result.comboColors=raw.comboColors;
  if(colorList(raw.guitarBackgroundColors,3))result.guitarBackgroundColors=raw.guitarBackgroundColors;
  if(Array.isArray(raw.guitarComboLaneColors)&&raw.guitarComboLaneColors.length===3&&raw.guitarComboLaneColors.every(group=>colorList(group,5)))result.guitarComboLaneColors=raw.guitarComboLaneColors as string[][];
  if([3,2.1,1.5,1.2].includes(Number(raw.noteTravel)))result.noteTravel=Number(raw.noteTravel);
  return Object.keys(result).length?result:null;
}

export function parseSettingsTransfer(text:string):Partial<PlayerSettings>|null{
  if(text.length>20000)return null;
  try{const value=JSON.parse(text);return parsePlayerSettings(value?.settings??value)}catch{return null}
}
