import fs from 'node:fs';

const file = new URL('../src/app/page.tsx', import.meta.url);
let source = fs.readFileSync(file, 'utf8');

const oldConfig = "const cfg={Easy:{chord:0,triple:0,overlap:0},Medium:{chord:11,triple:0,overlap:13},Hard:{chord:7,triple:0,overlap:8},Expert:{chord:5,triple:23,overlap:6}}[diff];";
const tunedConfig = "const cfg={Easy:{chord:0,triple:0,overlap:0},Medium:{chord:35,triple:0,overlap:45},Hard:{chord:25,triple:0,overlap:32},Expert:{chord:18,triple:97,overlap:24}}[diff];";

const strictRelease = "const up=(e:KeyboardEvent)=>{const lane=keys.indexOf(e.key.toLowerCase());if(lane<0)return;setHeldLanes(h=>h.map((v,i)=>i===lane?false:v));heldLanesRef.current=heldLanesRef.current.map((v,i)=>i===lane?false:v);setPressed(p=>p===lane?null:p);if(!running)return;const now=timeRef.current;setNotes(old=>{let broken=0;const next=old.map(n=>{if(n.lane!==lane||!n.holding||n.miss)return n;const end=n.time+(n.duration||0);if(end-now>.12){broken++;return{...n,holding:false,completed:true,miss:true}}return{...n,holding:false,completed:true}});if(broken){missSound();flashMissLane(lane);setCombo(0);comboRef.current=0;setJudge('MISS');setHitStats(s=>({...s,miss:s.miss+broken}))}return next})};";
const forgivingRelease = "const up=(e:KeyboardEvent)=>{const lane=keys.indexOf(e.key.toLowerCase());if(lane<0)return;setHeldLanes(h=>h.map((v,i)=>i===lane?false:v));heldLanesRef.current=heldLanesRef.current.map((v,i)=>i===lane?false:v);setPressed(p=>p===lane?null:p);if(!running)return;setNotes(old=>old.map(n=>n.lane===lane&&n.holding&&!n.miss?{...n,holding:false,completed:true}:n))};";

let changed = false;
if (source.includes(oldConfig)) {
  source = source.replace(oldConfig, tunedConfig);
  changed = true;
}
if (source.includes(strictRelease)) {
  source = source.replace(strictRelease, forgivingRelease);
  changed = true;
}

if (changed) fs.writeFileSync(file, source);
