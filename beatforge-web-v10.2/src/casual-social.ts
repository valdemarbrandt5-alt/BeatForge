import { supabase } from './lib/supabase';

type FriendInfo={id:string;username:string};
type ChartInfo={id:string;title:string;artist:string|null;youtube_url:string|null;play_count:number|null};

if (typeof window !== 'undefined' && supabase && window.location.pathname === '/') {
  const db:any=supabase;
  let uid='';
  let friends:FriendInfo[]=[];
  let friendsLoading=false;
  let picker:HTMLElement|null=null;
  let invitePrompt:HTMLElement|null=null;
  let shownInviteId='';
  let pollBusy=false;

  const esc=(value:unknown)=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]||c));

  const toast=(message:string)=>{
    document.querySelector('.casualSocialToast')?.remove();
    const el=document.createElement('div');
    el.className='casualSocialToast';
    el.textContent=message;
    document.body.appendChild(el);
    window.setTimeout(()=>el.remove(),2600);
  };

  const closePicker=()=>{picker?.remove();picker=null};
  const closeInvitePrompt=()=>{invitePrompt?.remove();invitePrompt=null};

  const loadSession=async()=>{
    const {data}=await db.auth.getUser();
    uid=data?.user?.id||'';
  };

  const loadFriends=async()=>{
    if(friendsLoading)return;
    friendsLoading=true;
    try{
      if(!uid)await loadSession();
      if(!uid)return;
      const {data,error}=await db.from('friendships')
        .select('requester_id,addressee_id,status,requester:profiles!friendships_requester_id_fkey(username),addressee:profiles!friendships_addressee_id_fkey(username)')
        .eq('status','accepted')
        .or(`requester_id.eq.${uid},addressee_id.eq.${uid}`);
      if(error)return;
      friends=(data||[]).map((row:any)=>{
        const mineRequester=row.requester_id===uid;
        const profile=mineRequester?row.addressee:row.requester;
        return{id:String(mineRequester?row.addressee_id:row.requester_id),username:String(profile?.username||'Player')};
      });
    }finally{friendsLoading=false}
  };

  const ytId=(url:string|null)=>{
    if(!url)return'';
    const m=url.match(/[?&]v=([^&]+)/)||url.match(/youtu\.be\/([^?]+)/)||url.match(/\/shorts\/([^?]+)/);
    return m?.[1]||'';
  };

  const closeFriendsModal=()=>{
    const list=document.querySelector('.friendList');
    const modal=list?.closest('.resultBackdrop');
    const close=Array.from(modal?.querySelectorAll('button')||[]).find((b:any)=>b.textContent?.trim()==='CLOSE') as HTMLButtonElement|undefined;
    close?.click();
  };

  const loadChart=async(chartId:string)=>{
    const {data:chart}=await db.from('charts').select('id,title,artist').eq('id',chartId).maybeSingle();
    if(!chart)return;
    closeFriendsModal();
    const community=Array.from(document.querySelectorAll('button')).find((b:any)=>b.textContent?.trim()==='COMMUNITY') as HTMLButtonElement|undefined;
    community?.click();
    let tries=0;
    const timer=window.setInterval(()=>{
      tries++;
      const title=String(chart.title||'').trim().toLowerCase();
      const artist=String(chart.artist||'').trim().toLowerCase();
      const cards=Array.from(document.querySelectorAll('.communityTile')) as HTMLElement[];
      const target=cards.find(card=>{
        const t=(card.querySelector('.tileInfo strong')?.textContent||'').trim().toLowerCase();
        const a=(card.querySelector('.tileInfo span')?.textContent||'').trim().toLowerCase();
        return t===title&&(!artist||a===artist);
      });
      if(target){window.clearInterval(timer);target.click();toast(`Loaded ${chart.title}`)}
      else if(tries>45){window.clearInterval(timer);toast('Could not load that song.')}
    },140);
  };

  const sendInvite=async(friend:FriendInfo,chart:ChartInfo)=>{
    if(!uid)await loadSession();
    if(!uid)return;
    const {error}=await db.from('casual_invites').insert({inviter_id:uid,invitee_id:friend.id,chart_id:chart.id});
    if(error){toast(error.message.includes('casual_invites')?'Run casual_invites.sql in Supabase first.':error.message);return}
    closePicker();
    toast(`Invite sent to ${friend.username}`);
    void loadChart(chart.id);
  };

  const openSongPicker=async(friend:FriendInfo)=>{
    closePicker();
    const {data,error}=await db.from('charts').select('id,title,artist,youtube_url,play_count').order('play_count',{ascending:false}).limit(120);
    if(error){toast('Could not load songs.');return}
    const charts=(data||[]) as ChartInfo[];
    const overlay=document.createElement('div');
    overlay.className='casualPickerBackdrop';
    overlay.innerHTML=`<div class="casualPickerCard"><div class="casualPickerTop"><div><small>CASUAL INVITE</small><h2>Play a song with ${esc(friend.username)}</h2><p>Pick a Community song. This does not affect Ranked or MMR.</p></div><button class="casualPickerClose">×</button></div><input class="casualSongSearch" placeholder="Search songs or artists…"><div class="casualSongList"></div></div>`;
    document.body.appendChild(overlay);picker=overlay;
    const list=overlay.querySelector('.casualSongList') as HTMLElement;
    const input=overlay.querySelector('.casualSongSearch') as HTMLInputElement;
    const render=()=>{
      const q=input.value.trim().toLowerCase();
      const visible=charts.filter(c=>!q||c.title.toLowerCase().includes(q)||(c.artist||'').toLowerCase().includes(q)).slice(0,30);
      list.innerHTML=visible.map(c=>{const y=ytId(c.youtube_url);return `<button class="casualSong" data-id="${esc(c.id)}">${y?`<img src="https://i.ytimg.com/vi/${esc(y)}/mqdefault.jpg" alt="">`:'<span class="casualSongFallback">BF</span>'}<span><b>${esc(c.title)}</b><em>${esc(c.artist||'Unknown artist')}</em></span><strong>INVITE</strong></button>`}).join('')||'<div class="casualEmpty">No songs found.</div>';
      list.querySelectorAll('.casualSong').forEach(button=>button.addEventListener('click',()=>{const chart=charts.find(c=>c.id===(button as HTMLElement).dataset.id);if(chart)void sendInvite(friend,chart)}));
    };
    input.addEventListener('input',render);render();input.focus();
    (overlay.querySelector('.casualPickerClose') as HTMLButtonElement).onclick=closePicker;
    overlay.addEventListener('click',e=>{if(e.target===overlay)closePicker()});
  };

  const enhanceFriendRows=async()=>{
    const rows=Array.from(document.querySelectorAll('.friendList .friendRow')) as HTMLElement[];
    if(!rows.length)return;
    if(!friends.length)await loadFriends();
    rows.forEach(row=>{
      if(row.querySelector('.friendSocialActions'))return;
      const name=(row.querySelector('strong')?.textContent||'').trim();
      const friend=friends.find(f=>f.username===name);
      if(!friend)return;
      const actions=document.createElement('div');
      actions.className='friendSocialActions';
      actions.innerHTML='<button class="friendProfileBtn">PROFILE</button><button class="friendInviteBtn">INVITE</button>';
      (actions.querySelector('.friendProfileBtn') as HTMLButtonElement).onclick=()=>{window.location.href=`/profile?user=${encodeURIComponent(friend.id)}`};
      (actions.querySelector('.friendInviteBtn') as HTMLButtonElement).onclick=()=>void openSongPicker(friend);
      row.appendChild(actions);
      const nameEl=row.querySelector('strong') as HTMLElement|null;
      if(nameEl){nameEl.classList.add('friendProfileLink');nameEl.onclick=()=>{window.location.href=`/profile?user=${encodeURIComponent(friend.id)}`}}
    });
  };

  const pollInvites=async()=>{
    if(pollBusy)return;
    pollBusy=true;
    try{
      if(!uid)await loadSession();
      if(!uid||invitePrompt)return;
      const now=new Date().toISOString();
      const {data,error}=await db.from('casual_invites')
        .select('id,inviter_id,chart_id,created_at,inviter:profiles!casual_invites_inviter_id_fkey(username),chart:charts!casual_invites_chart_id_fkey(id,title,artist,youtube_url)')
        .eq('invitee_id',uid).eq('status','pending').gt('expires_at',now)
        .order('created_at',{ascending:false}).limit(1).maybeSingle();
      if(error||!data||data.id===shownInviteId)return;
      shownInviteId=String(data.id);
      const inviter=String(data.inviter?.username||'A friend');
      const chart=data.chart;
      const overlay=document.createElement('div');
      overlay.className='casualInvitePrompt';
      const y=ytId(chart?.youtube_url||null);
      overlay.innerHTML=`<div class="casualInviteCard"><small>CASUAL INVITE</small><h2>${esc(inviter)} wants to play</h2><div class="casualInviteSong">${y?`<img src="https://i.ytimg.com/vi/${esc(y)}/mqdefault.jpg" alt="">`:'<span>BF</span>'}<div><b>${esc(chart?.title||'Unknown song')}</b><em>${esc(chart?.artist||'Unknown artist')}</em></div></div><p>No MMR. Just play the same song together.</p><div><button class="casualAccept">ACCEPT</button><button class="casualDecline">DECLINE</button></div></div>`;
      document.body.appendChild(overlay);invitePrompt=overlay;
      (overlay.querySelector('.casualAccept') as HTMLButtonElement).onclick=async()=>{
        await db.from('casual_invites').update({status:'accepted',responded_at:new Date().toISOString()}).eq('id',data.id).eq('invitee_id',uid);
        closeInvitePrompt();
        if(chart?.id)void loadChart(String(chart.id));
      };
      (overlay.querySelector('.casualDecline') as HTMLButtonElement).onclick=async()=>{
        await db.from('casual_invites').update({status:'declined',responded_at:new Date().toISOString()}).eq('id',data.id).eq('invitee_id',uid);
        closeInvitePrompt();
      };
    }finally{pollBusy=false}
  };

  const addStyles=()=>{
    if(document.getElementById('casual-social-styles'))return;
    const style=document.createElement('style');style.id='casual-social-styles';style.textContent=`
      .friendRow{gap:10px!important}.friendRow>span{margin-left:auto}.friendProfileLink{cursor:pointer}.friendProfileLink:hover{text-decoration:underline;color:#bbaaff}.friendSocialActions{display:flex;gap:6px;margin-left:8px}.friendSocialActions button{padding:7px 9px!important;border-radius:8px!important;font-size:8px!important;font-weight:1000!important;letter-spacing:.4px!important}.friendProfileBtn{background:#171c26!important;border:1px solid #343b49!important;color:#d7dce6!important}.friendInviteBtn{background:#7558ff!important;border:1px solid #8b72ff!important;color:white!important}
      .casualPickerBackdrop,.casualInvitePrompt{position:fixed;inset:0;z-index:14050;background:#03050be8;backdrop-filter:blur(12px);display:grid;place-items:center;padding:20px}.casualPickerCard{width:min(680px,94vw);max-height:82vh;background:#10151f;border:1px solid #333b4b;border-radius:18px;padding:22px;display:flex;flex-direction:column}.casualPickerTop{display:flex;justify-content:space-between;gap:18px}.casualPickerTop small,.casualInviteCard>small{font-size:8px;font-weight:1000;letter-spacing:1.6px;color:#9c7cff}.casualPickerTop h2,.casualInviteCard h2{margin:5px 0;font-size:22px}.casualPickerTop p,.casualInviteCard p{margin:0;color:#8b95a8;font-size:10px}.casualPickerClose{width:34px;height:34px;border-radius:9px;background:#181e29;border:1px solid #343c4a;color:white;font-size:19px}.casualSongSearch{margin:16px 0 10px;background:#090e15;border:1px solid #303846;color:white;border-radius:10px;padding:11px 13px;outline:none}.casualSongList{display:grid;gap:7px;overflow:auto}.casualSong{display:grid;grid-template-columns:74px 1fr auto;align-items:center;gap:11px;text-align:left;background:#0a0f16;border:1px solid #252d39;border-radius:11px;padding:7px;color:white}.casualSong:hover{border-color:#6656a6}.casualSong img,.casualSongFallback{width:74px;height:44px;object-fit:cover;border-radius:7px;background:#171d27;display:grid;place-items:center;color:#9d88ff;font-weight:1000}.casualSong span b,.casualSong span em{display:block}.casualSong span b{font-size:11px}.casualSong span em{font-size:8px;color:#7f8999;font-style:normal;margin-top:3px}.casualSong>strong{font-size:8px;color:#ad9cff}.casualEmpty{padding:28px;text-align:center;color:#80899b}.casualInviteCard{width:min(440px,94vw);background:#10151f;border:1px solid #353d4d;border-radius:18px;padding:24px;text-align:center}.casualInviteSong{display:flex;align-items:center;gap:12px;text-align:left;margin:17px 0;padding:9px;background:#0a0f16;border:1px solid #29313e;border-radius:11px}.casualInviteSong img,.casualInviteSong>span{width:84px;height:50px;object-fit:cover;border-radius:7px;background:#171d27;display:grid;place-items:center;color:#9d88ff;font-weight:1000}.casualInviteSong b,.casualInviteSong em{display:block}.casualInviteSong b{font-size:12px}.casualInviteSong em{font-size:9px;color:#7f8999;font-style:normal;margin-top:4px}.casualInviteCard>div:last-child{display:flex;gap:8px;justify-content:center;margin-top:16px}.casualAccept,.casualDecline{padding:10px 14px;border-radius:9px;font-size:9px;font-weight:1000}.casualAccept{background:#7558ff;border:1px solid #8b72ff;color:white}.casualDecline{background:#171d27;border:1px solid #343c49;color:#ccd2dd}.casualSocialToast{position:fixed;right:22px;bottom:22px;z-index:15000;background:#111722;border:1px solid #363e4e;border-radius:11px;padding:12px 15px;color:white;font-size:10px;font-weight:900;box-shadow:0 12px 38px #0008}
    `;document.head.appendChild(style);
  };

  const scan=()=>void enhanceFriendRows();
  const start=()=>{
    addStyles();void loadSession();
    const observer=new MutationObserver(scan);observer.observe(document.body,{childList:true,subtree:true});scan();
    window.setInterval(()=>void pollInvites(),2200);
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
}
