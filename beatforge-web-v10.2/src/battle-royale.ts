import { supabase } from './lib/supabase';

type BRPlayer={
  id:string;user_id:string|null;name:string;is_bot:boolean;difficulty:string|null;ready:boolean;
  score:number;combo:number;max_combo:number;finished:boolean;eliminated:boolean;placement:number|null;me:boolean;
};
type BRState={
  id:string;status:'lobby'|'loading'|'playing'|'round_result'|'finished'|'cancelled';round_no:number;
  start_at:string|null;server_now:string;lobby_deadline:string;
  chart:null|{id:string;title:string;artist:string|null;youtube_url:string|null};players:BRPlayer[];
};

if(typeof window!=='undefined'&&supabase&&window.location.pathname==='/'){
  const db:any=supabase;
  let matchId:string|null=null;
  let overlay:HTMLElement|null=null;
  let hud:HTMLElement|null=null;
  let pollTimer:number|null=null;
  let countdownTimer:number|null=null;
  let busy=false;
  let preparedRound=0;
  let startedRound=0;
  let localSubmittedRound=0;
  let soloResult:HTMLElement|null=null;
  let leavePrompt:HTMLElement|null=null;
  let liveActive=false;
  let lastState:BRState|null=null;

  const esc=(s:any)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]||c));
  const num=(v:string|null|undefined)=>Number(String(v||'0').replace(/[^0-9-]/g,''))||0;
  const portal=()=>document.fullscreenElement?.classList.contains('beatforgeFullscreenShell')?document.fullscreenElement:document.body;
  const streak=(combo:number)=>combo>=200?'brPink':combo>=100?'brBlue':combo>=50?'brGold':'brBase';
  const resultEl=()=>[...document.querySelectorAll('.resultBackdrop')].find(x=>/SONG COMPLETE/i.test(x.textContent||'')) as HTMLElement|undefined;
  const currentScore=()=>Math.max(num(resultEl()?.querySelector('.finalScore')?.textContent),num(document.querySelector('.hudScore b')?.textContent));
  const currentCombo=()=>num(document.querySelector('.hudCombo b')?.textContent);

  const stopCountdown=()=>{if(countdownTimer!==null){clearInterval(countdownTimer);countdownTimer=null}};
  const removeHud=()=>{hud?.remove();hud=null};
  const closeOverlay=()=>{overlay?.remove();overlay=null};
  const modal=(html:string)=>{
    closeOverlay();
    const o=document.createElement('div');o.className='brBackdrop';
    o.innerHTML=`<div class="brCard">${html}</div>`;
    portal().appendChild(o);overlay=o;return o.querySelector('.brCard') as HTMLElement;
  };
  const syncPortal=()=>{
    const host=portal();
    if(overlay&&overlay.parentElement!==host)host.appendChild(overlay);
    if(leavePrompt&&leavePrompt.parentElement!==host)host.appendChild(leavePrompt);
  };

  const dismissSoloResult=()=>{
    const r=soloResult||resultEl();if(!r)return;
    r.style.display='';
    const close=[...r.querySelectorAll('button')].find(x=>x.textContent?.trim()==='CLOSE') as HTMLButtonElement|undefined;
    close?.click();soloResult=null;
  };
  const hideSoloResult=()=>{const r=resultEl();if(r){r.style.display='none';soloResult=r}};

  const getState=async()=>{
    if(!matchId)return null;
    const {data,error}=await db.rpc('get_battle_royale_state',{p_match:matchId});
    if(error){console.error('battle royale state',error);return null}
    return data as BRState|null;
  };

  const renderLobby=(state:BRState)=>{
    const humans=state.players.filter(p=>!p.is_bot);
    const secs=Math.max(0,Math.ceil((new Date(state.lobby_deadline).getTime()-new Date(state.server_now).getTime())/1000));
    const card=modal(`<button class="brX">×</button><small>BATTLE ROYALE</small><h1>ASSEMBLING LOBBY</h1><div class="brLobbyCount">${humans.length}<span>/8 PLAYERS</span></div><p>Real players can join for ${secs}s. Empty slots are filled automatically.</p><div class="brLobbyPlayers">${humans.map(p=>`<span><b>${esc(p.name)}</b><em>PLAYER</em></span>`).join('')}</div><button class="brSecondary brLeaveLobby">CANCEL</button>`);
    (card.querySelector('.brX') as HTMLButtonElement).onclick=()=>void leaveMode();
    (card.querySelector('.brLeaveLobby') as HTMLButtonElement).onclick=()=>void leaveMode();
  };

  const clickChart=async(state:BRState)=>{
    const chart=state.chart;if(!chart)return false;
    const community=[...document.querySelectorAll('button')].find(b=>b.textContent?.trim()==='COMMUNITY') as HTMLButtonElement|undefined;
    community?.click();
    return await new Promise<boolean>(resolve=>{
      let tries=0;
      const timer=window.setInterval(()=>{
        tries++;
        const cards=[...document.querySelectorAll('.communityTile')] as HTMLElement[];
        const title=String(chart.title||'').trim().toLowerCase(),artist=String(chart.artist||'').trim().toLowerCase();
        const target=cards.find(c=>(c.querySelector('.tileInfo strong')?.textContent?.trim().toLowerCase()||'')===title&&(!artist||(c.querySelector('.tileInfo span')?.textContent?.trim().toLowerCase()||'')===artist));
        if(target){clearInterval(timer);target.click();resolve(true)}
        else if(tries>45){clearInterval(timer);resolve(false)}
      },150);
    });
  };

  const showDifficulty=async(state:BRState)=>{
    const chart=state.chart;if(!chart)return;
    const card=modal(`<small>BATTLE ROYALE · ROUND ${state.round_no}</small><h2>CHOOSE YOUR DIFFICULTY</h2><p>Everyone plays the same song. Difficulty is individual.</p><div class="brSong"><b>${esc(chart.title)}</b><span>${esc(chart.artist||'')}</span></div><div class="brDifficultyGrid">${['Easy','Medium','Hard','Expert'].map(d=>`<button data-d="${d}"><b>${d}</b><span>${d==='Easy'?'Safer combos':d==='Medium'?'Balanced':d==='Hard'?'More scoring potential':'Maximum scoring potential'}</span></button>`).join('')}</div>`);
    card.querySelectorAll<HTMLButtonElement>('[data-d]').forEach(button=>button.onclick=async()=>{
      const d=button.dataset.d||'Medium';
      card.querySelectorAll('button').forEach((b:any)=>b.disabled=true);
      const pageButton=[...document.querySelectorAll('.chartOptions .seg button')].find(b=>b.textContent?.trim()===d) as HTMLButtonElement|undefined;
      pageButton?.click();
      const {error}=await db.rpc('battle_royale_choose_difficulty',{p_match:matchId,p_difficulty:d});
      if(error){console.error('battle royale difficulty',error);preparedRound=0;return}
      showReady(state,d);
    });
  };

  const showReady=(state:BRState,diff:string)=>{
    const card=modal(`<small>BATTLE ROYALE · ROUND ${state.round_no}</small><h2>SONG LOADED</h2><div class="brReadyIcon">✓</div><div class="brChosen">YOUR DIFFICULTY <b>${esc(diff)}</b></div><p>Survive the round. The lowest scores are eliminated.</p><div class="brReadyStatus">PRESS READY WHEN YOU ARE SET</div><button class="brPrimary brReady">READY</button><button class="brSecondary brRoundLeave">LEAVE BATTLE ROYALE</button>`);
    (card.querySelector('.brReady') as HTMLButtonElement).onclick=async()=>{
      const b=card.querySelector('.brReady') as HTMLButtonElement;b.disabled=true;b.textContent='READY ✓';
      const {error}=await db.rpc('battle_royale_ready',{p_match:matchId});
      if(error){console.error('battle royale ready',error);b.disabled=false;b.textContent='READY';return}
      const status=card.querySelector('.brReadyStatus');if(status)status.textContent='WAITING FOR SURVIVORS…';
    };
    (card.querySelector('.brRoundLeave') as HTMLButtonElement).onclick=()=>openLeavePrompt();
  };

  const prepareRound=async(state:BRState)=>{
    if(preparedRound===state.round_no||!state.chart)return;
    const me=state.players.find(p=>p.me);if(me?.eliminated)return;
    preparedRound=state.round_no;startedRound=0;localSubmittedRound=0;liveActive=false;removeHud();stopCountdown();
    modal(`<small>BATTLE ROYALE · ROUND ${state.round_no}</small><div class="brSpinner"></div><h2>LOADING SONG</h2><p>${esc(state.chart.title)} · ${esc(state.chart.artist||'')}</p>`);
    const loaded=await clickChart(state);
    if(!loaded){
      preparedRound=0;
      const card=modal(`<small>BATTLE ROYALE ERROR</small><h2>COULD NOT LOAD SONG</h2><button class="brSecondary brErrorBack">LEAVE</button>`);
      (card.querySelector('.brErrorBack') as HTMLButtonElement).onclick=()=>void leaveMode();return;
    }
    window.setTimeout(()=>void showDifficulty(state),550);
  };

  const startCountdown=(state:BRState)=>{
    if(startedRound===state.round_no||!state.start_at)return;
    startedRound=state.round_no;
    const offset=new Date(state.server_now).getTime()-Date.now();
    const card=modal(`<small>BATTLE ROYALE · ROUND ${state.round_no}</small><h2>GET READY</h2><div class="brCountdown">5</div><p>All survivors start together.</p>`);
    const label=card.querySelector('.brCountdown') as HTMLElement;
    stopCountdown();
    countdownTimer=window.setInterval(()=>{
      const left=new Date(state.start_at!).getTime()-(Date.now()+offset);
      label.textContent=left>4000?'5':left>3000?'4':left>2000?'3':left>1000?'2':left>0?'1':'GO!';
      if(left<=0){
        stopCountdown();closeOverlay();
        const play=[...document.querySelectorAll('button')].find(b=>b.textContent?.trim()==='PLAY') as HTMLButtonElement|undefined;
        play?.click();liveActive=true;mountHud(state);
      }
    },50);
  };

  const mountHud=(state:BRState)=>{
    removeHud();const game=document.querySelector('.game') as HTMLElement|null;if(!game)return;
    const h=document.createElement('div');h.className='brLiveHud';h.innerHTML=`<small>BATTLE ROYALE · ROUND ${state.round_no}</small><div class="brLiveList"></div>`;
    game.appendChild(h);hud=h;renderHud(state);
  };

  const renderHud=(state:BRState)=>{
    if(!hud)return;
    const list=hud.querySelector('.brLiveList');if(!list)return;
    const alive=state.players.filter(p=>!p.eliminated).sort((a,b)=>Number(b.score)-Number(a.score));
    list.innerHTML=alive.map((p,i)=>`<div class="brLiveRow ${streak(Number(p.combo)||0)} ${p.me?'me':''}"><i>#${i+1}</i><b>${esc(p.name)}${p.is_bot?' <em>BOT</em>':''}</b><span><strong>${Number(p.score||0).toLocaleString('da-DK')}</strong><small>${Number(p.combo||0)}x</small></span></div>`).join('');
  };

  const showWaitingFinish=(state:BRState)=>{
    if(overlay?.querySelector('.brWaitingFinish'))return;
    const unfinished=state.players.filter(p=>!p.eliminated&&!p.is_bot&&!p.finished).length;
    modal(`<small>BATTLE ROYALE · ROUND ${state.round_no}</small><h2>RUN COMPLETE</h2><div class="brWaitingFinish">WAITING FOR ${unfinished} PLAYER${unfinished===1?'':'S'}…</div><p>Your score is locked. The round resolves when every real survivor finishes.</p>`);
  };

  const roundRows=(state:BRState)=>{
    const players=[...state.players].sort((a,b)=>{
      if(a.placement&&b.placement)return a.placement-b.placement;
      if(a.placement)return 1;if(b.placement)return -1;
      return Number(b.score)-Number(a.score);
    });
    return players.map((p,i)=>`<div class="brResultRow ${p.me?'me':''} ${p.eliminated?'out':''}"><i>${p.placement?`#${p.placement}`:`#${i+1}`}</i><b>${esc(p.name)}${p.is_bot?' <em>BOT</em>':''}</b><span>${Number(p.score||0).toLocaleString('da-DK')}</span><small>${p.eliminated?'ELIMINATED':'SURVIVED'}</small></div>`).join('');
  };

  const showRoundResult=(state:BRState)=>{
    if(overlay?.dataset.brResult===`${state.round_no}:${state.status}`)return;
    liveActive=false;removeHud();stopCountdown();
    const me=state.players.find(p=>p.me);if(!me)return;
    const isWinner=state.status==='finished'&&me.placement===1;
    const out=!!me.eliminated&&!isWinner;
    const headline=isWinner?'VICTORY ROYALE':out?'ELIMINATED':`ROUND ${state.round_no} COMPLETE`;
    const sub=isWinner?'YOU ARE THE LAST PLAYER STANDING':out?`YOU FINISHED #${me.placement||'?'}`:'YOU SURVIVED';
    const card=modal(`<small>BATTLE ROYALE</small><h1 class="brVerdict ${isWinner?'win':out?'loss':'survive'}">${headline}</h1><div class="brResultSub">${sub}</div><div class="brResultList">${roundRows(state)}</div>${state.status==='round_result'&&!out?'<button class="brPrimary brNext">NEXT ROUND</button>':'<button class="brPrimary brDone">DONE</button>'}`);
    if(overlay)overlay.dataset.brResult=`${state.round_no}:${state.status}`;
    const next=card.querySelector('.brNext') as HTMLButtonElement|null;
    if(next)next.onclick=async()=>{
      next.disabled=true;next.textContent='LOADING…';dismissSoloResult();
      const {error}=await db.rpc('battle_royale_next_round',{p_match:matchId});
      if(error){console.error('battle royale next',error);next.disabled=false;next.textContent='NEXT ROUND'}
      else{preparedRound=0;startedRound=0;localSubmittedRound=0;closeOverlay()}
    };
    const done=card.querySelector('.brDone') as HTMLButtonElement|null;
    if(done)done.onclick=()=>{dismissSoloResult();matchId=null;lastState=null;closeOverlay();removeHud()};
  };

  const updateLive=async(state:BRState)=>{
    if(!matchId||state.status!=='playing'||!liveActive)return;
    const r=resultEl();const finished=!!r;
    if(finished&&localSubmittedRound!==state.round_no){localSubmittedRound=state.round_no;hideSoloResult()}
    const {error}=await db.rpc('battle_royale_update',{p_match:matchId,p_score:currentScore(),p_combo:currentCombo(),p_finished:finished});
    if(error)console.error('battle royale score',error);
  };

  const updateReadyCount=(state:BRState)=>{
    const el=overlay?.querySelector('.brReadyStatus');if(!el)return;
    const aliveHumans=state.players.filter(p=>!p.eliminated&&!p.is_bot);
    const ready=aliveHumans.filter(p=>p.ready).length;
    if(ready)el.textContent=`${ready} / ${aliveHumans.length} READY`;
  };

  const handleState=async(state:BRState)=>{
    lastState=state;
    if(state.status==='cancelled'){matchId=null;liveActive=false;removeHud();modal('<small>BATTLE ROYALE</small><h2>MATCH CLOSED</h2><button class="brPrimary brClosed">DONE</button>').querySelector('.brClosed')?.addEventListener('click',closeOverlay);return}
    if(state.status==='lobby'){renderLobby(state);return}
    if(state.status==='loading'){updateReadyCount(state);await prepareRound(state);return}
    if(state.status==='playing'){
      updateReadyCount(state);
      if(startedRound!==state.round_no)startCountdown(state);
      if(liveActive){await updateLive(state);const fresh=await getState();if(fresh){lastState=fresh;renderHud(fresh);if(localSubmittedRound===state.round_no&&fresh.status==='playing')showWaitingFinish(fresh);if(fresh.status==='round_result'||fresh.status==='finished')showRoundResult(fresh)}}
      return;
    }
    if(state.status==='round_result'||state.status==='finished')showRoundResult(state);
  };

  const poll=async()=>{
    if(busy||!matchId)return;busy=true;
    try{
      if(lastState?.status==='lobby')await db.rpc('battle_royale_tick',{p_match:matchId});
      const state=await getState();if(state)await handleState(state);
    }finally{busy=false}
  };

  const startPolling=()=>{if(pollTimer===null)pollTimer=window.setInterval(()=>void poll(),250);void poll()};

  const join=async()=>{
    const card=modal('<small>BATTLE ROYALE</small><div class="brSpinner"></div><h2>JOINING LOBBY</h2>');
    const {data,error}=await db.rpc('join_battle_royale');
    if(error){card.innerHTML=`<small>BATTLE ROYALE ERROR</small><h2>${/does not exist|schema cache/i.test(error.message||'')?'RUN battle_royale.sql IN SUPABASE':'COULD NOT JOIN'}</h2><button class="brSecondary brJoinError">BACK</button>`;(card.querySelector('.brJoinError') as HTMLButtonElement).onclick=openHome;return}
    matchId=String(data);preparedRound=0;startedRound=0;localSubmittedRound=0;lastState=null;startPolling();
  };

  function openHome(){
    const card=modal(`<button class="brX">×</button><small>BEATFORGE</small><h1>BATTLE ROYALE</h1><div class="brModeBadge">8 PLAYERS · 4 ROUNDS</div><p>Same song. Same start. Choose your own difficulty. The lowest scores are eliminated after every round until one player remains.</p><div class="brFlow"><span>8</span> → <span>6</span> → <span>4</span> → <span>2</span> → <b>1</b></div><button class="brPrimary brFind">FIND BATTLE ROYALE</button>`);
    (card.querySelector('.brFind') as HTMLButtonElement).onclick=()=>void join();
    (card.querySelector('.brX') as HTMLButtonElement).onclick=closeOverlay;
  }

  const leaveMode=async()=>{
    if(matchId)await db.rpc('battle_royale_leave',{p_match:matchId});
    matchId=null;lastState=null;liveActive=false;preparedRound=0;startedRound=0;localSubmittedRound=0;stopCountdown();removeHud();closeOverlay();dismissSoloResult();
  };

  const closeLeavePrompt=()=>{leavePrompt?.remove();leavePrompt=null};
  const openLeavePrompt=()=>{
    if(leavePrompt||!matchId)return;
    const o=document.createElement('div');o.className='brLeaveBackdrop';
    o.innerHTML='<div class="brLeaveCard"><small>BATTLE ROYALE</small><h2>LEAVE MATCH?</h2><p>You will be eliminated from this Battle Royale.</p><div><button class="brLeaveConfirm">LEAVE</button><button class="brLeaveCancel">CONTINUE</button></div></div>';
    portal().appendChild(o);leavePrompt=o;
    (o.querySelector('.brLeaveCancel') as HTMLButtonElement).onclick=closeLeavePrompt;
    (o.querySelector('.brLeaveConfirm') as HTMLButtonElement).onclick=async()=>{const b=o.querySelector('.brLeaveConfirm') as HTMLButtonElement;b.disabled=true;await leaveMode();closeLeavePrompt()};
  };

  const blockControls=(e:Event)=>{
    if(!liveActive)return;const b=(e.target as HTMLElement|null)?.closest('.controls button') as HTMLButtonElement|null;if(!b)return;
    if(!['STOP','RESET','PAUSE','RESUME'].includes((b.textContent||'').trim().toUpperCase()))return;
    e.preventDefault();e.stopPropagation();(e as any).stopImmediatePropagation?.();
  };
  const blockKeys=(e:KeyboardEvent)=>{
    if(!liveActive)return;const target=e.target as HTMLElement|null;if(target?.matches('input,textarea,[contenteditable="true"]'))return;
    const key=e.key.toLowerCase();
    if(key==='escape'){e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();if(e.repeat)return;if(leavePrompt)closeLeavePrompt();else openLeavePrompt();return}
    let reset='r',pause='escape';try{const s=JSON.parse(localStorage.getItem('beatforge-settings')||'{}');reset=String(s.resetKey||reset).toLowerCase();pause=String(s.pauseKey||pause).toLowerCase()}catch{}
    if(key===reset||key===pause){e.preventDefault();e.stopPropagation();e.stopImmediatePropagation()}
  };

  const installNav=()=>{
    const area=document.querySelector('.accountArea');if(!area||area.querySelector('.brNavBtn'))return;
    const ranked=[...area.querySelectorAll('button')].find(b=>b.textContent?.trim()==='RANKED');
    if(!ranked)return;
    const b=document.createElement('button');b.className='accountBtn brNavBtn';b.textContent='BATTLE ROYALE';b.onclick=openHome;
    ranked.insertAdjacentElement('afterend',b);
  };

  const addStyles=()=>{
    if(document.getElementById('battle-royale-style'))return;
    const s=document.createElement('style');s.id='battle-royale-style';s.textContent=`
      .brBackdrop,.brLeaveBackdrop{position:fixed;inset:0;z-index:2147483646;background:#03050bec;backdrop-filter:blur(13px);display:grid;place-items:center;padding:18px}.brCard{position:relative;width:min(620px,94vw);max-height:90vh;overflow:auto;background:linear-gradient(150deg,#151a26,#0c1018);border:1px solid #3b4353;border-radius:20px;padding:28px;text-align:center;box-shadow:0 30px 100px #000b}.brCard>small,.brLeaveCard>small{font-size:8px;font-weight:1000;letter-spacing:2px;color:#ff7bce}.brCard h1{font-size:32px;margin:7px 0}.brCard h2{font-size:23px;margin:8px 0}.brCard>p{max-width:510px;margin:8px auto 17px;color:#a8b0c0;font-size:11px;line-height:1.5}.brX{position:absolute;right:15px;top:15px;width:34px;height:34px;padding:0!important;border:1px solid #343c4c!important;border-radius:9px!important;background:#151b27!important;color:#fff!important}.brPrimary,.brSecondary{padding:12px 18px!important;border-radius:11px!important;font-size:10px!important;font-weight:1000!important;letter-spacing:.05em}.brPrimary{background:#ed4eb9!important;border-color:#ff73cf!important;color:#fff!important}.brSecondary{background:#151b27!important;border-color:#343c4c!important;color:#c2c8d4!important;margin-left:8px}.brModeBadge{display:inline-block;margin:8px 0 4px;padding:8px 13px;border:1px solid #653a61;border-radius:999px;color:#ff83d2;font-size:9px;font-weight:1000}.brFlow{display:flex;justify-content:center;align-items:center;gap:10px;margin:18px 0;color:#8992a5;font-weight:1000}.brFlow span,.brFlow b{width:30px;height:30px;display:grid;place-items:center;border-radius:50%;background:#29172a;border:1px solid #7b3d73;color:#ff83d2}.brFlow b{background:#ed4eb9;color:#fff}.brSpinner{width:46px;height:46px;margin:14px auto;border:4px solid #303747;border-top-color:#ed4eb9;border-radius:50%;animation:brSpin .8s linear infinite}@keyframes brSpin{to{transform:rotate(360deg)}}
      .brLobbyCount{font-size:48px;font-weight:1000;color:#ff78cd;margin:10px 0}.brLobbyCount span{display:block;font-size:9px;color:#8993a6;letter-spacing:1.5px}.brLobbyPlayers{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin:14px 0}.brLobbyPlayers span{display:flex;justify-content:space-between;padding:10px 12px;border:1px solid #303747;border-radius:10px;background:#0c1119}.brLobbyPlayers b{font-size:10px}.brLobbyPlayers em{font-size:7px;color:#7f899a;font-style:normal;font-weight:900}
      .brSong{display:grid;text-align:left;margin:14px 0;padding:11px 13px;border:1px solid #303747;border-radius:11px;background:#0a0f17}.brSong b{font-size:12px}.brSong span{font-size:8px;color:#8993a7}.brDifficultyGrid{display:grid;grid-template-columns:1fr 1fr;gap:9px}.brDifficultyGrid button{min-height:62px;text-align:left;background:#121824!important;color:#fff!important;border:1px solid #343c4e!important}.brDifficultyGrid button:hover{border-color:#ff72ce!important}.brDifficultyGrid b{display:block;font-size:13px}.brDifficultyGrid span{font-size:8px;color:#8993a7}.brReadyIcon{margin:14px auto;width:48px;height:48px;border-radius:50%;display:grid;place-items:center;border:1px solid #ff72ce;background:#ff72ce18;color:#ff8bd5;font-size:23px}.brChosen{display:inline-flex;gap:7px;padding:8px 12px;border:1px solid #653a61;border-radius:999px;color:#aab1c1}.brChosen b{color:#fff}.brReadyStatus{margin:14px 0 10px;font-size:8px;color:#9099ab;font-weight:1000;letter-spacing:1.2px}.brCountdown{font-size:54px;font-weight:1000;color:#ff78cd;margin:20px 0}.brWaitingFinish{font-size:18px;font-weight:1000;color:#ff78cd;margin:22px 0}
      .game>.brLiveHud{position:absolute!important;left:16px!important;top:16px!important;width:190px!important;z-index:13!important;background:#080c13eF;border:1px solid #3b4353;border-radius:12px;padding:8px;pointer-events:none;backdrop-filter:blur(8px)}.brLiveHud>small{display:block;text-align:center;font-size:7px;color:#ff7bce;font-weight:1000;letter-spacing:1px;margin-bottom:5px}.brLiveList{display:flex;flex-direction:column;gap:3px}.brLiveRow{display:grid;grid-template-columns:22px minmax(0,1fr) auto;align-items:center;height:28px;padding:0 6px;border:1px solid #303747;border-radius:7px;background:#10151e}.brLiveRow>i{font-style:normal;font-size:8px;color:#818b9c}.brLiveRow>b{font-size:8px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;text-align:left}.brLiveRow>b em{font-size:6px;font-style:normal;color:#ff84d3}.brLiveRow>span{display:grid;text-align:right}.brLiveRow strong{font-size:8px}.brLiveRow small{font-size:6px;font-weight:1000}.brLiveRow.me{box-shadow:inset 2px 0 #fff}.brLiveRow.brBase small{color:#8e95a5}.brLiveRow.brGold{border-color:#ffd43b}.brLiveRow.brGold small{color:#ffd43b}.brLiveRow.brBlue{border-color:#58a6ff}.brLiveRow.brBlue small{color:#58a6ff}.brLiveRow.brPink{border-color:#ff72d2}.brLiveRow.brPink small{color:#ff72d2}
      .brVerdict{font-size:34px!important}.brVerdict.win{color:#ffd43b}.brVerdict.loss{color:#ff5a6e}.brVerdict.survive{color:#58e6a7}.brResultSub{margin:-2px 0 13px;font-size:9px;color:#949daf;font-weight:1000;letter-spacing:1px}.brResultList{display:flex;flex-direction:column;gap:4px;margin:12px 0 16px}.brResultRow{display:grid;grid-template-columns:35px minmax(0,1fr) 95px 75px;align-items:center;min-height:34px;padding:0 9px;border:1px solid #303747;border-radius:8px;background:#0d121a;text-align:left}.brResultRow>i{font-style:normal;font-size:9px;color:#8a94a5}.brResultRow>b{font-size:9px}.brResultRow>b em{font-size:6px;color:#ff83d2;font-style:normal}.brResultRow>span{text-align:right;font-size:10px;font-weight:1000}.brResultRow>small{text-align:right;font-size:6px;font-weight:1000;color:#52df9b}.brResultRow.out{opacity:.58}.brResultRow.out>small{color:#ff6173}.brResultRow.me{border-color:#ff71cc;box-shadow:0 0 10px #ff71cc18}
      .brLeaveCard{width:min(420px,94vw);background:#111722;border:1px solid #3a4353;border-radius:18px;padding:24px;text-align:center}.brLeaveCard h2{margin:8px 0}.brLeaveCard p{color:#9ba5b7;font-size:11px}.brLeaveCard>div{display:flex;justify-content:center;gap:8px}.brLeaveCard button{padding:11px 16px;border-radius:10px;font-size:9px;font-weight:1000}.brLeaveConfirm{background:#38131b;border:1px solid #8b3448;color:#ff7888}.brLeaveCancel{background:#ed4eb9;border:1px solid #ff73cf;color:#fff}
      @media(max-width:760px){.brDifficultyGrid,.brLobbyPlayers{grid-template-columns:1fr}.game>.brLiveHud{width:160px!important}.brResultRow{grid-template-columns:30px minmax(0,1fr) 76px 62px}}
    `;document.head.appendChild(s);
  };

  const start=()=>{
    addStyles();installNav();
    new MutationObserver(()=>installNav()).observe(document.body,{childList:true,subtree:true});
    document.addEventListener('click',blockControls,true);document.addEventListener('keydown',blockKeys,true);document.addEventListener('fullscreenchange',syncPortal);
    if(pollTimer===null)pollTimer=window.setInterval(()=>void poll(),250);
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
}
