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
  chart?:{title:string|null}|null;
  inviter?:{username:string|null}|null;
  invitee?:{username:string|null}|null;
};

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

  const numberFrom=(value:string|null|undefined)=>{
    const n=Number(String(value||'0').replace(/[^0-9-]/g,''));
    return Number.isFinite(n)?n:0;
  };

  const streakTone=(combo:number)=>combo>=200?'streakPink':combo>=100?'streakBlue':combo>=50?'streakGold':'streakBase';
  const resultOpen=()=>[...document.querySelectorAll('.resultBackdrop')].some(x=>/SONG COMPLETE/i.test(x.textContent||''));

  const loadUid=async()=>{
    if(uid)return uid;
    const {data}=await db.auth.getUser();
    uid=data?.user?.id||'';
    return uid;
  };

  const removeHud=()=>{hud?.remove();hud=null};
  const closeLeavePrompt=()=>{leavePrompt?.remove();leavePrompt=null};

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
    }finally{
      window.location.reload();
    }
  };

  const showLeavePrompt=()=>{
    if(leavePrompt||!active)return;
    const overlay=document.createElement('div');
    overlay.className='casualLeaveBackdrop';
    overlay.innerHTML=`<div class="casualLeaveCard"><small>CASUAL MATCH</small><h2>LEAVE MATCH?</h2><p>The match will end for your friend, but they can keep playing their current run. No MMR is gained or lost.</p><div><button class="casualLeaveConfirm">LEAVE MATCH</button><button class="casualLeaveContinue">CONTINUE</button></div></div>`;
    document.body.appendChild(overlay);
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
      .select('id,inviter_id,invitee_id,start_at,inviter_score,invitee_score,inviter_combo,invitee_combo,chart:charts!casual_invites_chart_id_fkey(title),inviter:profiles!casual_invites_inviter_id_fkey(username),invitee:profiles!casual_invites_invitee_id_fkey(username)')
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

  const finishLocalMatch=()=>{
    if(active)sessionStorage.setItem(`beatforge-casual-finished:${active.id}`,'1');
    closeLeavePrompt();
    removeHud();
    setControlLock(false);
    active=null;
  };

  const refreshLiveAndStatus=async()=>{
    if(!active)return null;
    const {data,error}=await db.from('casual_invites')
      .select('status,inviter_score,invitee_score,inviter_combo,invitee_combo')
      .eq('id',active.id).maybeSingle();
    if(error)return null;
    return data as {status:string;inviter_score:number|null;invitee_score:number|null;inviter_combo:number|null;invitee_combo:number|null}|null;
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
    document.body.appendChild(note);
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
    showFriendLeft(name);
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
        finishLocalMatch();
        return;
      }

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
