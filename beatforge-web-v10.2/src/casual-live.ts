import { supabase } from './lib/supabase';

type CasualLiveRow = {
  id:string;
  inviter_id:string;
  invitee_id:string;
  start_at:string|null;
  inviter_score:number|null;
  invitee_score:number|null;
  inviter_combo:number|null;
  invitee_combo:number|null;
  inviter_finished?:boolean|null;
  invitee_finished?:boolean|null;
  inviter_perfect?:number|null;
  invitee_perfect?:number|null;
  inviter_great?:number|null;
  invitee_great?:number|null;
  inviter_good?:number|null;
  invitee_good?:number|null;
  inviter_miss?:number|null;
  invitee_miss?:number|null;
  inviter_max_combo?:number|null;
  invitee_max_combo?:number|null;
  chart?:{title:string|null}|null;
  inviter?:{username:string|null}|null;
  invitee?:{username:string|null}|null;
};

type FinishStats={score:number;perfect:number;great:number;good:number;miss:number;maxCombo:number};

if (typeof window !== 'undefined' && supabase && window.location.pathname === '/') {
  const db:any=supabase;
  let uid='';
  let active:CasualLiveRow|null=null;
  let busy=false;
  let hud:HTMLElement|null=null;
  let schemaErrorShown=false;
  let casualLocked=false;
  let leavePrompt:HTMLElement|null=null;
  let leaving=false;
  let localFinished=false;
  let finishSubmitting=false;
  let comparisonRendered=false;

  const numberFrom=(value:string|null|undefined)=>{
    const n=Number(String(value||'0').replace(/[^0-9-]/g,''));
    return Number.isFinite(n)?n:0;
  };

  const streakTone=(combo:number)=>combo>=200?'streakPink':combo>=100?'streakBlue':combo>=50?'streakGold':'streakBase';
  const resultCard=()=>[...document.querySelectorAll('.resultBackdrop .resultCard')].find(x=>/SONG COMPLETE/i.test(x.textContent||'')) as HTMLElement|undefined;
  const resultOpen=()=>!!resultCard();

  const loadUid=async()=>{
    if(uid)return uid;
    const {data}=await db.auth.getUser();
    uid=data?.user?.id||'';
    return uid;
  };

  const removeHud=()=>{hud?.remove();hud=null};
  const closeLeavePrompt=()=>{leavePrompt?.remove();leavePrompt=null};
  const notifySocialFinished=()=>window.dispatchEvent(new CustomEvent('beatforge:casual-session-ended'));

  const playbackButtons=()=>Array.from(document.querySelectorAll('.controls button')) as HTMLButtonElement[];

  const setControlLock=(locked:boolean)=>{
    casualLocked=locked;
    playbackButtons().forEach(button=>{
      const label=(button.textContent||'').trim().toUpperCase();
      const shouldLock=['STOP','RESET','PAUSE','RESUME'].includes(label);
      button.classList.toggle('casualLockedControl',locked&&shouldLock);
      if(locked&&shouldLock){
        button.setAttribute('aria-disabled','true');
        button.title=label==='PAUSE'||label==='RESUME'?'Press ESC to leave the casual match':'Disabled during a synced casual match';
      }else if(!locked){
        button.removeAttribute('aria-disabled');
        if(button.title==='Disabled during a synced casual match'||button.title==='Press ESC to leave the casual match')button.removeAttribute('title');
      }
    });
    document.body.classList.toggle('casualMatchPlaying',locked);
  };

  const getResetAndPauseKeys=()=>{
    let reset='r',pause='escape';
    try{
      const raw=localStorage.getItem('beatforge-settings');
      if(raw){
        const settings=JSON.parse(raw);
        if(typeof settings?.resetKey==='string'&&settings.resetKey)reset=settings.resetKey.toLowerCase();
        if(typeof settings?.pauseKey==='string'&&settings.pauseKey)pause=settings.pauseKey.toLowerCase();
      }
    }catch{}
    return {reset,pause};
  };

  const blockSyncedControlClick=(event:MouseEvent)=>{
    if(!casualLocked)return;
    const button=(event.target as HTMLElement|null)?.closest('.controls button') as HTMLButtonElement|null;
    if(!button)return;
    const label=(button.textContent||'').trim().toUpperCase();
    if(!['STOP','RESET','PAUSE','RESUME'].includes(label))return;
    event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
  };

  const leaveMatch=async()=>{
    if(leaving||!active)return;
    leaving=true;
    const id=active.id;
    try{
      const {error}=await db.rpc('casual_leave_match',{p_invite:id});
      if(error){
        const iAmInviter=active.inviter_id===uid;
        let q=db.from('casual_invites').update({status:iAmInviter?'cancelled':'declined'}).eq('id',id);
        q=iAmInviter?q.eq('inviter_id',uid):q.eq('invitee_id',uid);
        await q;
      }
      sessionStorage.setItem(`beatforge-casual-finished:${id}`,'1');
      notifySocialFinished();
    }finally{
      window.location.reload();
    }
  };

  const showLeavePrompt=()=>{
    if(leavePrompt||!active)return;
    const overlay=document.createElement('div');
    overlay.className='casualLeaveBackdrop';
    overlay.innerHTML=`<div class="casualLeaveCard"><small>CASUAL MATCH</small><h2>LEAVE MATCH?</h2><p>The match will end for your friend, but they can keep playing their current run. No MMR is gained or lost.</p><div><button class="casualLeaveConfirm">LEAVE MATCH</button><button class="casualLeaveContinue">CONTINUE</button></div></div>`;
    const host=(document.fullscreenElement as HTMLElement|null)||document.body;
    host.appendChild(overlay);
    leavePrompt=overlay;
    (overlay.querySelector('.casualLeaveConfirm') as HTMLButtonElement).onclick=()=>void leaveMatch();
    (overlay.querySelector('.casualLeaveContinue') as HTMLButtonElement).onclick=closeLeavePrompt;
  };

  const blockSyncedHotkeys=(event:KeyboardEvent)=>{
    if(!casualLocked)return;
    const target=event.target as HTMLElement|null;
    if(target?.matches('input,textarea,[contenteditable="true"]'))return;
    const key=event.key.toLowerCase();
    const {reset,pause}=getResetAndPauseKeys();

    if(key==='escape'){
      event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
      if(event.repeat)return;
      if(leavePrompt)closeLeavePrompt();else showLeavePrompt();
      return;
    }

    if(key!==reset&&key!==pause)return;
    event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
  };

  const addStyles=()=>{
    if(document.getElementById('casual-live-score-style'))return;
    const style=document.createElement('style');
    style.id='casual-live-score-style';
    style.textContent=`
      .game>.casualLiveHud{position:absolute!important;left:18px!important;bottom:304px!important;top:auto!important;right:auto!important;width:145px!important;min-width:145px!important;max-width:145px!important;z-index:12!important;display:flex!important;flex-direction:column!important;gap:4px!important;pointer-events:none!important}
      .casualLiveHud .casualLiveRow{position:relative!important;display:grid!important;grid-template-columns:minmax(0,1fr) auto!important;align-items:center!important;width:145px!important;min-width:145px!important;max-width:145px!important;height:38px!important;padding:4px 6px 4px 22px!important;border-radius:9px!important;background:#0f131c!important;border:1px solid #303747!important;box-sizing:border-box!important}
      .casualLiveHud .casualLiveRow:before{content:'#' attr(data-place);position:absolute;left:6px;top:50%;transform:translateY(-50%);font-size:9px;font-weight:1000;color:#7e8799}
      .casualLiveHud .casualLiveRow[data-place='1']:before{color:#ffd43b}
      .casualLiveHud .casualLiveName{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:8px!important;font-weight:1000;color:#fff}
      .casualLiveHud .casualLiveNumbers{display:flex;align-items:center;gap:3px;white-space:nowrap;margin-left:5px}.casualLiveHud .casualLiveScore{font-size:11px!important;font-weight:1000;font-variant-numeric:tabular-nums;color:#fff}.casualLiveHud .casualLiveCombo{font-size:8px!important;font-weight:1000;font-style:normal}
      .casualLiveHud .casualLiveRow.streakBase{border-color:#303747!important}.casualLiveHud .casualLiveRow.streakBase .casualLiveCombo{color:#8e95a5!important}
      .casualLiveHud .casualLiveRow.streakGold{border-color:#ffd43b!important;box-shadow:0 0 8px #ffd43b22!important}.casualLiveHud .casualLiveRow.streakGold .casualLiveCombo{color:#ffd43b!important}
      .casualLiveHud .casualLiveRow.streakBlue{border-color:#58a6ff!important;box-shadow:0 0 8px #58a6ff22!important}.casualLiveHud .casualLiveRow.streakBlue .casualLiveCombo{color:#58a6ff!important}
      .casualLiveHud .casualLiveRow.streakPink{border-color:#ff72d2!important;box-shadow:0 0 8px #ff72d222!important}.casualLiveHud .casualLiveRow.streakPink .casualLiveCombo{color:#ff72d2!important}
      .controls button.casualLockedControl{opacity:.42!important;cursor:not-allowed!important;filter:saturate(.45)!important;pointer-events:none!important}
      .casualLeaveBackdrop{position:fixed;inset:0;z-index:16000;background:#03050be8;backdrop-filter:blur(12px);display:grid;place-items:center;padding:20px}
      .casualLeaveCard{width:min(430px,94vw);background:#111722;border:1px solid #353d4d;border-radius:18px;padding:24px;text-align:center;box-shadow:0 24px 80px #0009}
      .casualLeaveCard small{font-size:8px;font-weight:1000;letter-spacing:1.7px;color:#9c7cff}.casualLeaveCard h2{margin:8px 0 8px;font-size:24px}.casualLeaveCard p{margin:0 auto 18px;color:#99a3b5;font-size:11px;line-height:1.5}.casualLeaveCard>div{display:flex;justify-content:center;gap:9px}.casualLeaveCard button{min-width:120px;padding:11px 14px;border-radius:10px;font-size:9px;font-weight:1000}.casualLeaveConfirm{background:#2a1118;border:1px solid #7c3343;color:#ff8190}.casualLeaveContinue{background:#7658ff;border:1px solid #8b72ff;color:white}
      .casualFriendLeft{position:fixed;left:50%;top:24px;transform:translateX(-50%);z-index:15500;background:#151a25;border:1px solid #465064;border-radius:11px;padding:11px 16px;color:#fff;font-size:10px;font-weight:1000;box-shadow:0 14px 42px #0009;pointer-events:none}.casualFriendLeft b{color:#ff8190}
      .casualResultCompare{margin:18px 0 4px;padding:14px;border:1px solid #343c4c;border-radius:13px;background:#0b1018;text-align:left}.casualResultCompare>small{display:block;text-align:center;color:#9c83ff;font-size:8px;font-weight:1000;letter-spacing:1.4px}.casualResultCompare h3{text-align:center;margin:5px 0 12px;font-size:16px}.casualCompareNames{display:grid;grid-template-columns:1fr 64px 1fr;align-items:center;text-align:center;margin-bottom:8px}.casualCompareNames b{font-size:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.casualCompareNames span{font-size:7px;color:#687184;font-weight:1000}.casualCompareRow{display:grid;grid-template-columns:1fr 64px 1fr;align-items:center;text-align:center;min-height:28px;border-top:1px solid #202734}.casualCompareRow span{font-size:7px;color:#7f899b;font-weight:1000;letter-spacing:.6px}.casualCompareRow b{font-size:11px}.casualCompareRow.perfect b{color:#ffd43b}.casualCompareRow.great b{color:#4ee6a8}.casualCompareRow.good b{color:#ffad42}.casualCompareRow.miss b{color:#ff5d6c}.casualCompareWinner{text-align:center;margin:0 0 9px;font-size:11px;font-weight:1000;color:#fff}.casualCompareWaiting{text-align:center;color:#8993a6;font-size:9px;padding:8px 0 2px}
      @media(max-width:760px){.game>.casualLiveHud,.casualLiveHud .casualLiveRow{width:132px!important;min-width:132px!important;max-width:132px!important}.casualLiveHud .casualLiveRow{height:36px!important}}
    `;
    document.head.appendChild(style);
  };

  const ensureHud=()=>{
    if(document.querySelector('.realRankedLiveHud')){removeHud();return null}
    const game=document.querySelector('.game') as HTMLElement|null;
    if(!game)return null;
    if(!hud){
      const el=document.createElement('div');
      el.className='casualLiveHud';
      el.innerHTML='<div class="casualLiveRow casualLiveA streakBase"><b class="casualLiveName"></b><span class="casualLiveNumbers"><strong class="casualLiveScore">0</strong><em class="casualLiveCombo">0x</em></span></div><div class="casualLiveRow casualLiveB streakBase"><b class="casualLiveName"></b><span class="casualLiveNumbers"><strong class="casualLiveScore">0</strong><em class="casualLiveCombo">0x</em></span></div>';
      game.appendChild(el);hud=el;
    }else if(hud.parentElement!==game){game.appendChild(hud)}
    return hud;
  };

  const renderHud=(row:CasualLiveRow,inviterScore:number,inviteeScore:number,inviterCombo:number,inviteeCombo:number)=>{
    const root=ensureHud();if(!root)return;
    const players=[
      {name:String(row.inviter?.username||'Player 1'),score:inviterScore,combo:inviterCombo},
      {name:String(row.invitee?.username||'Player 2'),score:inviteeScore,combo:inviteeCombo},
    ].sort((a,b)=>b.score-a.score);
    const rows=[root.querySelector('.casualLiveA'),root.querySelector('.casualLiveB')] as HTMLElement[];
    rows.forEach((el,i)=>{
      const p=players[i];if(!el||!p)return;
      el.dataset.place=String(i+1);
      el.classList.remove('streakBase','streakGold','streakBlue','streakPink');
      el.classList.add(streakTone(p.combo));
      const name=el.querySelector('.casualLiveName');
      const score=el.querySelector('.casualLiveScore');
      const combo=el.querySelector('.casualLiveCombo');
      if(name)name.textContent=p.name;
      if(score)score.textContent=p.score.toLocaleString('da-DK');
      if(combo)combo.textContent=`${p.combo}x`;
    });
  };

  const findActive=async()=>{
    if(!uid)await loadUid();
    if(!uid)return null;
    const cutoff=new Date(Date.now()-20*60*1000).toISOString();
    const {data,error}=await db.from('casual_invites')
      .select('id,inviter_id,invitee_id,start_at,inviter_score,invitee_score,inviter_combo,invitee_combo,inviter_finished,invitee_finished,inviter_perfect,invitee_perfect,inviter_great,invitee_great,inviter_good,invitee_good,inviter_miss,invitee_miss,inviter_max_combo,invitee_max_combo,chart:charts!casual_invites_chart_id_fkey(title),inviter:profiles!casual_invites_inviter_id_fkey(username),invitee:profiles!casual_invites_invitee_id_fkey(username)')
      .eq('status','accepted').not('start_at','is',null)
      .or(`inviter_id.eq.${uid},invitee_id.eq.${uid}`)
      .gt('created_at',cutoff).order('created_at',{ascending:false}).limit(1).maybeSingle();
    if(error){
      if(!schemaErrorShown){schemaErrorShown=true;console.error('casual live score schema',error)}
      return null;
    }
    schemaErrorShown=false;
    if(!data)return null;
    if(sessionStorage.getItem(`beatforge-casual-finished:${data.id}`))return null;
    return data as CasualLiveRow;
  };

  const refreshLiveAndStatus=async()=>{
    if(!active)return null;
    const {data,error}=await db.from('casual_invites')
      .select('status,inviter_score,invitee_score,inviter_combo,invitee_combo,inviter_finished,invitee_finished,inviter_perfect,invitee_perfect,inviter_great,invitee_great,inviter_good,invitee_good,inviter_miss,invitee_miss,inviter_max_combo,invitee_max_combo')
      .eq('id',active.id).maybeSingle();
    if(error)return null;
    return data as CasualLiveRow|null;
  };

  const opponentName=()=>{
    if(!active)return 'Your friend';
    return active.inviter_id===uid?String(active.invitee?.username||'Your friend'):String(active.inviter?.username||'Your friend');
  };

  const showFriendLeft=(name:string)=>{
    document.querySelector('.casualFriendLeft')?.remove();
    const note=document.createElement('div');
    note.className='casualFriendLeft';
    note.innerHTML=`<b>${name}</b> left the match · your run continues`;
    const host=(document.fullscreenElement as HTMLElement|null)||document.body;
    host.appendChild(note);
    window.setTimeout(()=>note.remove(),6500);
  };

  const opponentLeft=()=>{
    if(!active)return;
    const id=active.id;
    const name=opponentName();
    sessionStorage.setItem(`beatforge-casual-finished:${id}`,'1');
    closeLeavePrompt();
    removeHud();
    setControlLock(false);
    active=null;
    localFinished=false;
    finishSubmitting=false;
    comparisonRendered=false;
    notifySocialFinished();
    showFriendLeft(name);
  };

  const captureFinishStats=():FinishStats|null=>{
    const card=resultCard();
    if(!card)return null;
    return{
      score:numberFrom(card.querySelector('.finalScore')?.textContent),
      perfect:numberFrom(card.querySelector('.perfectStat b')?.textContent),
      great:numberFrom(card.querySelector('.greatStat b')?.textContent),
      good:numberFrom(card.querySelector('.goodStat b')?.textContent),
      miss:numberFrom(card.querySelector('.missStat b')?.textContent),
      maxCombo:numberFrom(card.querySelector('.resultMeta>div:nth-child(2) b')?.textContent),
    };
  };

  const accuracy=(perfect:number,great:number,good:number,miss:number)=>{
    const total=perfect+great+good+miss;
    return total?((perfect+great+good)/total*100):0;
  };

  const resultPlayer=(row:CasualLiveRow,inviter:boolean)=>({
    name:String((inviter?row.inviter?.username:row.invitee?.username)||'Player'),
    score:Number(inviter?row.inviter_score:row.invitee_score)||0,
    perfect:Number(inviter?row.inviter_perfect:row.invitee_perfect)||0,
    great:Number(inviter?row.inviter_great:row.invitee_great)||0,
    good:Number(inviter?row.inviter_good:row.invitee_good)||0,
    miss:Number(inviter?row.inviter_miss:row.invitee_miss)||0,
    maxCombo:Number(inviter?row.inviter_max_combo:row.invitee_max_combo)||0,
  });

  const ensureComparePanel=()=>{
    const card=resultCard();if(!card)return null;
    let panel=card.querySelector('.casualResultCompare') as HTMLElement|null;
    if(!panel){
      panel=document.createElement('div');panel.className='casualResultCompare';
      const actions=card.querySelector('.resultActions');
      if(actions)card.insertBefore(panel,actions);else card.appendChild(panel);
    }
    return panel;
  };

  const showWaitingComparison=()=>{
    const panel=ensureComparePanel();if(!panel)return;
    if(panel.dataset.ready==='1')return;
    panel.innerHTML='<small>CASUAL HEAD TO HEAD</small><h3>RESULT COMPARISON</h3><div class="casualCompareWaiting">Waiting for your friend to finish…</div>';
  };

  const renderComparison=(row:CasualLiveRow)=>{
    const panel=ensureComparePanel();if(!panel)return;
    const mineIsInviter=row.inviter_id===uid;
    const me=resultPlayer(row,mineIsInviter);
    const friend=resultPlayer(row,!mineIsInviter);
    const meAcc=accuracy(me.perfect,me.great,me.good,me.miss);
    const friendAcc=accuracy(friend.perfect,friend.great,friend.good,friend.miss);
    const verdict=me.score===friend.score?'TIE':me.score>friend.score?'YOU WIN':`${friend.name.toUpperCase()} WINS`;
    const rowHtml=(label:string,a:string,b:string,cls='')=>`<div class="casualCompareRow ${cls}"><b>${a}</b><span>${label}</span><b>${b}</b></div>`;
    panel.dataset.ready='1';
    panel.innerHTML=`<small>CASUAL HEAD TO HEAD</small><h3>RESULT COMPARISON</h3><div class="casualCompareWinner">${verdict}</div><div class="casualCompareNames"><b>YOU</b><span>VS</span><b>${friend.name}</b></div>${rowHtml('SCORE',me.score.toLocaleString('da-DK'),friend.score.toLocaleString('da-DK'))}${rowHtml('ACCURACY',`${meAcc.toFixed(1)}%`,`${friendAcc.toFixed(1)}%`)}${rowHtml('PERFECT',String(me.perfect),String(friend.perfect),'perfect')}${rowHtml('GREAT',String(me.great),String(friend.great),'great')}${rowHtml('GOOD',String(me.good),String(friend.good),'good')}${rowHtml('MISS',String(me.miss),String(friend.miss),'miss')}${rowHtml('MAX COMBO',`${me.maxCombo}x`,`${friend.maxCombo}x`)}`;
    comparisonRendered=true;
  };

  const submitLocalResult=async()=>{
    if(localFinished||finishSubmitting||!active)return;
    const stats=captureFinishStats();if(!stats)return;
    finishSubmitting=true;
    try{
      const {error}=await db.rpc('casual_finish_match',{
        p_invite:active.id,
        p_score:stats.score,
        p_perfect:stats.perfect,
        p_great:stats.great,
        p_good:stats.good,
        p_miss:stats.miss,
        p_max_combo:stats.maxCombo,
      });
      if(error){console.error('casual_finish_match',error);return}
      localFinished=true;
      removeHud();
      setControlLock(false);
      showWaitingComparison();
      notifySocialFinished();
    }finally{finishSubmitting=false}
  };

  const finalizeComparisonIfReady=async()=>{
    if(!active||!localFinished||comparisonRendered)return;
    const fresh=await refreshLiveAndStatus();
    if(!fresh)return;
    if(fresh.status!=='accepted'){opponentLeft();return}
    Object.assign(active,fresh);
    if(active.inviter_finished&&active.invitee_finished){
      renderComparison(active);
      sessionStorage.setItem(`beatforge-casual-finished:${active.id}`,'1');
      setControlLock(false);
      removeHud();
      active=null;
    }else showWaitingComparison();
  };

  const tick=async()=>{
    if(busy||leaving)return;
    busy=true;
    try{
      if(!active)active=await findActive();
      if(!active){removeHud();setControlLock(false);return}

      const starts=active.start_at?new Date(active.start_at).getTime():0;
      if(!starts||Date.now()<starts-800){removeHud();setControlLock(false);return}

      if(resultOpen()){
        await submitLocalResult();
        await finalizeComparisonIfReady();
        return;
      }

      if(localFinished){await finalizeComparisonIfReady();return}

      setControlLock(true);

      const score=numberFrom(document.querySelector('.hudScore b')?.textContent);
      const combo=numberFrom(document.querySelector('.hudCombo b')?.textContent);
      const {data,error}=await db.rpc('casual_update_live',{p_invite:active.id,p_score:score,p_combo:combo});
      if(error){
        const fresh=await refreshLiveAndStatus();
        if(fresh&&fresh.status!=='accepted'){opponentLeft();return}
        if(!schemaErrorShown){schemaErrorShown=true;console.error('casual_update_live',error)}
        removeHud();return;
      }
      schemaErrorShown=false;

      const rpcRow=Array.isArray(data)?data[0]:data;
      const fresh=await refreshLiveAndStatus();
      if(fresh&&fresh.status!=='accepted'){opponentLeft();return}

      const inviterScore=Number(fresh?.inviter_score??rpcRow?.inviter_score??active.inviter_score??0)||0;
      const inviteeScore=Number(fresh?.invitee_score??rpcRow?.invitee_score??active.invitee_score??0)||0;
      const inviterCombo=Number(fresh?.inviter_combo??rpcRow?.inviter_combo??active.inviter_combo??0)||0;
      const inviteeCombo=Number(fresh?.invitee_combo??rpcRow?.invitee_combo??active.invitee_combo??0)||0;
      active.inviter_score=inviterScore;
      active.invitee_score=inviteeScore;
      active.inviter_combo=inviterCombo;
      active.invitee_combo=inviteeCombo;
      renderHud(active,inviterScore,inviteeScore,inviterCombo,inviteeCombo);
    }finally{busy=false}
  };

  const start=()=>{
    addStyles();void loadUid();
    document.addEventListener('click',blockSyncedControlClick,true);
    window.addEventListener('keydown',blockSyncedHotkeys,true);
    window.setInterval(()=>void tick(),250);
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
}
