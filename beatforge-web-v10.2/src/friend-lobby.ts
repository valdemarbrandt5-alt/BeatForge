import {supabase} from './lib/supabase';
import {groupSongs,instrumentLabel,loadChartById,loadSongInstruments,type ChartInstrument} from './chart-instruments';
import './friend-lobby.css';

type Friend={id:string;username:string};
type Chart={id:string;title:string;artist:string|null;youtube_url:string|null;instrument?:ChartInstrument;play_count?:number|null};
type Room={id:string;host_id:string;chart_id:string|null;round_number:number;status:'waiting'|'countdown'|'results'|'closed';start_at:string|null;chart?:Chart|null};
type Member={lobby_id:string;user_id:string;status:'invited'|'active'|'left';round_number:number;ready:boolean;score:number;combo:number;finished:boolean;perfect:number;great:number;good:number;miss:number;max_combo:number;profile?:{username:string|null}|null};

if(typeof window!=='undefined'&&supabase&&location.pathname==='/'){
  const db:any=supabase;
  let uid='',room:Room|null=null,members:Member[]=[],friends:Friend[]=[];
  let modal:HTMLElement|null=null,picker:HTMLElement|null=null,prompt:HTMLElement|null=null,dock:HTMLElement|null=null;
  let busy=false,preparing=false,localRound=0,loadedChartId='',difficulty='',chosenChartId='',ready=false,startedRound=0,runId='',resultSent=false;
  let scheduledRound=0,startTimer:number|null=null,inviteSeen='',pollNumber=0,playingLocked=false;
  const esc=(v:unknown)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]||c));
  const errorText=(e:any)=>/relation|schema cache|function|column|does not exist|permission denied/i.test(String(e?.message||''))
    ?'Run friend_lobbies.sql in Supabase, then refresh both browsers.':String(e?.message||'Could not sync Friends lobby.');
  const notify=(message:string)=>{document.querySelector('.friendLobbyToast')?.remove();const el=document.createElement('div');el.className='friendLobbyToast';el.textContent=message;document.body.appendChild(el);window.setTimeout(()=>el.remove(),5000)};
  const clearStart=()=>{if(startTimer!==null)clearTimeout(startTimer);startTimer=null;scheduledRound=0};
  const resetLocal=()=>{clearStart();localRound=0;loadedChartId='';difficulty='';chosenChartId='';ready=false;startedRound=0;runId='';resultSent=false};
  const roomMembers=()=>members.filter(m=>m.status==='active');
  const myMember=()=>members.find(m=>m.user_id===uid&&m.status==='active');
  const closeModal=()=>{modal?.remove();modal=null};
  const closePicker=()=>{picker?.remove();picker=null};
  const closePrompt=()=>{prompt?.remove();prompt=null};
  const closeFriendsModal=()=>{const list=document.querySelector('.friendList');const dialog=list?.closest('.resultBackdrop');const close=[...(dialog?.querySelectorAll('button')||[])].find(b=>b.textContent?.trim()==='CLOSE') as HTMLButtonElement|undefined;close?.click()};
  const loadUid=async()=>{if(uid)return uid;const {data}=await db.auth.getUser();uid=data?.user?.id||'';return uid};
  const loadFriends=async()=>{
    if(!await loadUid())return;
    const {data,error}=await db.from('friendships').select('requester_id,addressee_id,status,requester:profiles!friendships_requester_id_fkey(username),addressee:profiles!friendships_addressee_id_fkey(username)')
      .eq('status','accepted').or(`requester_id.eq.${uid},addressee_id.eq.${uid}`);
    if(error)return;
    friends=(data||[]).map((r:any)=>{const mine=r.requester_id===uid;return{id:String(mine?r.addressee_id:r.requester_id),username:String((mine?r.addressee:r.requester)?.username||'Player')}});
    enhanceFriends();
  };
  const loadRoom=async(id:string)=>{
    const {data,error}=await db.from('friend_lobbies').select('id,host_id,chart_id,round_number,status,start_at,chart:charts!friend_lobbies_chart_id_fkey(id,title,artist,youtube_url,instrument,play_count)').eq('id',id).maybeSingle();
    if(error)throw error;
    return data as Room|null;
  };
  const loadMembers=async(id:string)=>{
    const {data,error}=await db.from('friend_lobby_members').select('lobby_id,user_id,status,round_number,ready,score,combo,finished,perfect,great,good,miss,max_combo,profile:profiles!friend_lobby_members_user_id_fkey(username)').eq('lobby_id',id);
    if(error)throw error;
    return data as Member[];
  };
  const attachRoom=async(id:string)=>{
    const next=await loadRoom(id);if(!next||next.status==='closed')throw new Error('Lobby closed');
    if(room?.id!==id)resetLocal();room=next;members=await loadMembers(id);closeFriendsModal();showDock();renderLobby();
  };
  const createRoom=async()=>{
    if(!await loadUid()){notify('Log in to play with friends.');return false}
    if(room)return true;
    const {data,error}=await db.rpc('friend_lobby_create');
    if(error){notify(errorText(error));return false}
    try{await attachRoom(String(data));return true}catch(e){notify(errorText(e));return false}
  };
  const showDock=()=>{
    if(!dock){dock=document.createElement('button');dock.className='friendLobbyDock';dock.textContent='FRIENDS LOBBY';dock.onclick=()=>{if(room){openLobby()}else void createRoom().then(ok=>{if(ok)openLobby()})};document.body.appendChild(dock)}
    dock.hidden=!room;dock.textContent='OPEN FRIENDS LOBBY';
  };
  const openLobby=()=>{
    if(!room)return;
    closeModal();closePicker();
    modal=document.createElement('div');modal.className='friendLobbyOverlay';modal.innerHTML='<div class="friendLobbyCard" role="dialog" aria-modal="true" aria-label="Friends lobby"></div>';
    document.body.appendChild(modal);renderLobby();
  };
  const invite=async(friend:Friend)=>{
    if(!await createRoom()||!room)return;
    if(room.host_id!==uid){notify('Only the lobby host can invite friends.');return}
    const {error}=await db.rpc('friend_lobby_invite',{p_lobby:room.id,p_friend:friend.id});
    if(error){notify(errorText(error));return}
    notify(`Invited ${friend.username} to the lobby.`);closeFriendsModal();openLobby();void poll();
  };
  const leave=async()=>{
    if(!room)return;const id=room.id;
    const {error}=await db.rpc('friend_lobby_leave',{p_lobby:id});
    if(error){notify(errorText(error));return}
    const wasPlaying=playingLocked;playingLocked=false;room=null;members=[];resetLocal();closeModal();closePicker();showDock();document.querySelector('.friendLobbyHud')?.remove();
    if(wasPlaying)location.reload();
  };
  const formatMember=(m:Member,index:number)=>`<div class="friendLobbyMember"><b>${index+1}</b><span>${esc(m.user_id===uid?'YOU':m.profile?.username||'Player')}${m.user_id===room?.host_id?' <em>HOST</em>':''}</span><strong>${room?.status==='results'||m.finished?`${Number(m.score||0).toLocaleString('da-DK')}`:m.ready?'READY':room?.status==='countdown'?'PLAYING':'WAITING'}</strong></div>`;
  const renderLobby=()=>{
    if(!room||!modal)return;
    const active=roomMembers();const invitees=members.filter(m=>m.status==='invited');
    const isHost=room.host_id===uid;const current=room.round_number>0&&room.chart_id;
    const status=room.status==='results'?'ROUND COMPLETE':room.status==='countdown'?'SONG IN PROGRESS':current?'GET READY':'CHOOSE A SONG';
    const remaining=room.start_at?Math.max(0,Math.ceil((new Date(room.start_at).getTime()-Date.now())/1000)):0;
    const canReady=current&&room.status==='waiting'&&localRound===room.round_number&&!!loadedChartId&&!!difficulty&&!ready;
    const card=modal.querySelector('.friendLobbyCard')!;
    card.innerHTML=`<button class="friendLobbyClose" aria-label="Close">×</button><small>VS FRIENDS · SHARED LOBBY</small><h2>${status}</h2>
      <p>Stay together for the next song. Each player chooses their own instrument and difficulty.</p>
      <div class="friendLobbyMembers">${active.map(formatMember).join('')}${invitees.map(m=>`<div class="friendLobbyMember invited"><b>+</b><span>${esc(m.profile?.username||'Friend')}</span><strong>INVITED</strong></div>`).join('')}</div>
      <div class="friendLobbySong">${current?`<strong>${esc(room.chart?.title||'Loading song…')}</strong><span>${esc(room.chart?.artist||'')} · Round ${room.round_number}</span>`:'<strong>No song selected</strong>'}</div>
      ${current&&room.status==='waiting'&&myMember()?`<div class="friendLobbyChoices"><label>INSTRUMENT <select class="friendLobbyInstrument" ${ready?'disabled':''}><option value="${esc(chosenChartId||room.chart_id||'')}">${esc(instrumentLabel(room.chart?.instrument))}</option></select></label><label>DIFFICULTY <select class="friendLobbyDifficulty" ${ready?'disabled':''}>${['Easy','Medium','Hard','Expert'].map(d=>`<option value="${d}" ${difficulty===d?'selected':''}>${d}</option>`).join('')}</select></label></div>`:''}
      ${room.status==='countdown'?`<div class="friendLobbyCountdown">${remaining?`STARTING IN ${remaining}`:'PLAYING'}</div>`:''}
      <div class="friendLobbyActions">${isHost&&room.status!=='countdown'?'<button data-action="song">CHOOSE SONG</button>':''}${isHost?'<button data-action="invite">INVITE FRIEND</button>':''}${canReady?'<button data-action="ready">READY</button>':''}<button data-action="leave" class="secondary">LEAVE LOBBY</button></div>
      ${!current?'<small>Invite friends, then choose a song. At least two players must be ready.</small>':room.status==='results'?'<small>The host can choose the next song. Everyone stays in this lobby.</small>':''}`;
    card.querySelector<HTMLButtonElement>('.friendLobbyClose')!.onclick=closeModal;
    card.querySelectorAll<HTMLButtonElement>('[data-action]').forEach(button=>button.onclick=()=>{
      if(button.dataset.action==='song')void openSongPicker();
      if(button.dataset.action==='invite')void openFriendPicker();
      if(button.dataset.action==='ready')void setReady();
      if(button.dataset.action==='leave')void leave();
    });
    const instrument=card.querySelector<HTMLSelectElement>('.friendLobbyInstrument');
    if(instrument&&room.chart){
      const choices=availableCharts;
      if(choices.length)instrument.innerHTML=choices.map(c=>`<option value="${esc(c.id)}" ${chosenChartId===c.id?'selected':''}>${esc(instrumentLabel(c.instrument))}</option>`).join('');
      instrument.onchange=()=>{chosenChartId=instrument.value;loadedChartId='';void prepareChoice()};
    }
    const diff=card.querySelector<HTMLSelectElement>('.friendLobbyDifficulty');
    if(diff){diff.value=difficulty||'Expert';diff.onchange=()=>{difficulty=diff.value;applyDifficulty();renderLobby()}}
  };
  let availableCharts:Chart[]=[];
  const applyDifficulty=()=>{const btn=[...document.querySelectorAll<HTMLButtonElement>('.chartOptions button')].find(b=>b.textContent?.trim()===difficulty);btn?.click()};
  const prepareChoice=async()=>{
    if(!room||!chosenChartId||preparing)return;
    preparing=true;
    const id=chosenChartId,round=room.round_number;
    try{const loaded=await loadChartById(id);if(!loaded)throw new Error('Could not load this instrument');if(room?.round_number!==round||chosenChartId!==id)return;
      loadedChartId=id;applyDifficulty();renderLobby();
    }catch(e){notify(errorText(e))}finally{preparing=false;if(chosenChartId!==id&&room?.round_number===round)void prepareChoice()}
  };
  const prepareRound=async(next:Room)=>{
    if(preparing||!next.chart_id)return;
    localRound=next.round_number;chosenChartId=next.chart_id;loadedChartId='';difficulty='Expert';ready=false;availableCharts=[];resultSent=false;runId='';startedRound=0;
    preparing=true;
    try{
      const loaded=await loadChartById(next.chart_id);if(!loaded)throw new Error('Could not load the selected song');
      if(room?.round_number!==next.round_number)return;
      loadedChartId=next.chart_id;applyDifficulty();
      availableCharts=await loadSongInstruments(db,next.chart as Chart) as Chart[];
      renderLobby();
    }catch(e){notify(errorText(e))}finally{preparing=false}
  };
  const setReady=async()=>{
    if(!room||!loadedChartId||!difficulty||ready)return;
    const id=room.id,round=room.round_number;
    const {error}=await db.rpc('friend_lobby_ready',{p_lobby:id,p_round:round});
    if(error){notify(errorText(error));return}
    ready=true;renderLobby();void poll();
  };
  const startRound=()=>{
    if(!room||room.status!=='countdown'||startedRound===room.round_number)return;
    if(!ready||localRound!==room.round_number||!loadedChartId){startTimer=window.setTimeout(startRound,250);return}
    const play=[...document.querySelectorAll<HTMLButtonElement>('.controls button')].find(b=>b.textContent?.trim()==='PLAY'&&!b.disabled);
    if(!play){notify('Could not start the song. Open the lobby and try again.');return}
    const previous=document.querySelector<HTMLElement>('main')?.dataset.scoreRunId||'';
    startedRound=room.round_number;clearStart();closeModal();play.click();playingLocked=true;
    const capture=(attempt:number)=>{const id=document.querySelector<HTMLElement>('main')?.dataset.scoreRunId||'';
      if(id===previous&&attempt<8){requestAnimationFrame(()=>capture(attempt+1));return}
      runId=id;ensureHud();renderHud()};
    requestAnimationFrame(()=>capture(0));
  };
  const scheduleStart=()=>{
    if(!room||room.status!=='countdown'||!room.start_at||!ready||startedRound===room.round_number)return;
    if(scheduledRound===room.round_number)return;
    clearStart();scheduledRound=room.round_number;
    startTimer=window.setTimeout(startRound,Math.max(0,new Date(room.start_at).getTime()-Date.now()));
  };
  const ensureHud=()=>{
    const game=document.querySelector('.game');if(!game)return null;
    let hud=game.querySelector('.friendLobbyHud') as HTMLElement|null;
    if(!hud){hud=document.createElement('div');hud.className='friendLobbyHud';game.appendChild(hud)}
    return hud;
  };
  const renderHud=()=>{
    if(!room||startedRound!==room.round_number)return;
    const hud=ensureHud();if(!hud)return;
    const roster=roomMembers().filter(m=>m.round_number===room!.round_number&&m.ready).map(m=>({
      ...m,score:m.user_id===uid?Math.max(Number(m.score||0),numberFrom(document.querySelector('.hudScore b')?.textContent)):Number(m.score||0),
      combo:m.user_id===uid?numberFrom(document.querySelector('.hudCombo b')?.textContent):Number(m.combo||0),
    })).sort((a,b)=>b.score-a.score);
    hud.innerHTML=`<small>VS FRIENDS · LIVE</small>${roster.map((m,i)=>`<div class="friendLobbyHudRow"><b>#${i+1}</b><span>${esc(m.user_id===uid?'YOU':m.profile?.username||'Player')}</span><strong>${m.score.toLocaleString('da-DK')}</strong><em>${m.combo}x</em></div>`).join('')}`;
  };
  const numberFrom=(value:string|null|undefined)=>Number(String(value||'0').replace(/[^0-9-]/g,''))||0;
  const resultCard=()=>[...document.querySelectorAll<HTMLElement>('.resultBackdrop')].find(el=>el.dataset.scoreRunId===runId&&el.style.display!=='none'&&/SONG COMPLETE/i.test(el.textContent||''))?.querySelector<HTMLElement>('.resultCard')||null;
  const renderResults=()=>{
    const card=resultCard();if(!card||!room)return;
    let panel=card.querySelector('.friendLobbyResult') as HTMLElement|null;
    if(!panel){panel=document.createElement('div');panel.className='friendLobbyResult';card.querySelector('.resultActions')?.before(panel)}
    const roster=roomMembers().filter(m=>m.round_number===room!.round_number&&m.ready).sort((a,b)=>Number(b.score||0)-Number(a.score||0));
    panel.innerHTML=`<small>FRIENDS · ROUND ${room.round_number}</small><h3>${room.status==='results'?'FINAL SCORES':'WAITING FOR FRIENDS'}</h3>${roster.map((m,i)=>`<div><b>#${i+1} ${esc(m.user_id===uid?'YOU':m.profile?.username||'Player')}</b><strong>${Number(m.score||0).toLocaleString('da-DK')}</strong><span>${m.finished?'FINISHED':'PLAYING'}</span></div>`).join('')}<button>OPEN LOBBY</button>`;
    panel.querySelector('button')!.onclick=openLobby;
  };
  const finishRound=async()=>{
    if(!room||resultSent||startedRound!==room.round_number)return;
    const card=resultCard();if(!card)return;
    resultSent=true;
    const {error}=await db.rpc('friend_lobby_finish',{p_lobby:room.id,p_round:room.round_number,
      p_score:numberFrom(card.querySelector('.finalScore')?.textContent),p_perfect:numberFrom(card.querySelector('.perfectStat b')?.textContent),
      p_great:numberFrom(card.querySelector('.greatStat b')?.textContent),p_good:numberFrom(card.querySelector('.goodStat b')?.textContent),
      p_miss:numberFrom(card.querySelector('.missStat b')?.textContent),p_max_combo:numberFrom(card.querySelector('.resultMeta>div:nth-child(2) b')?.textContent)});
    if(error){resultSent=false;notify(errorText(error));return}
    playingLocked=false;document.querySelector('.friendLobbyHud')?.remove();renderResults();
  };
  const syncLive=async()=>{
    if(!room||startedRound!==room.round_number||resultSent)return;
    if(resultCard()){await finishRound();return}
    if(!room.start_at||Date.now()<new Date(room.start_at).getTime()-800)return;
    const score=numberFrom(document.querySelector('.hudScore b')?.textContent),combo=numberFrom(document.querySelector('.hudCombo b')?.textContent);
    const {error}=await db.rpc('friend_lobby_live',{p_lobby:room.id,p_round:room.round_number,p_score:score,p_combo:combo});
    if(error){const label=ensureHud()?.querySelector('small');if(label)label.textContent='VS FRIENDS · SYNC ERROR';if(pollNumber%10===0)notify(errorText(error))}
    renderHud();
  };
  const openFriendPicker=async()=>{
    if(!room)return;if(!friends.length)await loadFriends();
    const overlay=document.createElement('div');overlay.className='friendLobbyOverlay friendLobbyFriendPicker';
    overlay.innerHTML=`<div class="friendLobbyCard"><button class="friendLobbyClose">×</button><small>FRIENDS LOBBY</small><h2>INVITE FRIENDS</h2><div class="friendLobbyPickList">${friends.filter(f=>!members.some(m=>m.user_id===f.id&&m.status!=='left')).map(f=>`<button data-id="${esc(f.id)}">${esc(f.username)} <span>INVITE</span></button>`).join('')||'<p>All your friends are already here.</p>'}</div></div>`;
    document.body.appendChild(overlay);picker=overlay;
    overlay.querySelector<HTMLButtonElement>('.friendLobbyClose')!.onclick=closePicker;
    overlay.querySelectorAll<HTMLButtonElement>('[data-id]').forEach(btn=>btn.onclick=()=>{const friend=friends.find(f=>f.id===btn.dataset.id);if(friend){btn.disabled=true;void invite(friend).then(()=>closePicker())}});
  };
  const openSongPicker=async()=>{
    if(!room||room.host_id!==uid)return;
    closePicker();const overlay=document.createElement('div');overlay.className='friendLobbyOverlay friendLobbySongPicker';
    overlay.innerHTML='<div class="friendLobbyCard friendLobbyWide"><button class="friendLobbyClose">×</button><small>FRIENDS LOBBY · SONG</small><h2>CHOOSE A SONG</h2><input class="friendLobbySearch" placeholder="Search songs or artists…"><div class="friendLobbySongs">Loading…</div><button class="friendLobbyMore">MORE SONGS</button></div>';
    document.body.appendChild(overlay);picker=overlay;
    overlay.querySelector<HTMLButtonElement>('.friendLobbyClose')!.onclick=closePicker;
    const search=overlay.querySelector<HTMLInputElement>('.friendLobbySearch')!,results=overlay.querySelector<HTMLElement>('.friendLobbySongs')!;
    let page=0,request=0,timer:number|null=null;
    const load=async()=>{
      const current=++request,term=search.value.trim().replace(/[%,()*\\"]/g,' ').trim();
      let query=db.from('charts').select('id,title,artist,youtube_url,instrument,play_count').order('play_count',{ascending:false}).order('id',{ascending:false}).range(page*60,page*60+60);
      if(term)query=query.or(`title.ilike.%${term}%,artist.ilike.%${term}%`);
      const {data,error}=await query;
      if(picker!==overlay||current!==request)return;
      if(error){results.textContent=errorText(error);return}
      const groups=groupSongs(((data||[]).slice(0,60)) as Chart[]);
      results.innerHTML=groups.map(group=>{const c=group.find(x=>x.instrument==='mix')||group[0];const id=c.youtube_url?.match(/[?&]v=([A-Za-z0-9_-]{11})/)?.[1];return `<button data-chart="${esc(c.id)}">${id?`<img src="https://i.ytimg.com/vi/${esc(id)}/mqdefault.jpg" alt="">`:'<span>BF</span>'}<b>${esc(c.title)}<small>${esc(c.artist||'Unknown artist')}</small></b><em>SELECT</em></button>`}).join('')||'<p>No songs found.</p>';
      results.querySelectorAll<HTMLButtonElement>('[data-chart]').forEach(btn=>btn.onclick=async()=>{
        if(!room)return;btn.disabled=true;
        const {error:chooseError}=await db.rpc('friend_lobby_choose_song',{p_lobby:room.id,p_chart:btn.dataset.chart});
        if(chooseError){notify(errorText(chooseError));btn.disabled=false;return}
        closePicker();void poll();
      });
      overlay.querySelector<HTMLButtonElement>('.friendLobbyMore')!.hidden=(data||[]).length<61;
    };
    search.oninput=()=>{if(timer!==null)clearTimeout(timer);timer=window.setTimeout(()=>{page=0;void load()},300)};
    overlay.querySelector<HTMLButtonElement>('.friendLobbyMore')!.onclick=()=>{page++;void load()};
    void load();search.focus();
  };
  const pollInvites=async()=>{
    if(room||prompt||!uid)return;
    const {data,error}=await db.from('friend_lobby_members').select('lobby_id').eq('user_id',uid).eq('status','invited').order('joined_at',{ascending:false}).limit(1).maybeSingle();
    if(error||!data||data.lobby_id===inviteSeen)return;
    const next=await loadRoom(data.lobby_id);if(!next||next.status==='closed')return;
    inviteSeen=data.lobby_id;
    const {data:host}=await db.from('profiles').select('username').eq('id',next.host_id).maybeSingle();
    const overlay=document.createElement('div');overlay.className='friendLobbyOverlay friendLobbyPrompt';
    overlay.innerHTML=`<div class="friendLobbyCard"><small>FRIENDS LOBBY INVITE</small><h2>${esc(host?.username||'A friend')} invited you</h2><p>Join the lobby now and play several songs together. No MMR.</p><div class="friendLobbyActions"><button data-accept="yes">JOIN LOBBY</button><button data-accept="no" class="secondary">DECLINE</button></div></div>`;
    document.body.appendChild(overlay);prompt=overlay;
    overlay.querySelectorAll<HTMLButtonElement>('[data-accept]').forEach(btn=>btn.onclick=async()=>{
      const accept=btn.dataset.accept==='yes';btn.disabled=true;
      const {error:answerError}=await db.rpc('friend_lobby_answer',{p_lobby:data.lobby_id,p_accept:accept});
      if(answerError){notify(errorText(answerError));btn.disabled=false;return}
      closePrompt();inviteSeen='';if(accept){try{await attachRoom(data.lobby_id);openLobby()}catch(e){notify(errorText(e))}}
    });
  };
  const poll=async()=>{
    if(busy)return;busy=true;pollNumber++;
    try{
      if(!await loadUid())return;
      if(!room){
        if(pollNumber%5===0){
          const {data}=await db.from('friend_lobby_members').select('lobby_id').eq('user_id',uid).eq('status','active').order('joined_at',{ascending:false}).limit(1).maybeSingle();
          if(data){const candidate=await loadRoom(data.lobby_id);if(candidate&&candidate.status!=='closed')await attachRoom(candidate.id)}
        }
        await pollInvites();return;
      }
      const next=await loadRoom(room.id);
      if(!next||next.status==='closed'){room=null;members=[];resetLocal();closeModal();showDock();return}
      const previous=room.round_number,previousStatus=room.status;
      room=next;members=await loadMembers(room.id);
      if(!myMember()){room=null;members=[];resetLocal();closeModal();showDock();return}
      if(next.round_number!==localRound&&next.chart_id&&(next.status==='waiting'||(next.status==='countdown'&&!!next.start_at&&Date.now()<new Date(next.start_at).getTime())))void prepareRound(next);
      if(localRound===next.round_number)ready=!!myMember()?.ready;
      if(previous!==next.round_number||previousStatus!==next.status)renderLobby();
      if(next.status==='countdown'){scheduleStart();if(modal)renderLobby()}
      await syncLive();if(resultSent)renderResults();
      if(modal&&next.status!=='countdown'&&pollNumber%3===0)renderLobby();
    }catch(e){if(pollNumber%10===0)notify(errorText(e))}finally{busy=false}
  };
  const enhanceFriends=()=>{
    const list=document.querySelector<HTMLElement>('.friendList');
    if(list&&!list.querySelector('.friendLobbyCreate')){const button=document.createElement('button');button.className='friendLobbyCreate';button.textContent='CREATE OR OPEN FRIENDS LOBBY';button.onclick=()=>void createRoom().then(ok=>{if(ok)openLobby()});list.prepend(button)}
    document.querySelectorAll<HTMLElement>('.friendList .friendRow').forEach(row=>{
      if(row.querySelector('.friendLobbyInvite'))return;
      const name=row.querySelector('strong')?.textContent?.trim();const f=friends.find(item=>item.username===name);
      if(!f)return;
      const action=document.createElement('button');action.className='friendLobbyInvite';action.textContent='INVITE TO LOBBY';action.onclick=()=>void invite(f);
      row.appendChild(action);
    });
  };
  const start=()=>{
    void loadUid().then(()=>{showDock();return loadFriends()});
    document.addEventListener('click',event=>{if(!playingLocked)return;const button=(event.target as HTMLElement|null)?.closest('.controls button');if(!button)return;if(!['STOP','RESET','PAUSE','RESUME'].includes((button.textContent||'').trim().toUpperCase()))return;event.preventDefault();event.stopImmediatePropagation()},true);
    window.addEventListener('keydown',event=>{if(!playingLocked||event.target instanceof HTMLInputElement||event.target instanceof HTMLTextAreaElement)return;let reset='r',pause='escape';try{const saved=JSON.parse(localStorage.getItem('beatforge-settings')||'{}');reset=String(saved.resetKey||reset).toLowerCase();pause=String(saved.pauseKey||pause).toLowerCase()}catch{}const key=event.key.toLowerCase();if(![reset,pause,'escape'].includes(key))return;event.preventDefault();event.stopImmediatePropagation();if(key==='escape'&&!event.repeat){openLobby();notify('Use LEAVE LOBBY to end the shared match.')}},true);
    const observer=new MutationObserver(enhanceFriends);observer.observe(document.body,{subtree:true,childList:true});
    window.setInterval(()=>void poll(),550);window.setInterval(()=>void loadFriends(),30000);void poll();
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
}
