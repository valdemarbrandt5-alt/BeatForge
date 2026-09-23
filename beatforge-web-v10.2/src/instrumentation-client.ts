import { supabase } from './lib/supabase';

// Runs before React hydration. Keep BeatForge's fullscreen helper from physically
// re-parenting React-owned result modals; doing that breaks React reconciliation.
if (typeof window !== 'undefined') {
  const nativeAppendChild = Node.prototype.appendChild;
  Node.prototype.appendChild = function<T extends Node>(child: T): T {
    const target = this as Node & { classList?: DOMTokenList };
    const el = child as Node & { classList?: DOMTokenList };
    if (target.classList?.contains('beatforgeFullscreenShell') && el.classList?.contains('resultBackdrop') && !el.classList?.contains('rankedBackdrop')) {
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
      return child;
    }
    return nativeAppendChild.call(this, child) as T;
  };

  const handled = new WeakSet<Element>();
  const autoLoaded = new WeakSet<Element>();
  let reporting = false, activeMatchId: string | null = null, activeUid: string | null = null;
  let localMisses = 0, previousCombo = 0, previousJudge = 'READY', opponentMisses = 0, telemetryBusy = false, waitingBusy = false;
  let cachedResult: null | {perfect:string;great:string;good:string;miss:string;accuracy:string;maxCombo:string;timing:string;timingLabel:string} = null;

  const numberFrom = (value: string | null | undefined) => { const n=Number(String(value||'0').replace(/[^0-9-]/g,'')); return Number.isFinite(n)?n:0; };
  const visibleSongResult = () => [...document.querySelectorAll('.resultBackdrop')].find(x=>/SONG COMPLETE/i.test(x.textContent||'')) as HTMLElement|undefined;

  const captureResult = (result: Element) => {
    const text=(sel:string)=>result.querySelector(sel)?.textContent?.trim()||'0';
    const perfect=numberFrom(text('.perfectStat b')),great=numberFrom(text('.greatStat b')),good=numberFrom(text('.goodStat b')),miss=numberFrom(text('.missStat b'));
    const hits=perfect+great+good,total=hits+miss,accuracy=total?hits/total*100:0;
    const meta=result.querySelectorAll('.resultMeta > div');
    const accuracyEl=meta[0]?.querySelector('b'); if(accuracyEl)accuracyEl.textContent=`${accuracy.toFixed(1)}%`;
    cachedResult={perfect:String(perfect),great:String(great),good:String(good),miss:String(miss),accuracy:`${accuracy.toFixed(1)}%`,maxCombo:meta[1]?.querySelector('b')?.textContent?.trim()||'0×',timing:meta[2]?.querySelector('b')?.textContent?.trim()||'0 ms',timingLabel:meta[2]?.querySelector('span')?.textContent?.trim()||'ON TIME'};
    localMisses=miss;
  };

  const reportRankedFinish = async (result: Element) => {
    captureResult(result);
    if (!supabase || reporting || handled.has(result)) return;
    handled.add(result); reporting=true;
    try {
      const {data:auth}=await supabase.auth.getUser(); const uid=auth.user?.id; if(!uid)return;
      const {data:match}=await supabase.from('ranked_matches').select('id,status,player_1,player_2').or(`player_1.eq.${uid},player_2.eq.${uid}`).eq('status','playing').order('created_at',{ascending:false}).limit(1).maybeSingle();
      if(!match)return; activeMatchId=match.id;activeUid=uid;
      const score=Math.max(numberFrom(result.querySelector('.finalScore')?.textContent),numberFrom(document.querySelector('.hudScore b')?.textContent));
      await supabase.rpc('update_ranked_live_details',{p_match:match.id,p_score:score,p_combo:0,p_judge:'FINISHED',p_misses:localMisses});
      const {error}=await supabase.rpc('update_ranked_score',{p_match:match.id,p_score:score,p_finished:true}); if(error)console.error('ranked finish bridge',error);
    } finally { reporting=false; }
  };

  const ensureHudExtras=(hud:HTMLElement)=>{const players=hud.querySelectorAll(':scope > div > span');if(players.length<2)return;if(!players[0].querySelector('.rrLiveExtra'))players[0].insertAdjacentHTML('beforeend','<small class="rrLiveExtra rrMyExtra"><b>0×</b><em>READY</em></small>');if(!players[1].querySelector('.rrLiveExtra'))players[1].insertAdjacentHTML('beforeend','<small class="rrLiveExtra rrOppExtra"><b>0×</b><em>READY</em></small>')};

  const decorateRankedResult=()=>{if(!cachedResult)return;const card=[...document.querySelectorAll('.realRanked .rankedCard')].find(x=>/RANKED DUEL COMPLETE/i.test(x.textContent||'')) as HTMLElement|undefined;if(!card||card.querySelector('.rankedPerformance'))return;const r=cachedResult;const html=`<div class="rankedPerformance"><div><b>${r.perfect}</b><span>PERFECT</span></div><div><b>${r.great}</b><span>GREAT</span></div><div><b>${r.good}</b><span>GOOD</span></div><div><b>${r.miss}</b><span>MISS</span></div><div><b>${r.accuracy}</b><span>ACCURACY</span></div><div><b>${r.maxCombo}</b><span>MAX COMBO</span></div><div><b>${r.timing}</b><span>${r.timingLabel}</span></div></div>`;card.querySelector('.rankedFinalScores')?.insertAdjacentHTML('afterend',html)};

  const telemetryTick=async()=>{if(!supabase||telemetryBusy)return;const hud=document.querySelector('.realRankedLiveHud') as HTMLElement|null;if(!hud){activeMatchId=null;activeUid=null;previousCombo=0;previousJudge='READY';localMisses=0;opponentMisses=0;return}telemetryBusy=true;try{ensureHudExtras(hud);if(!activeUid)activeUid=(await supabase.auth.getUser()).data.user?.id||null;if(!activeUid)return;if(!activeMatchId){const {data:match}=await supabase.from('ranked_matches').select('id').or(`player_1.eq.${activeUid},player_2.eq.${activeUid}`).eq('status','playing').order('created_at',{ascending:false}).limit(1).maybeSingle();activeMatchId=match?.id||null}if(!activeMatchId)return;const score=numberFrom(document.querySelector('.hudScore b')?.textContent),combo=numberFrom(document.querySelector('.hudCombo b')?.textContent),judge=(document.querySelector('.judge')?.textContent||'READY').trim().toUpperCase();if(judge==='MISS'&&previousJudge!=='MISS')localMisses++;else if(judge==='MISS'&&previousCombo>0&&combo===0)localMisses++;previousCombo=combo;previousJudge=judge;await supabase.rpc('update_ranked_live_details',{p_match:activeMatchId,p_score:score,p_combo:combo,p_judge:judge,p_misses:localMisses});const {data,error}=await supabase.rpc('get_ranked_live_details',{p_match:activeMatchId});if(error)return;const row=Array.isArray(data)?data[0]:data;if(!row)return;const {data:match}=await supabase.from('ranked_matches').select('player_1,player_2').eq('id',activeMatchId).single();const mineIsOne=match?.player_1===activeUid,oppCombo=Number(mineIsOne?row.player_2_combo:row.player_1_combo)||0,oppJudge=String(mineIsOne?row.player_2_last_judge:row.player_1_last_judge||'READY').toUpperCase(),newOppMisses=Number(mineIsOne?row.player_2_misses:row.player_1_misses)||0;const myExtra=hud.querySelector('.rrMyExtra'),oppExtra=hud.querySelector('.rrOppExtra');if(myExtra)myExtra.innerHTML=`<b>${combo}×</b><em>${judge}</em>`;if(oppExtra)oppExtra.innerHTML=`<b>${oppCombo}×</b><em>${oppJudge}</em>`;if(newOppMisses>opponentMisses){hud.classList.remove('opponentMiss');void hud.offsetWidth;hud.classList.add('opponentMiss');setTimeout(()=>hud.classList.remove('opponentMiss'),450)}opponentMisses=newOppMisses}finally{telemetryBusy=false}};

  const cancelCurrentMatch=async()=>{if(!supabase)return;const uid=(await supabase.auth.getUser()).data.user?.id;if(!uid)return;const {data:m}=await supabase.from('ranked_matches').select('id').or(`player_1.eq.${uid},player_2.eq.${uid}`).in('status',['voting','ready']).order('created_at',{ascending:false}).limit(1).maybeSingle();if(m?.id)await supabase.from('ranked_matches').update({status:'cancelled',updated_at:new Date().toISOString()}).eq('id',m.id)};

  const checkWaiting=async()=>{if(!supabase||waitingBusy)return;const waiting=[...document.querySelectorAll('.rankedBackdrop.realRanked')].find(x=>/WAITING FOR OPPONENT|1 \/ 2 READY/i.test(x.textContent||''));if(!waiting)return;waitingBusy=true;try{const uid=(await supabase.auth.getUser()).data.user?.id;if(!uid)return;const {data:m}=await supabase.from('ranked_matches').select('id').or(`player_1.eq.${uid},player_2.eq.${uid}`).in('status',['voting','ready','playing']).order('created_at',{ascending:false}).limit(1).maybeSingle();if(!m){waiting.remove();(document.querySelector('.rankedNavBtn') as HTMLButtonElement|null)?.click()}}finally{waitingBusy=false}};

  document.addEventListener('click',e=>{const t=e.target as HTMLElement|null;if(t?.closest('.syncLeave,.rankedLeave,.cancelRealMatch'))void cancelCurrentMatch()},true);

  const scan=()=>{document.querySelectorAll('.resultBackdrop').forEach(result=>{if(/SONG COMPLETE/i.test(result.textContent||''))void reportRankedFinish(result)});document.querySelectorAll('.rankedLoad').forEach(button=>{if(autoLoaded.has(button))return;autoLoaded.add(button);setTimeout(()=>{if(button.isConnected)(button as HTMLButtonElement).click()},100)});decorateRankedResult()};

  const addStyles=()=>{if(document.getElementById('ranked-live-details-style'))return;const s=document.createElement('style');s.id='ranked-live-details-style';s.textContent=`
    .rrLiveExtra{display:flex!important;justify-content:center;gap:7px;align-items:center;margin-top:2px;font-size:9px!important;color:#9ca5b7!important}.rrLiveExtra b{font-size:10px!important;color:#fff}.rrLiveExtra em{font-size:9px!important;font-style:normal;font-weight:900}
    .realRankedLiveHud.opponentMiss{animation:rrOpponentMiss .45s ease}.realRankedLiveHud.opponentMiss>div>span:last-child{background:#ff40551c;border-radius:8px}@keyframes rrOpponentMiss{0%,100%{border-color:#493c78}35%{border-color:#ff5364;box-shadow:0 0 24px #ff405555}}
    .rankedPerformance{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin:10px 0 12px}.rankedPerformance>div{padding:9px 5px;border:1px solid #303646;border-radius:10px;background:#0d1119;display:grid}.rankedPerformance b{font-size:16px}.rankedPerformance span{font-size:7px;color:#8992a5;font-weight:900}.rankedPerformance>div:nth-child(5){grid-column:1/2}.rankedPerformance>div:nth-child(7){grid-column:3/5}
    .goldMode .note{box-shadow:0 0 12px #ffd54a88,0 0 22px #ffd54a33!important}.goldMode .holdNote{box-shadow:0 0 12px #ffd54a66!important}.goldMode .holdHead{box-shadow:0 0 12px #ffd54a88!important}.goldMode .receptor{box-shadow:0 0 10px #ffd54a55!important}.goldMode .hudCombo strong{text-shadow:0 0 7px #ffd54a77!important}.goldMode{box-shadow:inset 0 0 22px #ffd54a08!important}
  `;document.head.appendChild(s)};

  const start=()=>{const root=document.body;if(!root)return;addStyles();new MutationObserver(scan).observe(root,{childList:true,subtree:true,characterData:true});window.setInterval(()=>void telemetryTick(),350);window.setInterval(()=>void checkWaiting(),650);scan()};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
}
