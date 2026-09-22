'use client';
import {ChangeEvent,useEffect,useRef,useState} from 'react';
import type {User} from '@supabase/supabase-js';
import {supabase} from '../lib/supabase';
type Note={id:number,time:number,lane:number,duration?:number,hit?:boolean,miss?:boolean,holding?:boolean,completed?:boolean};
type Feedback='READY'|'PERFECT'|'GREAT'|'GOOD'|'MISS';
type Difficulty='Easy'|'Medium'|'Hard'|'Expert';
type SavedChart={id:string,title:string,difficulty:Difficulty,lane_count:number,duration:number,notes:Note[],created_at:string,audio_path?:string|null};
const defaults=['d','f','j','k','l'];
const PRE_ROLL=3.0;
const comboMultiplier=(combo:number)=>combo>=50?5:combo>=30?4:combo>=20?3:combo>=10?2:1;
const demo:Note[]=Array.from({length:72},(_,i)=>({id:i,time:2+i*.42,lane:(i*3+i%2)%5}));
export default function Home(){
 const [user,setUser]=useState<User|null>(null),[authOpen,setAuthOpen]=useState(false),[authMode,setAuthMode]=useState<'login'|'signup'>('login'),[authEmail,setAuthEmail]=useState(''),[authPassword,setAuthPassword]=useState(''),[authMessage,setAuthMessage]=useState(''),[laneCount,setLaneCount]=useState(5),[difficulty,setDifficulty]=useState<Difficulty>('Medium'),[baseNotes,setBaseNotes]=useState<Note[]>(demo),[keys,setKeys]=useState(defaults),[notes,setNotes]=useState<Note[]>(demo),[running,setRunning]=useState(false),[time,setTime]=useState(0),[combo,setCombo]=useState(0),[score,setScore]=useState(0),[judge,setJudge]=useState<Feedback>('READY'),[pressed,setPressed]=useState<number|null>(null),[impact,setImpact]=useState<{lane:number,id:number,kind:Feedback}|null>(null),[songName,setSongName]=useState('Demo chart'),[audioUrl,setAudioUrl]=useState<string|null>(null),[analyzing,setAnalyzing]=useState(false),[status,setStatus]=useState('Upload a song, or play the demo.'),[duration,setDuration]=useState(34),[volume,setVolume]=useState(0.8),[resultsOpen,setResultsOpen]=useState(false),[heldLanes,setHeldLanes]=useState<boolean[]>(Array(5).fill(false)),[hitStats,setHitStats]=useState({perfect:0,great:0,good:0,miss:0,maxCombo:0,timingSum:0,timingHits:0}),[holdScore,setHoldScore]=useState(0),[countIn,setCountIn]=useState<string|null>(null),[username,setUsername]=useState(''),[profileOpen,setProfileOpen]=useState(false),[myChartsOpen,setMyChartsOpen]=useState(false),[savedCharts,setSavedCharts]=useState<SavedChart[]>([]),[cloudMessage,setCloudMessage]=useState('');
 const audio=useRef<HTMLAudioElement|null>(null),raf=useRef(0),start=useRef(0),timeRef=useRef(0),impactId=useRef(0),urlRef=useRef<string|null>(null),fileRef=useRef<File|null>(null),progressKnob=useRef<HTMLDivElement|null>(null),progressFill=useRef<HTMLDivElement|null>(null),remainingLabel=useRef<HTMLSpanElement|null>(null),heldLanesRef=useRef<boolean[]>(Array(5).fill(false)),comboRef=useRef(0),lastFrameRef=useRef<number|null>(null),holdRemainder=useRef(0),audioStartedRef=useRef(false);
 useEffect(()=>{if(!supabase)return;supabase.auth.getUser().then(({data})=>setUser(data.user??null));const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,session)=>setUser(session?.user??null));return()=>subscription.unsubscribe()},[]);
 const submitAuth=async()=>{if(!supabase){setAuthMessage('Supabase is not configured.');return}setAuthMessage('Working…');const result=authMode==='login'?await supabase.auth.signInWithPassword({email:authEmail,password:authPassword}):await supabase.auth.signUp({email:authEmail,password:authPassword});if(result.error){setAuthMessage(result.error.message);return}if(authMode==='signup'&&!result.data.session){setAuthMessage('Check your email to confirm your account.');return}setAuthMessage('');setAuthOpen(false)};
 const logout=async()=>{if(supabase)await supabase.auth.signOut()};
 useEffect(()=>{if(!user||!supabase){setUsername('');return}supabase.from('profiles').select('username').eq('id',user.id).maybeSingle().then(({data})=>{if(data?.username)setUsername(data.username)})},[user]);
 const saveProfile=async()=>{if(!user||!supabase)return;const clean=username.trim();if(clean.length<3){setCloudMessage('Username must be at least 3 characters.');return}const {error}=await supabase.from('profiles').upsert({id:user.id,username:clean},{onConflict:'id'});if(error){setCloudMessage(error.message);return}setCloudMessage('Profile saved ✓');setTimeout(()=>setProfileOpen(false),500)};
 const ensureProfile=async()=>{if(!user||!supabase)return false;const {data}=await supabase.from('profiles').select('id').eq('id',user.id).maybeSingle();if(data)return true;setProfileOpen(true);setCloudMessage('Choose a username before saving charts.');return false};
 const saveChart=async()=>{if(!user||!supabase){setAuthOpen(true);return}if(!(await ensureProfile()))return;setCloudMessage('Saving chart…');let audioPath:string|null=null;if(fileRef.current){const ext=(fileRef.current.name.split('.').pop()||'audio').replace(/[^a-zA-Z0-9]/g,'');audioPath=`${user.id}/${crypto.randomUUID()}.${ext}`;const {error:audioError}=await supabase.storage.from('song-audio').upload(audioPath,fileRef.current,{contentType:fileRef.current.type||'audio/mpeg',upsert:false});if(audioError){setCloudMessage('Audio upload failed: '+audioError.message);return}}const cleanNotes=baseNotes.map(({id,time,lane,duration})=>({id,time,lane,...(duration?{duration}:{})}));const {error}=await supabase.from('charts').insert({user_id:user.id,title:songName,difficulty,lane_count:laneCount,duration:songDuration,notes:cleanNotes,audio_path:audioPath});if(error){if(audioPath)await supabase.storage.from('song-audio').remove([audioPath]);setCloudMessage(error.message);return}setCloudMessage(audioPath?'Chart + private audio saved ✓':'Chart saved ✓');setTimeout(()=>setCloudMessage(''),1800)};
 const loadMyCharts=async()=>{if(!user||!supabase){setAuthOpen(true);return}const {data,error}=await supabase.from('charts').select('id,title,difficulty,lane_count,duration,notes,created_at,audio_path').eq('user_id',user.id).order('created_at',{ascending:false});if(error){setCloudMessage(error.message);return}setSavedCharts((data||[]) as SavedChart[]);setMyChartsOpen(true)};
 const deleteSavedChart=async(chart:SavedChart,e:React.MouseEvent)=>{e.stopPropagation();if(!user||!supabase)return;if(!confirm(`Delete "${chart.title}"? This cannot be undone.`))return;setCloudMessage('Deleting chart…');if(chart.audio_path){const {error:audioError}=await supabase.storage.from('song-audio').remove([chart.audio_path]);if(audioError){setCloudMessage('Could not delete audio: '+audioError.message);return}}const {error}=await supabase.from('charts').delete().eq('id',chart.id).eq('user_id',user.id);if(error){setCloudMessage(error.message);return}setSavedCharts(x=>x.filter(v=>v.id!==chart.id));setCloudMessage('Chart deleted ✓');setTimeout(()=>setCloudMessage(''),1400)};
 const openSavedChart=async(chart:SavedChart)=>{const source=(chart.notes||[]).map((n,i)=>({...n,id:i,hit:false,miss:false,holding:false,completed:false}));if(audio.current){audio.current.pause();audio.current.currentTime=0}if(urlRef.current){URL.revokeObjectURL(urlRef.current);urlRef.current=null}setAudioUrl(null);fileRef.current=null;setSongName(chart.title);setDifficulty(chart.difficulty);setLaneCount(chart.lane_count);setDuration(chart.duration);setBaseNotes(source);setNotes(buildChart(source,chart.lane_count,chart.difficulty));setMyChartsOpen(false);if(chart.audio_path&&supabase){setStatus('Loading private audio…');const {data,error}=await supabase.storage.from('song-audio').createSignedUrl(chart.audio_path,60*60);if(!error&&data?.signedUrl){setAudioUrl(data.signedUrl);setStatus('Saved chart + audio ready');return}setStatus('Chart loaded, but private audio could not be loaded.')}else setStatus('Saved chart loaded · this older chart has no saved audio')};
 const buildChart=(source:Note[],lanes:number,diff:Difficulty)=>{const keep={Easy:.38,Medium:.62,Hard:.82,Expert:1}[diff];const kept=source.filter((_,i)=>keep===1||((i*37)%100)/100<keep);const blocked=Array(lanes).fill(-Infinity);return kept.map((n,i)=>{const preferred=n.lane%lanes;const order=[preferred,...Array.from({length:lanes},(_,x)=>x).filter(x=>x!==preferred)];const lane=order.find(x=>blocked[x]<=n.time-.08)??preferred;const dur=n.duration||0;if(dur>=.45)blocked[lane]=n.time+dur;return {...n,id:i,lane,hit:false,miss:false,holding:false,completed:false}})};
 useEffect(()=>{setKeys(k=>{const presets=[['f','j','k'],['d','f','j','k'],['d','f','j','k','l']][laneCount-3];return presets.map((d,i)=>k[i]??d)});setNotes(buildChart(baseNotes,laneCount,difficulty));setStatus(s=>songName==='Demo chart'?s:`${buildChart(baseNotes,laneCount,difficulty).length} notes · ${difficulty} · ${laneCount} lanes`);},[laneCount,difficulty]);
 const resetNotes=()=>setNotes(n=>n.map(x=>({...x,hit:false,miss:false,holding:false,completed:false}))); 
 useEffect(()=>{heldLanesRef.current=heldLanes},[heldLanes]);
 useEffect(()=>{comboRef.current=combo},[combo]);
 const resetStats=()=>setHitStats({perfect:0,great:0,good:0,miss:0,maxCombo:0,timingSum:0,timingHits:0});
 const finishSong=()=>{setRunning(false);cancelAnimationFrame(raf.current);setResultsOpen(true)};
 const stop=()=>{setRunning(false);cancelAnimationFrame(raf.current);if(audio.current){audio.current.pause();audio.current.currentTime=0}setTime(0);timeRef.current=0;setCombo(0);comboRef.current=0;setScore(0);setHoldScore(0);holdRemainder.current=0;lastFrameRef.current=null;setJudge('READY');setPressed(null);setResultsOpen(false);resetStats();resetNotes()};
 const play=async()=>{setResultsOpen(false);resetStats();setCombo(0);comboRef.current=0;setScore(0);setHoldScore(0);holdRemainder.current=0;lastFrameRef.current=null;setJudge('READY');setPressed(null);resetNotes();setTime(0);timeRef.current=0;setRunning(false);
  // Prime the audio while this click still counts as a user gesture, then pause it for the count-in.
  if(audio.current&&audioUrl){audio.current.currentTime=0;const wasMuted=audio.current.muted;audio.current.muted=true;try{await audio.current.play();audio.current.pause();audio.current.currentTime=0}catch{return}audio.current.muted=wasMuted}
  for(const label of ['3','2','1','GO!']){setCountIn(label);await new Promise(r=>setTimeout(r,label==='GO!'?450:700))}setCountIn(null);
  // Start the chart PRE_ROLL seconds before audio time 0. This gives the first notes
  // a full top-to-receptor approach instead of spawning halfway down the highway.
  audioStartedRef.current=false;start.current=performance.now()/1000+PRE_ROLL;timeRef.current=-PRE_ROLL;setTime(-PRE_ROLL);lastFrameRef.current=null;setRunning(true)};
 useEffect(()=>{if(!running)return;let lastUiUpdate=0;const loop=()=>{const now=performance.now()/1000;const dt=lastFrameRef.current==null?0:Math.min(.05,Math.max(0,now-lastFrameRef.current));lastFrameRef.current=now;let t:number;
   if(audio.current&&audioUrl){
    if(!audioStartedRef.current){
     t=now-start.current;
     if(t>=0){audio.current.currentTime=0;audio.current.play().catch(()=>{});audioStartedRef.current=true;t=0}
    }else t=audio.current.currentTime;
   }else t=now-start.current;
   timeRef.current=t;const total=audio.current&&audioUrl&&Number.isFinite(audio.current.duration)&&audio.current.duration>0?audio.current.duration:(audioUrl?duration:34);const smoothT=audio.current&&audioUrl&&audioStartedRef.current&&!audio.current.paused?Math.min(total,t+Math.max(0,now-(start.current+PRE_ROLL+t))):t;const p=total?Math.max(0,Math.min(1,smoothT/total)):0;if(progressFill.current)progressFill.current.style.height=`${p*100}%`;if(progressKnob.current)progressKnob.current.style.bottom=`calc(${p*100}% - 8px)`;if(remainingLabel.current)remainingLabel.current.textContent=fmt(Math.max(0,total-smoothT));timeRef.current=smoothT;setTime(smoothT);setNotes(old=>{let missedCount=0;let holdBonus=0;let changed=false;const next=old.map(n=>{if(smoothT>=0&&!n.hit&&!n.miss&&smoothT-n.time>.16){missedCount++;changed=true;return{...n,miss:true}}if(n.holding&&!n.miss){const end=n.time+(n.duration||0);if(heldLanesRef.current[n.lane]&&smoothT<end){holdBonus+=dt*250*comboMultiplier(comboRef.current)}if(smoothT>=end){changed=true;return{...n,holding:false,completed:true}}}return n});if(holdBonus){holdRemainder.current+=holdBonus;const pts=Math.floor(holdRemainder.current);if(pts>0){holdRemainder.current-=pts;setScore(s=>s+pts);setHoldScore(s=>s+pts)}}if(missedCount){setCombo(0);comboRef.current=0;setJudge('MISS');setHitStats(s=>({...s,miss:s.miss+missedCount}))}return changed?next:old});if(audio.current&&audioUrl&&audioStartedRef.current&&audio.current.ended)finishSong();else if(!audioUrl&&t>34)finishSong();else raf.current=requestAnimationFrame(loop)};raf.current=requestAnimationFrame(loop);return()=>cancelAnimationFrame(raf.current)},[running,audioUrl,duration]);
 useEffect(()=>{const down=(e:KeyboardEvent)=>{if(e.repeat)return;const lane=keys.indexOf(e.key.toLowerCase());if(lane<0)return;e.preventDefault();setHeldLanes(h=>h.map((v,i)=>i===lane?true:v));heldLanesRef.current=heldLanesRef.current.map((v,i)=>i===lane?true:v);setPressed(lane);if(!running)return;const now=timeRef.current;setNotes(old=>{let best=-1,delta=99;old.forEach((n,i)=>{const d=Math.abs(n.time-now);if(n.lane===lane&&!n.hit&&!n.miss&&d<delta){best=i;delta=d}});let kind:Feedback='MISS';if(best<0||delta>.16){setCombo(0);comboRef.current=0;setJudge('MISS');setHitStats(s=>({...s,miss:s.miss+1}))}else{const copy=[...old];const target=copy[best];const signedDelta=now-target.time;const isHold=(target.duration||0)>=.45;let basePoints=500;copy[best]={...target,hit:true,holding:isHold,completed:!isHold};if(delta<=.05){kind='PERFECT';basePoints=1000;setHitStats(s=>({...s,perfect:s.perfect+1,timingSum:s.timingSum+signedDelta,timingHits:s.timingHits+1}))}else if(delta<=.10){kind='GREAT';basePoints=800;setHitStats(s=>({...s,great:s.great+1,timingSum:s.timingSum+signedDelta,timingHits:s.timingHits+1}))}else{kind='GOOD';basePoints=500;setHitStats(s=>({...s,good:s.good+1,timingSum:s.timingSum+signedDelta,timingHits:s.timingHits+1}))}setJudge(kind);setCombo(c=>{const next=c+1;comboRef.current=next;setScore(s=>s+basePoints*comboMultiplier(next));setHitStats(s=>({...s,maxCombo:Math.max(s.maxCombo,next)}));return next});impactId.current++;setImpact({lane,id:impactId.current,kind});return copy}impactId.current++;setImpact({lane,id:impactId.current,kind});return old})};
 const up=(e:KeyboardEvent)=>{const lane=keys.indexOf(e.key.toLowerCase());if(lane<0)return;setHeldLanes(h=>h.map((v,i)=>i===lane?false:v));heldLanesRef.current=heldLanesRef.current.map((v,i)=>i===lane?false:v);setPressed(p=>p===lane?null:p);if(!running)return;setNotes(old=>old.map(n=>n.lane===lane&&n.holding&&!n.miss?{...n,holding:false,completed:true}:n))};
 const isTyping=()=>{const el=document.activeElement as HTMLElement|null;return !!el&&(el.tagName==='INPUT'||el.tagName==='TEXTAREA'||el.isContentEditable)};
 const safeDown=(e:KeyboardEvent)=>{if(isTyping())return;down(e)};const safeUp=(e:KeyboardEvent)=>{if(isTyping())return;up(e)};
 window.addEventListener('keydown',safeDown);window.addEventListener('keyup',safeUp);return()=>{window.removeEventListener('keydown',safeDown);window.removeEventListener('keyup',safeUp)}},[keys,running]);
 const analyze=(buffer:AudioBuffer)=>{
  // BeatForge Vocal Generator v0.15.
  // Browser-only vocal-focused analysis: band-pass the mix, track the vocal envelope,
  // reject short percussive spikes, and turn sustained phrases into holds.
  const sr=buffer.sampleRate, channels=buffer.numberOfChannels;
  const mono=new Float32Array(buffer.length);
  for(let c=0;c<channels;c++){const d=buffer.getChannelData(c);for(let i=0;i<d.length;i++)mono[i]+=d[i]/channels}

  // Cheap vocal emphasis without a server/model: high-pass ~110 Hz + low-pass ~4.2 kHz.
  // This removes most sub-bass and much of the cymbal/air band while preserving speech/singing.
  const vocal=new Float32Array(mono.length);
  const hpRC=1/(2*Math.PI*110), lpRC=1/(2*Math.PI*4200), dt=1/sr;
  const hpA=hpRC/(hpRC+dt), lpA=dt/(lpRC+dt);
  let hp=0,prevX=mono[0]||0,lp=0;
  for(let i=0;i<mono.length;i++){const x=mono[i];hp=hpA*(hp+x-prevX);prevX=x;lp+=lpA*(hp-lp);vocal[i]=lp}

  const hop=512, win=2048, frames=Math.max(1,Math.floor((vocal.length-win)/hop));
  const rms=new Float32Array(frames), zcr=new Float32Array(frames), rough=new Float32Array(frames);
  for(let f=0;f<frames;f++){
   const p=f*hop;let e=0,z=0,r=0,prev=vocal[p];
   for(let j=0;j<win;j+=2){const v=vocal[p+j];e+=v*v;r+=Math.abs(v-prev);if((v>=0)!=(prev>=0))z++;prev=v}
   rms[f]=Math.sqrt(e/(win/2));zcr[f]=z/(win/2);rough[f]=r/(win/2);
  }
  // Smooth the vocal envelope. Vocals normally persist across several frames; drums often do not.
  const env=new Float32Array(frames);
  for(let i=0;i<frames;i++){let sum=0,w=0;for(let k=-2;k<=2;k++){const q=i+k;if(q>=0&&q<frames){const ww=3-Math.abs(k);sum+=rms[q]*ww;w+=ww}}env[i]=sum/Math.max(1,w)}
  let maxEnv=0;for(const v of env)if(v>maxEnv)maxEnv=v;

  const novelty=new Float32Array(frames);let maxNovelty=0;
  for(let i=3;i<frames-3;i++){
   const rise=Math.max(0,env[i]-env[i-2]);
   const sustain=(env[i+2]+env[i+3])*.5;
   const sustainRatio=sustain/Math.max(.00001,env[i]);
   const noisy=Math.max(0,(rough[i]/Math.max(.00001,env[i]))-2.8);
   const vocalShape=Math.max(.15,Math.min(1.25,sustainRatio*1.15)) / (1+noisy*.22);
   novelty[i]=rise*vocalShape;
   if(novelty[i]>maxNovelty)maxNovelty=novelty[i];
  }

  const candidates:{t:number;strength:number;frame:number}[]=[];let last=-1;
  for(let i=5;i<frames-5;i++){
   let mean=0,dev=0,n=0;const a=Math.max(0,i-34),b=Math.min(frames,i+34);
   for(let k=a;k<b;k++){mean+=novelty[k];n++}mean/=Math.max(1,n);
   for(let k=a;k<b;k++)dev+=Math.abs(novelty[k]-mean);dev/=Math.max(1,n);
   const localFloor=Math.max(maxNovelty*.018,mean+dev*1.12);
   const voicedEnergy=env[i]/Math.max(.00001,maxEnv);
   const sustained=env[Math.min(frames-1,i+3)]>env[i]*.30;
   // Very high zero-crossing rates and one-frame energy bursts are commonly percussion/noise.
   const plausibleZcr=zcr[i]>.004&&zcr[i]<.34;
   // Use the centre of the analysis window rather than its left edge. The old
   // timestamp was systematically early by ~20-25 ms at common sample rates.
   // Then refine toward the strongest local envelope rise for tighter syllable alignment.
   let refined=i;let bestRise=-Infinity;
   for(let q=Math.max(2,i-2);q<=Math.min(frames-2,i+2);q++){const rr=env[q]-env[q-2];if(rr>bestRise){bestRise=rr;refined=q}}
   const t=(refined*hop+win/2)/sr;
   if(t>.22&&t-last>.115&&voicedEnergy>.018&&sustained&&plausibleZcr&&novelty[i]>localFloor&&novelty[i]>=novelty[i-1]&&novelty[i]>=novelty[i+1]){
    candidates.push({t,strength:novelty[i]/Math.max(.00001,maxNovelty),frame:i});last=t;
   }
  }

  // Merge near-duplicate attacks. This helps one sung syllable become one note rather than a cluster.
  const peaks:{t:number;strength:number;frame:number}[]=[];
  for(const p of candidates){const prev=peaks[peaks.length-1];if(prev&&p.t-prev.t<.18){if(p.strength>prev.strength)peaks[peaks.length-1]=p}else peaks.push(p)}

  // Find a loose rhythmic grid only for tiny timing corrections. Vocal timing remains the authority.
  const hist=new Map<number,number>();
  for(let i=1;i<peaks.length;i++)for(let back=1;back<=3&&i-back>=0;back++){
   let d=peaks[i].t-peaks[i-back].t;while(d<.30)d*=2;while(d>.85)d/=2;
   if(d>=.30&&d<=.85){const bin=Math.round(d/.01);hist.set(bin,(hist.get(bin)||0)+peaks[i].strength)}
  }
  let beat=.5,best=0;hist.forEach((v,k)=>{if(v>best){best=v;beat=k*.01}});const origin=peaks[0]?.t||0;

  const out:Note[]=[];let prevLane=-1,prevPrev=-1;
  peaks.forEach((p,idx)=>{
   if(p.strength<.035)return;
   const step=beat/2,grid=origin+Math.round((p.t-origin)/step)*step;
   const t=Math.abs(grid-p.t)<.035?grid:p.t; // less snapping than v0.14: preserve sung phrasing
   const candidates=[0,1,2,3,4].filter(l=>l!==prevLane||idx%6===0);
   const seed=((p.frame*1103515245+idx*12345)>>>0);let lane=candidates[seed%candidates.length];
   if(lane===prevPrev&&candidates.length>1)lane=candidates[(seed+2)%candidates.length];

   // Adaptive sustain tracking: quiet ballad vocals can decay a lot while the same sung note continues.
   // Use hysteresis and tolerate brief envelope dips instead of requiring continuously high energy.
   const base=env[p.frame],softFloor=Math.max(maxEnv*.0065,base*.20);let k=p.frame+1,lastVoiced=p.frame,quietFrames=0;
   const nextAttack=idx+1<peaks.length?peaks[idx+1].frame:frames;
   while(k<frames&&(k-p.frame)*hop/sr<4.5){
    const active=env[k]>softFloor;
    if(active){lastVoiced=k;quietFrames=0}else quietFrames++;
    // A clear later syllable starts a new note; tiny fluctuations inside a held vowel do not.
    const age=(k-p.frame)*hop/sr;
    const strongAttack=age>.28&&k<nextAttack+2&&novelty[k]>maxNovelty*.14&&novelty[k]>novelty[Math.max(0,k-2)]*1.45;
    if(strongAttack||quietFrames>7||k>=nextAttack)break;k++;
   }
   const sustained=(lastVoiced-p.frame)*hop/sr;let dur=0;
   if(sustained>=.46)dur=Math.min(4.5,Math.max(.45,sustained-.06));
   out.push({id:out.length,time:Math.max(.02,t),lane,duration:dur||undefined});prevPrev=prevLane;prevLane=lane;
  });
  if(out.length<8)return Array.from({length:Math.max(10,Math.floor(buffer.duration*1.25))},(_,i)=>({id:i,time:.9+i*.72,lane:(i*3)%5}));
  return out.slice(0,1600);
 };
 const ding=()=>{try{const ctx=new AudioContext();const o=ctx.createOscillator(),g=ctx.createGain();o.frequency.value=880;g.gain.setValueAtTime(.16,ctx.currentTime);g.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+.22);o.connect(g);g.connect(ctx.destination);o.start();o.stop(ctx.currentTime+.22);o.onended=()=>ctx.close()}catch{}};
 const upload=async(e:ChangeEvent<HTMLInputElement>)=>{const file=e.target.files?.[0];if(!file)return;stop();setAnalyzing(true);setStatus('Instant analysis…');if(urlRef.current)URL.revokeObjectURL(urlRef.current);const url=URL.createObjectURL(file);urlRef.current=url;setAudioUrl(url);setSongName(file.name);fileRef.current=file;try{const arr=await file.arrayBuffer();const ctx=new AudioContext();const buffer=await ctx.decodeAudioData(arr.slice(0));const t0=performance.now();const generated=analyze(buffer);const ms=performance.now()-t0;setBaseNotes(generated);setDuration(buffer.duration);const chart=buildChart(generated,laneCount,difficulty);setNotes(chart);setStatus(`${chart.length} notes · Vocal Generator · ${(ms/1000).toFixed(2)}s · ${difficulty} · ${laneCount} lanes`);await ctx.close();ding()}catch(err){console.error(err);setStatus('Could not analyze this audio file.');setNotes(demo)}finally{setAnalyzing(false)}};
 useEffect(()=>{if(audio.current)audio.current.volume=volume},[volume,audioUrl]);
 useEffect(()=>()=>{if(urlRef.current)URL.revokeObjectURL(urlRef.current)},[]);
 const travel=3.0;
 const upcoming=notes.filter(n=>!n.hit&&!n.miss&&n.time>=time&&n.time<=time+travel).length;
 const judged=hitStats.perfect+hitStats.great+hitStats.good+hitStats.miss;
 const accuracy=judged?((hitStats.perfect+hitStats.great*.8+hitStats.good*.5)/judged*100):0;
 const avgTimingMs=hitStats.timingHits?(hitStats.timingSum/hitStats.timingHits*1000):0;
 const timingLabel=Math.abs(avgTimingMs)<1?'ON TIME':avgTimingMs<0?'EARLY':'LATE';
 const songDuration=audioUrl?duration:34;
 const remaining=Math.max(0,songDuration-Math.max(0,time));
 const multiplier=comboMultiplier(combo);
 const performancePoints=hitStats.perfect+hitStats.great*.8+hitStats.good*.5;
 const chartProgress=songDuration>0?Math.max(0,Math.min(1,Math.max(0,time)/songDuration)):0;
 const performanceQuality=judged?performancePoints/judged:0;
 const starProgress=Math.max(0,Math.min(5,chartProgress*performanceQuality*5));
 const progress=songDuration?Math.max(0,Math.min(1,time/songDuration)):0;
 const fmt=(secs:number)=>{const s=Math.max(0,Math.ceil(secs));return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`};
 return <main><header><div><h1>BEAT<span>FORGE</span></h1><p>5 lane browser rhythm game · accounts enabled</p></div><div className="accountArea">{user?<><button className="accountBtn" onClick={loadMyCharts}>MY CHARTS</button><button className="accountBtn" onClick={()=>{setCloudMessage('');setProfileOpen(true)}}>{username||'SET USERNAME'}</button><span className="accountEmail">{user.email}</span><button className="accountBtn" onClick={logout}>LOG OUT</button></>:<button className="accountBtn" onClick={()=>{setAuthMode('login');setAuthMessage('');setAuthOpen(true)}}>LOGIN</button>}</div></header>
 <section className="upload"><label className="uploadBtn">UPLOAD SONG<input type="file" accept="audio/*,.mp3,.wav,.ogg,.m4a" onChange={upload}/></label><div><strong>{songName}</strong><small>{analyzing?'Analyzing…':status}</small></div></section>
 <section className="chartOptions"><div><small>LANES</small><div className="seg">{[3,4,5].map(x=><button key={x} className={laneCount===x?'active':''} onClick={()=>setLaneCount(x)}>{x}</button>)}</div></div><div><small>DIFFICULTY</small><div className="seg">{(['Easy','Medium','Hard','Expert'] as Difficulty[]).map(x=><button key={x} className={difficulty===x?'active':''} onClick={()=>setDifficulty(x)}>{x}</button>)}</div></div><p className="analysisNote">Vocal Generator active: browser-only analysis emphasizes singing and suppresses much of the instrumental mix. No server required.</p></section>
 {audioUrl&&<audio ref={audio} src={audioUrl} preload="auto"/>}
 <section className={`game ${multiplier===5?'goldMode':''}`}>{countIn&&<div className="countIn"><span>{countIn}</span></div>}<div className="gameHud"><div className="hudScore"><b>{score.toLocaleString()}</b><small>SCORE</small></div><div className="hudCombo"><b>{combo} COMBO</b><strong>×{multiplier}</strong></div><div className="starMeter"><div className="stars">{[1,2,3,4,5].map(x=><span key={x} className={starProgress>=x?'earned':starProgress>=x-.8?'active':''}>★</span>)}</div><div className="starRail"><i style={{width:`${starProgress/5*100}%`}}/></div></div></div><div className={`judge ${judge.toLowerCase()}`}>{judge}</div><div className="lanes" style={{gridTemplateColumns:`repeat(${laneCount},1fr)`}}>{keys.map((k,l)=><div className={`lane ${pressed===l?'pressed':''}`} key={l}>{notes.filter(n=>n.lane===l&&!n.miss&&(!n.completed)).map(n=>{const dur=n.duration||0;const end=n.time+dur;const remaining=n.time-time;if(end<time-.20||remaining>travel)return null;const p=1-(remaining/travel);const endP=1-((end-time)/travel);const hold=dur>=.45;const top=Math.min(p,endP)*88;const height=Math.max(18,Math.abs(p-endP)*.88*610);return hold?<div key={n.id} className={`holdNote ${n.holding?'holding':''}`} style={{top:`${top}%`,height:`${height}px`}}><div className="holdHead"/></div>:<div key={n.id} className="note" style={{top:`calc(${p*88}% - 0px)`}}/>})}<div className={`receptor ${pressed===l?'filled':''}`}/>{impact?.lane===l&&<div key={impact.id} className={`impact ${impact.kind.toLowerCase()}`}/>}<div className={`key ${pressed===l?'keyPressed':''}`}>{k.toUpperCase()}</div></div>)}</div><div className="songProgress" aria-label={`Song progress, ${fmt(remaining)} remaining`}><span ref={remainingLabel} className="remainingLabel">{fmt(remaining)}</span><div className="progressRail"><div ref={progressFill} className="progressFill" style={{height:`${progress*100}%`}}/><div ref={progressKnob} className="progressKnob" style={{bottom:`calc(${progress*100}% - 8px)`}}/></div><small>LEFT</small></div></section>
 <section className="controls"><span className="debug">{running?`${upcoming} upcoming notes`:`${notes.length} notes ready`}</span><button disabled={analyzing} onClick={running?stop:play}>{running?'STOP':analyzing?'ANALYZING…':'PLAY'}</button><button className="secondary" onClick={stop}>RESET</button><label className="volume"><span>VOLUME</span><input aria-label="Volume" type="range" min="0" max="1" step="0.01" value={volume} onChange={e=>{const v=Number(e.target.value);setVolume(v);if(audio.current)audio.current.volume=v}}/><b>{Math.round(volume*100)}%</b></label>{user&&songName!=='Demo chart'&&<button className="secondary" onClick={saveChart}>SAVE CHART</button>}<div className="time">{time<0?`READY ${Math.ceil(-time)}`:fmt(time)} / {fmt(songDuration)}</div></section>
 <section className="settings"><h2>Keybinds</h2><p>Click a box, then press the key you want for that lane.</p><div className="binds">{keys.map((k,i)=><button key={i} onKeyDown={e=>{e.preventDefault();setKeys(a=>a.map((x,j)=>j===i?e.key.toLowerCase():x))}}>{i+1}<strong>{k.toUpperCase()}</strong></button>)}</div></section>{cloudMessage&&<div className="cloudToast">{cloudMessage}</div>}{profileOpen&&<div className="resultBackdrop" role="dialog" aria-modal="true"><div className="resultCard authCard"><small>BEATFORGE PROFILE</small><h2>Choose your username</h2><input className="authInput" maxLength={24} placeholder="Username" value={username} onChange={e=>setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g,''))} onKeyDown={e=>{if(e.key==='Enter')saveProfile()}}/><p className="authMessage">This name will appear on leaderboards.</p><div className="resultActions"><button onClick={saveProfile}>SAVE PROFILE</button><button className="secondary" onClick={()=>setProfileOpen(false)}>CLOSE</button></div></div></div>}{myChartsOpen&&<div className="resultBackdrop" role="dialog" aria-modal="true"><div className="resultCard libraryCard"><small>BEATFORGE LIBRARY</small><h2>My Charts</h2><div className="chartLibrary">{savedCharts.length?savedCharts.map(ch=><div className="savedChartRow" key={ch.id}><button className="savedChart" onClick={()=>openSavedChart(ch)}><strong>{ch.title}</strong><span>{ch.difficulty} · {ch.lane_count} lanes · {ch.notes?.length||0} notes</span></button><button className="deleteChart" title="Delete chart" aria-label={`Delete ${ch.title}`} onClick={e=>deleteSavedChart(ch,e)}>DELETE</button></div>):<p className="authMessage">No saved charts yet.</p>}</div><div className="resultActions"><button className="secondary" onClick={()=>setMyChartsOpen(false)}>CLOSE</button></div></div></div>}{authOpen&&<div className="resultBackdrop" role="dialog" aria-modal="true"><div className="resultCard authCard"><small>BEATFORGE ACCOUNT</small><h2>{authMode==='login'?'Welcome back':'Create account'}</h2><input className="authInput" type="email" placeholder="Email" value={authEmail} onChange={e=>setAuthEmail(e.target.value)}/><input className="authInput" type="password" placeholder="Password" value={authPassword} onChange={e=>setAuthPassword(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')submitAuth()}}/>{authMessage&&<p className="authMessage">{authMessage}</p>}<div className="resultActions"><button onClick={submitAuth}>{authMode==='login'?'LOGIN':'SIGN UP'}</button><button className="secondary" onClick={()=>{setAuthMode(m=>m==='login'?'signup':'login');setAuthMessage('')}}>{authMode==='login'?'CREATE ACCOUNT':'I HAVE AN ACCOUNT'}</button><button className="secondary" onClick={()=>setAuthOpen(false)}>CLOSE</button></div></div></div>}{resultsOpen&&<div className="resultBackdrop" role="dialog" aria-modal="true"><div className="resultCard"><small>SONG COMPLETE</small><h2>{songName}</h2><div className="finalScore">{score.toLocaleString()}</div><span className="scoreLabel">FINAL SCORE</span><div className="resultGrid"><div className="perfectStat"><b>{hitStats.perfect}</b><span>PERFECT</span></div><div className="goodStat"><b>{hitStats.good}</b><span>GOOD</span></div><div className="greatStat"><b>{hitStats.great}</b><span>GREAT</span></div><div className="missStat"><b>{hitStats.miss}</b><span>MISS</span></div></div><div className="resultMeta"><div><b>{accuracy.toFixed(1)}%</b><span>ACCURACY</span></div><div><b>{hitStats.maxCombo}×</b><span>MAX COMBO</span></div><div><b>{Math.abs(avgTimingMs).toFixed(0)} ms</b><span>{timingLabel}</span></div></div><div className="resultActions"><button onClick={()=>{setResultsOpen(false);play()}}>PLAY AGAIN</button><button className="secondary" onClick={()=>setResultsOpen(false)}>CLOSE</button></div></div></div>}<footer>BeatForge v0.20.1 · Delete Charts</footer></main>
}
