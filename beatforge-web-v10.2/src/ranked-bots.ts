import { supabase } from './lib/supabase';
import {liveCompetitionPoints} from './competitive-score';
import {groupSongs, instrumentLabel, loadChartById, loadSongInstruments, type ChartInstrument} from './chart-instruments';

if (typeof window !== 'undefined' && supabase && window.location.pathname === '/') {
  const db:any=supabase;
  type BotMatch={
    id:string;user_id:string;status:string;bot_name:string;bot_mmr:number;user_mmr_before:number;
    candidate_chart_ids:string[];selected_chart_id:string|null;bot_difficulty:string;user_difficulty:string|null;
    start_at:string|null;bot_score:number;bot_target_score:number;mmr_delta:number|null;
  };
  type Chart={id:string;title:string;artist:string|null;youtube_url:string|null;instrument?:ChartInstrument;play_count:number|null};

  let queueButton:Element|null=null;
  let queueDeadline=0;
  let queueTimeout:number|null=null;
  let queueCountdown:number|null=null;
  let botOverlay:HTMLElement|null=null;
  let liveHud:HTMLElement|null=null;
  let liveTimer:number|null=null;
  let active:BotMatch|null=null;
  let live=false;
  let finishing=false;
  let lastScore=0;
  let soloResult:HTMLElement|null=null;
  let leavePrompt:HTMLElement|null=null;
  let accessToken='';
  let unloadSent=false;

  const rank=(mmr:number)=>mmr<800?'BRONZE':mmr<1000?'SILVER':mmr<1200?'GOLD':mmr<1400?'PLATINUM':mmr<1600?'DIAMOND':'MASTER';
  const rankClass=(mmr:number)=>'rank'+rank(mmr)[0]+rank(mmr).slice(1).toLowerCase();
  const esc=(s:any)=>String(s??'').replace(/[&<>"']/g,(c:string)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]||c));
  const ytId=(url:string|null)=>{if(!url)return'';const m=url.match(/[?&]v=([^&]+)/)||url.match(/youtu\.be\/([^?]+)/)||url.match(/\/shorts\/([^?]+)/);return m?.[1]||''};
  const numberFrom=(v:string|null|undefined)=>Number(String(v||'0').replace(/[^0-9-]/g,''))||0;
  const portal=()=>document.fullscreenElement?.classList?.contains('beatforgeFullscreenShell')?document.fullscreenElement:document.body;
  const resultEl=()=>[...document.querySelectorAll('.resultBackdrop')].find(x=>/SONG COMPLETE/i.test(x.textContent||'')) as HTMLElement|undefined;
  const finalScore=()=>Math.max(numberFrom(resultEl()?.querySelector('.finalScore')?.textContent),numberFrom(document.querySelector('.hudScore b')?.textContent),lastScore);

  const clearQueueTimer=()=>{
    if(queueTimeout!==null){window.clearTimeout(queueTimeout);queueTimeout=null}
    if(queueCountdown!==null){window.clearInterval(queueCountdown);queueCountdown=null}
    queueButton=null;queueDeadline=0;
  };
  const clearLive=()=>{
    if(liveTimer!==null){window.clearInterval(liveTimer);liveTimer=null}
    liveHud?.remove();liveHud=null;live=false;finishing=false;
  };
  const removeBotOverlay=()=>{botOverlay?.remove();botOverlay=null};
  const modal=(html:string)=>{
    removeBotOverlay();
    const o=document.createElement('div');
    o.className='rankedBackdrop rankedBotBackdrop';
    o.innerHTML='<div class="rankedCard rankedBotCard">'+html+'</div>';
    portal().appendChild(o);botOverlay=o;
    const card=o.querySelector('.rankedCard') as HTMLElement;if(card.querySelector('.botPreLeave,.botErrorClose')){const x=document.createElement('button');x.type='button';x.className='beatforgeModalX';x.textContent='×';x.setAttribute('aria-label','Close');x.onclick=()=>{(card.querySelector('.botPreLeave,.botErrorClose') as HTMLButtonElement|null)?.click()};card.prepend(x)}return card;
  };
  const syncPortal=()=>{if(botOverlay&&botOverlay.parentElement!==portal())portal().appendChild(botOverlay)};

  const getUser=async()=>{const {data}=await db.auth.getUser();return data?.user||null};
  const getSelf=async(uid:string)=>{
    const [{data:p},{data:r}]=await Promise.all([
      db.from('profiles').select('username').eq('id',uid).maybeSingle(),
      db.from('ranked_players').select('mmr,wins,losses').eq('user_id',uid).maybeSingle()
    ]);
    return{username:p?.username||'Player',mmr:Number(r?.mmr??1000),wins:Number(r?.wins??0),losses:Number(r?.losses??0)};
  };
  const getBotMatch=async(id:string)=>{
    const {data,error}=await db.from('ranked_bot_matches').select('*').eq('id',id).maybeSingle();
    if(error){console.error('ranked bot match',error);return null}
    return data as BotMatch|null;
  };

  const returnToRankedLobby=()=>{
    clearLive();removeBotOverlay();active=null;soloResult=null;unloadSent=false;
    const b=document.querySelector('.rankedNavBtn') as HTMLButtonElement|null;
    window.setTimeout(()=>b?.click(),80);
  };

  const cancelBot=async()=>{
    if(active?.id)await db.rpc('cancel_ranked_bot_match',{p_match:active.id});
    returnToRankedLobby();
  };

  const loadSelectedChart=async(chartId:string)=>{
    if(!active)return;
    const {data:selected}=await db.from('charts').select('id,title,artist,instrument').eq('id',chartId).single();
    if(!selected)return;
    modal('<small>RANKED DUEL · BOT</small><div class="queueSpinner"></div><h2>LOADING SONG</h2><p>'+esc(selected.title)+' · '+esc(selected.artist||'')+' · '+esc(instrumentLabel(selected.instrument))+'</p>');
    if(await loadChartById(chartId)){window.setTimeout(showDifficulty,550);return}
    const card=modal('<small>RANKED BOT ERROR</small><h2>COULD NOT LOAD SELECTED SONG</h2><button class="rankedSecondary botErrorClose">BACK</button>');
    (card.querySelector('.botErrorClose') as HTMLButtonElement).onclick=()=>void cancelBot();
  };

  const chooseInstrument=async(chartId:string)=>{
    const {data:chart}=await db.from('charts').select('id,title,artist,youtube_url,instrument').eq('id',chartId).single();
    if(!chart)return;
    const choices=await loadSongInstruments(db,chart);
    const card=modal('<small>RANKED DUEL · BOT</small><h2>CHOOSE YOUR INSTRUMENT</h2><p>'+esc(chart.title)+' · '+esc(chart.artist||'')+'</p><div class="rankInstrumentGrid">'+choices.map(c=>'<button data-chart="'+esc(c.id)+'">'+esc(instrumentLabel(c.instrument))+'</button>').join('')+'</div><button class="rankedSecondary botPreLeave">LEAVE</button>');
    card.querySelectorAll<HTMLButtonElement>('[data-chart]').forEach(button=>button.onclick=()=>void loadSelectedChart(button.dataset.chart||chartId));
    (card.querySelector('.botPreLeave') as HTMLButtonElement).onclick=()=>void cancelBot();
  };

  const showDifficulty=()=>{
    if(!active)return;
    const card=modal('<small>RANKED DUEL · BOT</small><h2>CHOOSE YOUR DIFFICULTY</h2><p>You and your opponent choose independently.</p><div class="rankDifficultyGrid">'+['Easy','Medium','Hard','Expert'].map(d=>'<button class="rankDifficulty" data-d="'+d+'"><b>'+d+'</b><span>'+(d==='Easy'?'Safer combos':d==='Medium'?'Balanced':d==='Hard'?'More scoring potential':'Maximum scoring potential')+'</span></button>').join('')+'</div><button class="rankedSecondary botPreLeave">LEAVE</button>');
    card.querySelectorAll('.rankDifficulty').forEach(x=>x.addEventListener('click',async()=>{
      if(!active)return;
      const d=(x as HTMLElement).dataset.d||'Medium';
      const pageButton=[...document.querySelectorAll('.chartOptions .seg button')].find(b=>b.textContent?.trim()===d) as HTMLButtonElement|undefined;
      pageButton?.click();
      const {error}=await db.rpc('set_ranked_bot_difficulty',{p_match:active.id,p_difficulty:d});
      if(error){console.error('ranked bot difficulty',error);return}
      active.user_difficulty=d;armReady(d);
    }));
    (card.querySelector('.botPreLeave') as HTMLButtonElement).onclick=()=>void cancelBot();
  };

  const startBotLive=async()=>{
    if(!active)return;
    const user=await getUser();if(!user)return;
    const self=await getSelf(user.id);
    removeBotOverlay();
    const game=document.querySelector('.game') as HTMLElement|null;if(!game)return;
    const hud=document.createElement('div');hud.className='botRankedLiveHud';
    hud.innerHTML='<div><span class="botLiveMe" data-place="1"><b>'+esc(self.username)+'</b><em>'+esc(active.user_difficulty||'Medium')+'</em><strong>0</strong></span><span class="botLiveOpp" data-place="2"><b>'+esc(active.bot_name)+' <i>BOT</i></b><em>'+esc(active.bot_difficulty)+'</em><strong>0</strong></span></div>';
    game.appendChild(hud);liveHud=hud;live=true;finishing=false;lastScore=0;unloadSent=false;
    const session=await db.auth.getSession();accessToken=session?.data?.session?.access_token||'';

    let busy=false;
    const tick=async()=>{
      if(!active||!live||busy)return;busy=true;
      try{
        const result=resultEl();
        const finished=!!result;
        lastScore=Math.max(lastScore,liveCompetitionPoints());
        const {data,error}=await db.rpc('update_ranked_bot_score',{p_match:active.id,p_score:lastScore,p_finished:finished});
        if(error){console.error('ranked bot score',error);return}
        const row=Array.isArray(data)?data[0]:data;
        const botScore=Number(row?.bot_score||0);
        const meRow=hud.querySelector('.botLiveMe') as HTMLElement|null,oppRow=hud.querySelector('.botLiveOpp') as HTMLElement|null;
        const meScore=meRow?.querySelector('strong'),oppScore=oppRow?.querySelector('strong');
        if(meScore)meScore.textContent=lastScore.toLocaleString();if(oppScore)oppScore.textContent=botScore.toLocaleString();
        const ordered=[{el:meRow,score:lastScore},{el:oppRow,score:botScore}].sort((a,b)=>b.score-a.score);
        ordered.forEach((p,i)=>{if(p.el){p.el.style.order=String(i);p.el.dataset.place=String(i+1)}});
        if(finished&&!finishing){
          finishing=true;
          const perf=capturePerformance(result!);hideSoloResult(result!);
          active.bot_score=botScore;active.status='finished';active.mmr_delta=Number(row?.mmr_delta||0);
          await showResult(row,perf);
        }
      }finally{busy=false}
    };
    await tick();liveTimer=window.setInterval(()=>void tick(),250);
  };

  const capturePerformance=(result:HTMLElement)=>{
    const meta=result.querySelectorAll('.resultMeta>div');
    return{
      perfect:result.querySelector('.perfectStat b')?.textContent?.trim()||'0',
      great:result.querySelector('.greatStat b')?.textContent?.trim()||'0',
      good:result.querySelector('.goodStat b')?.textContent?.trim()||'0',
      miss:result.querySelector('.missStat b')?.textContent?.trim()||'0',
      accuracy:meta[0]?.querySelector('b')?.textContent?.trim()||'0%',
      combo:meta[1]?.querySelector('b')?.textContent?.trim()||'0×',
      timing:meta[2]?.querySelector('b')?.textContent?.trim()||'0 ms',
      timingLabel:meta[2]?.querySelector('span')?.textContent?.trim()||'ON TIME'
    };
  };
  const hideSoloResult=(r:HTMLElement)=>{r.style.display='none';soloResult=r};
  const closeSoloResult=async()=>{
    const r=soloResult;if(!r)return;
    const finish=()=>{r.style.display='';const b=[...r.querySelectorAll('button')].find(x=>x.textContent?.trim()==='CLOSE') as HTMLButtonElement|undefined;b?.click();soloResult=null};
    if(document.fullscreenElement){try{await document.exitFullscreen();window.setTimeout(finish,80)}catch{finish()}}else finish();
  };

  const showResult=async(row:any,perf:any)=>{
    if(!active)return;
    clearLive();
    const playedChart=document.querySelector<HTMLElement>('main')?.dataset.activeChartId||active.selected_chart_id;
    if(playedChart){void db.rpc('record_competitive_result',{p_mode:'ranked_bot',p_match:active.id,p_round:1,p_chart:playedChart,p_difficulty:active.user_difficulty||'Medium',p_song_points:numberFrom(soloResult?.querySelector('.finalScore')?.textContent)}).then(({error}:{error:any})=>{if(error)console.error('ranked bot result save',error)})}
    const mine=lastScore,theirs=Number(row?.bot_score??active.bot_score??0),before=active.user_mmr_before,delta=Number(row?.mmr_delta??0),after=Number(row?.my_mmr??before+delta);
    const verdict=mine===theirs?'DRAW':mine>theirs?'VICTORY':'DEFEAT',cls=verdict==='VICTORY'?'win':verdict==='DEFEAT'?'loss':'draw';
    const card=modal('<small>RANKED DUEL COMPLETE · BOT</small><h1 class="rankedVerdict '+cls+'">'+verdict+'</h1><div class="rankedFinalScores"><span><small>YOU · '+esc(active.user_difficulty||'Medium')+'</small><b>'+mine.toLocaleString()+'</b></span><i>VS</i><span><small>'+esc(active.bot_name)+' · BOT · '+esc(active.bot_difficulty)+'</small><b>'+theirs.toLocaleString()+'</b></span></div><div class="rankedPerformance"><div data-stat="perfect"><b>'+esc(perf.perfect)+'</b><span>PERFECT</span></div><div data-stat="great"><b>'+esc(perf.great)+'</b><span>GREAT</span></div><div data-stat="good"><b>'+esc(perf.good)+'</b><span>GOOD</span></div><div data-stat="miss"><b>'+esc(perf.miss)+'</b><span>MISS</span></div><div data-stat="accuracy"><b>'+esc(perf.accuracy)+'</b><span>ACCURACY</span></div><div data-stat="combo"><b>'+esc(perf.combo)+'</b><span>MAX COMBO</span></div><div data-stat="timing"><b>'+esc(perf.timing)+'</b><span>'+esc(perf.timingLabel)+'</span></div></div><div class="rankedMmrResult"><b>'+rank(before)+' · '+before+'</b><span>→</span><b>'+rank(after)+' · '+after+'</b><strong class="'+(delta>=0?'positive':'negative')+'">'+(delta>0?'+':'')+delta+' MMR</strong></div><button class="rankedPrimary botAgain">PLAY ANOTHER RANKED</button><button class="rankedSecondary botDone">DONE</button>');
    (card.querySelector('.botAgain') as HTMLButtonElement).onclick=async()=>{await closeSoloResult();returnToRankedLobby()};
    (card.querySelector('.botDone') as HTMLButtonElement).onclick=async()=>{await closeSoloResult();clearLive();removeBotOverlay();active=null};
  };

  const waitForStart=(startAt:string,serverNow:string,t0:number,t1:number)=>{
    if(!active)return;
    const offset=new Date(serverNow).getTime()-((t0+t1)/2);
    const card=modal('<small>RANKED DUEL · BOT</small><h2>GET READY</h2><div class="syncCountdown">4</div><p class="syncHint">Your difficulty: <b>'+esc(active.user_difficulty||'Medium')+'</b>. The song starts automatically.</p>');
    const label=card.querySelector('.syncCountdown') as HTMLElement;let started=false;
    const timer=window.setInterval(()=>{
      const left=new Date(startAt).getTime()-(Date.now()+offset);
      label.textContent=left>3000?'4':left>2000?'3':left>1000?'2':left>0?'1':'GO!';
      if(left<=0&&!started){started=true;window.clearInterval(timer);removeBotOverlay();const play=[...document.querySelectorAll('button')].find(b=>b.textContent?.trim()==='PLAY') as HTMLButtonElement|undefined;play?.click();window.setTimeout(()=>void startBotLive(),250)}
    },80);
  };

  const armReady=(diff:string)=>{
    if(!active)return;
    const card=modal('<small>RANKED DUEL · BOT</small><h2>SONG LOADED</h2><div class="readyIcon">✓</div><div class="chosenDifficulty">YOUR DIFFICULTY <b>'+esc(diff)+'</b></div><p>Your opponent has chosen independently. Highest final score wins.</p><button class="rankedPrimary botReady">READY</button><button class="rankedSecondary botPreLeave">LEAVE</button>');
    (card.querySelector('.botReady') as HTMLButtonElement).onclick=async()=>{
      if(!active)return;const b=card.querySelector('.botReady') as HTMLButtonElement;b.disabled=true;b.textContent='READY ✓';
      const t0=Date.now(),{data,error}=await db.rpc('ready_ranked_bot_match',{p_match:active.id}),t1=Date.now();
      if(error){console.error('ranked bot ready',error);b.disabled=false;b.textContent='READY';return}
      const row=Array.isArray(data)?data[0]:data;if(row?.start_at)waitForStart(row.start_at,row.server_now,t0,t1);
    };
    (card.querySelector('.botPreLeave') as HTMLButtonElement).onclick=()=>void cancelBot();
  };

  const showVote=async(match:BotMatch)=>{
    active=match;clearQueueTimer();
    document.querySelector('.rankedBackdrop.realRanked')?.remove();
    const user=await getUser();if(!user)return;const self=await getSelf(user.id);
    const {data:charts}=await db.from('charts').select('id,title,artist,youtube_url,instrument,play_count').in('id',match.candidate_chart_ids);
    const list=groupSongs((charts||[]) as Chart[]).map(group=>group[0]);
    const card=modal('<small>MATCH FOUND · BOT</small><div class="matchPlayers"><span><small>YOU</small><b>'+esc(self.username)+'</b><em class="'+rankClass(self.mmr)+'">'+rank(self.mmr)+' · '+self.mmr+'</em></span><i>VS</i><span><small>OPPONENT · BOT</small><b>'+esc(match.bot_name)+'</b><em class="'+rankClass(match.bot_mmr)+'">'+rank(match.bot_mmr)+' · '+match.bot_mmr+'</em></span></div><h2>CHOOSE THE SONG</h2><p class="rankedVoteSub">'+list.length+' songs from Trending · bot vote already locked</p><div class="rankVoteGrid">'+list.map(ch=>{const y=ytId(ch.youtube_url);return '<button class="rankVote" data-id="'+ch.id+'">'+(y?'<img src="https://i.ytimg.com/vi/'+y+'/mqdefault.jpg" alt="">':'<div class="voteFallback">BF</div>')+'<div><strong>'+esc(ch.title)+'</strong><span>'+esc(ch.artist||'Unknown artist')+'</span><small>▶ '+Number(ch.play_count||0).toLocaleString()+'</small></div></button>'}).join('')+'</div><div class="rankedVoteStatus">1/2 VOTES LOCKED</div><button class="rankedSecondary botPreLeave">LEAVE</button>');
    card.querySelectorAll('.rankVote').forEach(b=>b.addEventListener('click',async()=>{
      if(!active)return;card.querySelectorAll('.rankVote').forEach(x=>x.classList.remove('selected'));b.classList.add('selected');
      const {data,error}=await db.rpc('vote_ranked_bot_chart',{p_match:active.id,p_chart:(b as HTMLElement).dataset.id});
      if(error){console.error('ranked bot vote',error);return}
      const selected=String(data||'');const refreshed=await getBotMatch(active.id);if(refreshed)active=refreshed;
      if(selected)void chooseInstrument(selected);
    }));
    (card.querySelector('.botPreLeave') as HTMLButtonElement).onclick=()=>void cancelBot();
  };

  const tryBotFallback=async()=>{
    const btn=document.querySelector('.rankedBackdrop.realRanked .cancelRealQueue');if(!btn)return;
    const user=await getUser();if(!user)return;
    const {data:human}=await db.from('ranked_matches').select('id').or(`player_1.eq.${user.id},player_2.eq.${user.id}`).in('status',['voting','ready','playing']).order('created_at',{ascending:false}).limit(1).maybeSingle();
    if(human?.id){clearQueueTimer();return}
    const note=document.querySelector('.rankedBackdrop.realRanked .realQueueNote') as HTMLElement|null;if(note)note.textContent='No player found · adding a ranked bot…';
    const {data,error}=await db.rpc('start_ranked_bot_match');
    if(error){
      console.error('ranked bot fallback',error);
      if(note&&/does not exist|schema cache/i.test(error.message||''))note.textContent='Bot fallback needs ranked_bots.sql in Supabase.';
      clearQueueTimer();return;
    }
    if(!data){clearQueueTimer();return}
    const match=await getBotMatch(String(data));if(match)await showVote(match);
  };

  const scheduleQueueFallback=()=>{
    const btn=document.querySelector('.rankedBackdrop.realRanked .cancelRealQueue');
    if(!btn){if(queueButton)clearQueueTimer();return}
    if(btn===queueButton||active)return;
    clearQueueTimer();queueButton=btn;
    const delay=20000+Math.floor(Math.random()*10001);queueDeadline=Date.now()+delay;
    const updateNote=()=>{
      if(!document.contains(btn)){clearQueueTimer();return}
      const note=document.querySelector('.rankedBackdrop.realRanked .realQueueNote') as HTMLElement|null;
      if(note){const seconds=Math.max(0,Math.ceil((queueDeadline-Date.now())/1000));note.textContent=`Real players get priority · bot fallback in ~${seconds}s`;}
    };
    updateNote();queueCountdown=window.setInterval(updateNote,1000);queueTimeout=window.setTimeout(()=>void tryBotFallback(),delay);
  };

  const closeLeavePrompt=()=>{leavePrompt?.remove();leavePrompt=null};
  const openLeavePrompt=()=>{
    if(!live||!active||leavePrompt)return;
    const o=document.createElement('div');o.className='rankedBackdrop rankedBotLeavePrompt';
    o.innerHTML='<div class="rankedCard"><small>RANKED DUEL · BOT</small><h2>LEAVE MATCH?</h2><p class="botForfeitWarning">Leaving counts as a loss and costs <b>20 MMR</b>. The match keeps running while this prompt is open.</p><button class="rankedPrimary botConfirmForfeit">LEAVE MATCH</button><button class="rankedSecondary botCancelForfeit">CANCEL</button></div>';
    portal().appendChild(o);leavePrompt=o;
    (o.querySelector('.botCancelForfeit') as HTMLButtonElement).onclick=closeLeavePrompt;
    (o.querySelector('.botConfirmForfeit') as HTMLButtonElement).onclick=async()=>{
      if(!active)return;const b=o.querySelector('.botConfirmForfeit') as HTMLButtonElement;b.disabled=true;b.textContent='LEAVING…';
      await db.rpc('forfeit_ranked_bot_match',{p_match:active.id});unloadSent=true;closeLeavePrompt();if(document.fullscreenElement){try{await document.exitFullscreen()}catch{}}window.setTimeout(()=>window.location.reload(),80);
    };
  };

  const blockControls=(event:Event)=>{
    if(!live)return;const b=(event.target as HTMLElement|null)?.closest('.controls button') as HTMLButtonElement|null;if(!b)return;
    const label=(b.textContent||'').trim().toUpperCase();if(!['STOP','RESET','PAUSE','RESUME'].includes(label))return;
    event.preventDefault();event.stopPropagation();(event as any).stopImmediatePropagation?.();
  };
  const blockKeys=(event:KeyboardEvent)=>{
    if(!live)return;const target=event.target as HTMLElement|null;if(target?.matches('input,textarea,[contenteditable="true"]'))return;
    let reset='r',pause='escape';try{const s=JSON.parse(localStorage.getItem('beatforge-settings')||'{}');reset=String(s.resetKey||reset).toLowerCase();pause=String(s.pauseKey||pause).toLowerCase()}catch{}
    const key=event.key.toLowerCase();
    if(key==='escape'){
      event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();if(event.repeat)return;if(leavePrompt)closeLeavePrompt();else openLeavePrompt();return;
    }
    if(key===reset||key===pause){event.preventDefault();event.stopPropagation();event.stopImmediatePropagation()}
  };

  const sendUnloadForfeit=()=>{
    if(unloadSent||!live||!active||!accessToken)return;const url=process.env.NEXT_PUBLIC_SUPABASE_URL||'',anon=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY||'';if(!url||!anon)return;
    unloadSent=true;void fetch(`${url}/rest/v1/rpc/forfeit_ranked_bot_match`,{method:'POST',keepalive:true,headers:{apikey:anon,Authorization:`Bearer ${accessToken}`,'Content-Type':'application/json',Prefer:'return=minimal'},body:JSON.stringify({p_match:active.id})}).catch(()=>{});
  };

  const addStyles=()=>{
    if(document.getElementById('ranked-bot-style'))return;
    const s=document.createElement('style');s.id='ranked-bot-style';s.textContent=`
      .rankedBotBackdrop,.rankedBotLeavePrompt{z-index:2147483646!important}.rankedBotCard .rankBronze{color:#cd7f32!important}.rankedBotCard .rankSilver{color:#c8ced8!important}.rankedBotCard .rankGold{color:#ffd43b!important}.rankedBotCard .rankPlatinum{color:#57e0d1!important}.rankedBotCard .rankDiamond{color:#6aa9ff!important}.rankedBotCard .rankMaster{color:#c084fc!important}
      .game>.botRankedLiveHud{position:absolute!important;left:18px!important;bottom:304px!important;top:auto!important;right:auto!important;width:145px!important;min-width:145px!important;max-width:145px!important;z-index:12!important;pointer-events:none!important}.botRankedLiveHud>div{display:flex;flex-direction:column;gap:4px;width:145px}.botRankedLiveHud span{position:relative;display:grid;grid-template-columns:minmax(0,1fr) auto;grid-template-rows:auto auto;align-items:center;box-sizing:border-box;width:145px;height:38px;padding:4px 6px 4px 22px;border-radius:9px;background:#0f131c;border:1px solid #303747;text-align:left}.botRankedLiveHud span:before{content:'#' attr(data-place);position:absolute;left:6px;top:50%;transform:translateY(-50%);font-size:9px;font-weight:1000;color:#7e8799}.botRankedLiveHud span[data-place='1']:before{color:#ffd43b}.botRankedLiveHud span>b{grid-column:1;grid-row:1;font-size:8px;line-height:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.botRankedLiveHud span>b i{font-style:normal;color:#a990ff;font-size:6px}.botRankedLiveHud span>em{grid-column:1;grid-row:2;font-size:6px;line-height:1;color:#788195;font-style:normal}.botRankedLiveHud span>strong{grid-column:2;grid-row:1 / span 2;font-size:11px;line-height:1;font-variant-numeric:tabular-nums;margin-left:4px;color:#fff}.botForfeitWarning{max-width:430px;margin:10px auto 16px;color:#aab2c2;line-height:1.5}.botForfeitWarning b{color:#ff6275}.rankedBotLeavePrompt .botConfirmForfeit{background:#ff4d61!important;border-color:#ff4d61!important}
      @media(max-width:760px){.game>.botRankedLiveHud,.botRankedLiveHud>div,.botRankedLiveHud span{width:132px!important;min-width:132px!important;max-width:132px!important}.botRankedLiveHud span{height:36px!important}}
    `;document.head.appendChild(s);
  };

  const start=()=>{
    addStyles();scheduleQueueFallback();
    new MutationObserver(()=>{scheduleQueueFallback();syncPortal()}).observe(document.body,{childList:true,subtree:true});
    document.addEventListener('click',blockControls,true);document.addEventListener('keydown',blockKeys,true);
    document.addEventListener('fullscreenchange',syncPortal);window.addEventListener('pagehide',sendUnloadForfeit);window.addEventListener('beforeunload',sendUnloadForfeit);
    window.setInterval(scheduleQueueFallback,500);
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
}
