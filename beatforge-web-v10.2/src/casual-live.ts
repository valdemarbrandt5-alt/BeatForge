import { supabase } from './lib/supabase';

type CasualLiveRow = {
  id:string;
  inviter_id:string;
  invitee_id:string;
  start_at:string|null;
  inviter_score:number|null;
  invitee_score:number|null;
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

  const numberFrom=(value:string|null|undefined)=>{
    const n=Number(String(value||'0').replace(/[^0-9-]/g,''));
    return Number.isFinite(n)?n:0;
  };

  const resultOpen=()=>[...document.querySelectorAll('.resultBackdrop')].some(x=>/SONG COMPLETE/i.test(x.textContent||''));

  const loadUid=async()=>{
    if(uid)return uid;
    const {data}=await db.auth.getUser();
    uid=data?.user?.id||'';
    return uid;
  };

  const removeHud=()=>{hud?.remove();hud=null};

  const playbackButtons=()=>Array.from(document.querySelectorAll('.controls button')) as HTMLButtonElement[];

  const setControlLock=(locked:boolean)=>{
    casualLocked=locked;
    playbackButtons().forEach(button=>{
      const label=(button.textContent||'').trim().toUpperCase();
      const shouldLock=['STOP','RESET','PAUSE','RESUME'].includes(label);
      button.classList.toggle('casualLockedControl',locked&&shouldLock);
      if(locked&&shouldLock){
        button.setAttribute('aria-disabled','true');
        button.title='Disabled during a synced casual match';
      }else if(button.classList.contains('casualLockedControl')===false&&button.title==='Disabled during a synced casual match'){
        button.removeAttribute('aria-disabled');
        button.removeAttribute('title');
      }
    });
    document.body.classList.toggle('casualMatchPlaying',locked);
  };

  const getBlockedKeys=()=>{
    let reset='r',pause='escape';
    try{
      const raw=localStorage.getItem('beatforge-settings');
      if(raw){
        const settings=JSON.parse(raw);
        if(typeof settings?.resetKey==='string'&&settings.resetKey)reset=settings.resetKey.toLowerCase();
        if(typeof settings?.pauseKey==='string'&&settings.pauseKey)pause=settings.pauseKey.toLowerCase();
      }
    }catch{}
    return new Set([reset,pause]);
  };

  const blockSyncedControlClick=(event:MouseEvent)=>{
    if(!casualLocked)return;
    const button=(event.target as HTMLElement|null)?.closest('.controls button') as HTMLButtonElement|null;
    if(!button)return;
    const label=(button.textContent||'').trim().toUpperCase();
    if(!['STOP','RESET','PAUSE','RESUME'].includes(label))return;
    event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
  };

  const blockSyncedHotkeys=(event:KeyboardEvent)=>{
    if(!casualLocked)return;
    const target=event.target as HTMLElement|null;
    if(target?.matches('input,textarea,[contenteditable="true"]'))return;
    if(!getBlockedKeys().has(event.key.toLowerCase()))return;
    event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
  };

  const addStyles=()=>{
    if(document.getElementById('casual-live-score-style'))return;
    const style=document.createElement('style');
    style.id='casual-live-score-style';
    style.textContent=`
      .game>.casualLiveHud{position:absolute;left:18px;bottom:304px;width:145px;z-index:12;display:flex;flex-direction:column;gap:4px;pointer-events:none}
      .casualLiveHud .casualLiveRow{position:relative;display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;width:145px;height:38px;padding:4px 6px 4px 22px;border-radius:9px;background:#0f131c;border:1px solid #303747;box-sizing:border-box}
      .casualLiveHud .casualLiveRow:before{content:'#' attr(data-place);position:absolute;left:6px;top:50%;transform:translateY(-50%);font-size:9px;font-weight:1000;color:#7e8799}
      .casualLiveHud .casualLiveRow[data-place='1']{border-color:#6f7685}.casualLiveHud .casualLiveRow[data-place='1']:before{color:#ffd43b}
      .casualLiveHud .casualLiveName{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:8px;font-weight:1000;color:#fff}
      .casualLiveHud .casualLiveScore{font-size:12px;font-weight:1000;font-variant-numeric:tabular-nums;margin-left:5px;color:#fff}
      .controls button.casualLockedControl{opacity:.42!important;cursor:not-allowed!important;filter:saturate(.45)!important;pointer-events:none!important}
      @media(max-width:760px){.game>.casualLiveHud,.casualLiveHud .casualLiveRow{width:132px}.casualLiveHud .casualLiveRow{height:36px}}
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
      el.innerHTML='<div class="casualLiveRow casualLiveA"><b class="casualLiveName"></b><strong class="casualLiveScore">0</strong></div><div class="casualLiveRow casualLiveB"><b class="casualLiveName"></b><strong class="casualLiveScore">0</strong></div>';
      game.appendChild(el);hud=el;
    }else if(hud.parentElement!==game){game.appendChild(hud)}
    return hud;
  };

  const renderHud=(row:CasualLiveRow,inviterScore:number,inviteeScore:number)=>{
    const root=ensureHud();if(!root)return;
    const players=[
      {name:String(row.inviter?.username||'Player 1'),score:inviterScore,mine:row.inviter_id===uid},
      {name:String(row.invitee?.username||'Player 2'),score:inviteeScore,mine:row.invitee_id===uid},
    ].sort((a,b)=>b.score-a.score);
    const rows=[root.querySelector('.casualLiveA'),root.querySelector('.casualLiveB')] as HTMLElement[];
    rows.forEach((el,i)=>{
      const p=players[i];if(!el||!p)return;
      el.dataset.place=String(i+1);
      const name=el.querySelector('.casualLiveName');
      const score=el.querySelector('.casualLiveScore');
      if(name)name.textContent=p.name;
      if(score)score.textContent=p.score.toLocaleString('da-DK');
      el.style.boxShadow=p.mine?'inset 2px 0 0 #8f72ff':'none';
    });
  };

  const findActive=async()=>{
    if(!uid)await loadUid();
    if(!uid)return null;
    const cutoff=new Date(Date.now()-20*60*1000).toISOString();
    const {data,error}=await db.from('casual_invites')
      .select('id,inviter_id,invitee_id,start_at,inviter_score,invitee_score,chart:charts!casual_invites_chart_id_fkey(title),inviter:profiles!casual_invites_inviter_id_fkey(username),invitee:profiles!casual_invites_invitee_id_fkey(username)')
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
    removeHud();
    setControlLock(false);
    active=null;
  };

  const tick=async()=>{
    if(busy)return;
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

      // Once the shared start time is reached, local pause/reset/stop would desync the clients.
      // Keep both players on the same uninterrupted timeline instead.
      setControlLock(true);

      const score=numberFrom(document.querySelector('.hudScore b')?.textContent);
      const {data,error}=await db.rpc('casual_update_score',{p_invite:active.id,p_score:score});
      if(error){
        if(!schemaErrorShown){schemaErrorShown=true;console.error('casual_update_score',error)}
        removeHud();return;
      }
      schemaErrorShown=false;
      const live=Array.isArray(data)?data[0]:data;
      const inviterScore=Number(live?.inviter_score??active.inviter_score??0)||0;
      const inviteeScore=Number(live?.invitee_score??active.invitee_score??0)||0;
      active.inviter_score=inviterScore;active.invitee_score=inviteeScore;
      renderHud(active,inviterScore,inviteeScore);
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
