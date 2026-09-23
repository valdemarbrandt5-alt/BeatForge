import { supabase } from './lib/supabase';

type CasualRow={
  id:string;
  inviter_id:string;
  invitee_id:string;
  inviter_ready:boolean;
  invitee_ready:boolean;
  start_at:string|null;
  created_at:string;
  chart?:{id:string;title:string;artist:string|null}|null;
  inviter?:{username:string|null}|null;
  invitee?:{username:string|null}|null;
};

if (typeof window !== 'undefined' && supabase && window.location.pathname === '/') {
  const db:any=supabase;
  let uid='';
  let pollBusy=false;
  let overlay:HTMLElement|null=null;
  let activeId='';
  let allowPlay=false;
  let ticking:number|null=null;

  const loadUid=async()=>{
    if(uid)return uid;
    const {data}=await db.auth.getUser();
    uid=data?.user?.id||'';
    return uid;
  };

  const playButton=()=>Array.from(document.querySelectorAll('.controls button')).find((b:any)=>b.textContent?.trim()==='PLAY') as HTMLButtonElement|undefined;
  const currentSong=()=>String(document.querySelector('.upload strong')?.textContent||'').trim().toLowerCase();

  const closeOverlay=()=>{
    overlay?.remove();
    overlay=null;
    if(ticking!==null){window.clearInterval(ticking);ticking=null}
  };

  const addStyles=()=>{
    if(document.getElementById('casual-ready-style'))return;
    const style=document.createElement('style');
    style.id='casual-ready-style';
    style.textContent=`
      .casualReadyBackdrop{position:fixed;inset:0;z-index:14100;background:#03050be6;backdrop-filter:blur(12px);display:grid;place-items:center;padding:20px}
      .casualReadyCard{width:min(500px,94vw);background:linear-gradient(155deg,#151a25,#0c1118);border:1px solid #353d4d;border-radius:18px;padding:24px;text-align:center;box-shadow:0 24px 80px #0009}
      .casualReadyCard>small{font-size:8px;font-weight:1000;letter-spacing:1.7px;color:#9c7cff}.casualReadyCard h2{font-size:25px;margin:7px 0 4px}.casualReadyCard>p{margin:0;color:#8993a5;font-size:10px}
      .casualReadySong{margin:18px 0 14px;padding:12px;background:#090e15;border:1px solid #29313e;border-radius:12px;text-align:left}.casualReadySong strong{display:block;font-size:13px}.casualReadySong span{display:block;margin-top:3px;font-size:9px;color:#7e8899}
      .casualReadyPlayers{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:12px 0 16px}.casualReadyPlayer{padding:11px;border:1px solid #2b3341;border-radius:11px;background:#0b1017;text-align:left}.casualReadyPlayer span{display:block;font-size:8px;color:#798395;margin-bottom:4px}.casualReadyPlayer b{font-size:11px}.casualReadyPlayer.ready{border-color:#5fcf9a;background:#0d1815}.casualReadyPlayer.ready b:after{content:' · READY';color:#63e0a8;font-size:8px}
      .casualReadyButton{min-width:170px;padding:12px 18px;border:1px solid #8a73ff;border-radius:10px;background:#7658ff;color:white;font-size:10px;font-weight:1000;letter-spacing:.6px}.casualReadyButton:disabled{background:#202633;border-color:#343c49;color:#7d8799}
      .casualReadyStatus{height:18px;margin-top:12px;font-size:9px;font-weight:900;letter-spacing:.6px;color:#a7afbd}.casualReadyCountdown{font-size:52px!important;line-height:1!important;color:#a98cff!important;text-shadow:0 0 28px #896bff88;margin-top:12px!important}
    `;
    document.head.appendChild(style);
  };

  const render=(row:CasualRow)=>{
    const iAmInviter=row.inviter_id===uid;
    const myReady=iAmInviter?!!row.inviter_ready:!!row.invitee_ready;
    const oppReady=iAmInviter?!!row.invitee_ready:!!row.inviter_ready;
    const meName=iAmInviter?(row.inviter?.username||'You'):(row.invitee?.username||'You');
    const oppName=iAmInviter?(row.invitee?.username||'Friend'):(row.inviter?.username||'Friend');
    const myBox=overlay?.querySelector('.casualReadyMe') as HTMLElement|null;
    const oppBox=overlay?.querySelector('.casualReadyOpp') as HTMLElement|null;
    const button=overlay?.querySelector('.casualReadyButton') as HTMLButtonElement|null;
    const status=overlay?.querySelector('.casualReadyStatus') as HTMLElement|null;
    if(myBox){myBox.classList.toggle('ready',myReady);const b=myBox.querySelector('b');if(b)b.textContent=String(meName)}
    if(oppBox){oppBox.classList.toggle('ready',oppReady);const b=oppBox.querySelector('b');if(b)b.textContent=String(oppName)}
    if(button){button.disabled=myReady||!!row.start_at;button.textContent=myReady?'READY ✓':'READY'}
    if(status&&!row.start_at)status.textContent=myReady&&!oppReady?'WAITING FOR FRIEND…':!myReady&&oppReady?'YOUR FRIEND IS READY':'PRESS READY WHEN YOU ARE SET';
  };

  const triggerSyncedPlay=(row:CasualRow)=>{
    if(!row.start_at||sessionStorage.getItem(`beatforge-casual-started:${row.id}`))return;
    const status=overlay?.querySelector('.casualReadyStatus') as HTMLElement|null;
    const target=new Date(row.start_at).getTime();
    const tick=()=>{
      const remaining=target-Date.now();
      if(status){
        if(remaining>0){status.classList.add('casualReadyCountdown');status.textContent=String(Math.max(1,Math.ceil(remaining/1000)))}
        else status.textContent='GO!';
      }
      if(remaining<=0){
        if(ticking!==null){window.clearInterval(ticking);ticking=null}
        const play=playButton();
        if(play&&!play.disabled){
          allowPlay=true;
          sessionStorage.setItem(`beatforge-casual-started:${row.id}`,'1');
          closeOverlay();
          play.click();
          window.setTimeout(()=>{allowPlay=false},0);
          activeId='';
        }
      }
    };
    tick();
    if(ticking===null)ticking=window.setInterval(tick,80);
  };

  const ensureOverlay=(row:CasualRow)=>{
    if(sessionStorage.getItem(`beatforge-casual-started:${row.id}`))return;
    const title=String(row.chart?.title||'Casual song');
    if(currentSong()!==title.trim().toLowerCase()||document.querySelector('.communityOverlay'))return;
    if(!overlay){
      const iAmInviter=row.inviter_id===uid;
      const meName=iAmInviter?(row.inviter?.username||'You'):(row.invitee?.username||'You');
      const oppName=iAmInviter?(row.invitee?.username||'Friend'):(row.inviter?.username||'Friend');
      const el=document.createElement('div');
      el.className='casualReadyBackdrop';
      el.innerHTML=`<div class="casualReadyCard"><small>CASUAL MATCH</small><h2>READY UP</h2><p>You both start together. No Ranked, no MMR.</p><div class="casualReadySong"><strong></strong><span></span></div><div class="casualReadyPlayers"><div class="casualReadyPlayer casualReadyMe"><span>YOU</span><b></b></div><div class="casualReadyPlayer casualReadyOpp"><span>FRIEND</span><b></b></div></div><button class="casualReadyButton">READY</button><div class="casualReadyStatus">PRESS READY WHEN YOU ARE SET</div></div>`;
      (el.querySelector('.casualReadySong strong') as HTMLElement).textContent=title;
      (el.querySelector('.casualReadySong span') as HTMLElement).textContent=String(row.chart?.artist||'Unknown artist');
      (el.querySelector('.casualReadyMe b') as HTMLElement).textContent=String(meName);
      (el.querySelector('.casualReadyOpp b') as HTMLElement).textContent=String(oppName);
      (el.querySelector('.casualReadyButton') as HTMLButtonElement).onclick=async()=>{
        const button=el.querySelector('.casualReadyButton') as HTMLButtonElement;
        button.disabled=true;button.textContent='READY ✓';
        const {error}=await db.rpc('casual_set_ready',{p_invite:row.id});
        if(error){button.disabled=false;button.textContent='READY';const status=el.querySelector('.casualReadyStatus') as HTMLElement;status.textContent=error.message.includes('casual_set_ready')?'RUN THE UPDATED casual_invites.sql FIRST':error.message}
      };
      document.body.appendChild(el);
      overlay=el;
    }
    render(row);
    if(row.start_at)triggerSyncedPlay(row);
  };

  const poll=async()=>{
    if(pollBusy)return;
    pollBusy=true;
    try{
      if(!uid)await loadUid();
      if(!uid)return;
      const cutoff=new Date(Date.now()-10*60*1000).toISOString();
      const {data,error}=await db.from('casual_invites')
        .select('id,inviter_id,invitee_id,inviter_ready,invitee_ready,start_at,created_at,chart:charts!casual_invites_chart_id_fkey(id,title,artist),inviter:profiles!casual_invites_inviter_id_fkey(username),invitee:profiles!casual_invites_invitee_id_fkey(username)')
        .eq('status','accepted')
        .or(`inviter_id.eq.${uid},invitee_id.eq.${uid}`)
        .gt('created_at',cutoff)
        .order('created_at',{ascending:false})
        .limit(1)
        .maybeSingle();
      if(error)return;
      if(!data){closeOverlay();activeId='';return}
      const row=data as CasualRow;
      activeId=row.id;
      ensureOverlay(row);
    }finally{pollBusy=false}
  };

  const blockEarlyPlay=(event:Event)=>{
    if(allowPlay||!activeId||!overlay)return;
    const target=(event.target as HTMLElement|null)?.closest('.controls button') as HTMLButtonElement|null;
    if(!target||target.textContent?.trim()!=='PLAY')return;
    event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
  };

  const start=()=>{
    addStyles();void loadUid();
    document.addEventListener('click',blockEarlyPlay,true);
    window.setInterval(()=>void poll(),450);
    void poll();
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
}
