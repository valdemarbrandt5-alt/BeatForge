import { supabase } from './lib/supabase';

if (typeof window !== 'undefined') {
  let loadingCard: HTMLElement | null = null;
  let checkingLeave = false;
  let sendingLeave = false;

  const rankClass = (text: string) => {
    const t = text.toUpperCase();
    if (t.includes('MASTER')) return 'rankMaster';
    if (t.includes('DIAMOND')) return 'rankDiamond';
    if (t.includes('PLATINUM')) return 'rankPlatinum';
    if (t.includes('GOLD')) return 'rankGold';
    if (t.includes('SILVER')) return 'rankSilver';
    if (t.includes('BRONZE')) return 'rankBronze';
    return '';
  };

  const decorateRanks = () => {
    document.querySelectorAll('.rankedBackdrop.realRanked .matchPlayers span').forEach(player => {
      const rankEl = player.querySelector('em') as HTMLElement | null;
      if (!rankEl) return;
      const cls = rankClass(rankEl.textContent || '');
      if (cls) rankEl.classList.add(cls);
    });
  };

  const decorateResult = () => {
    document.querySelectorAll('.rankedBackdrop.realRanked .rankedCard').forEach(node => {
      const card = node as HTMLElement;
      if (!/RANKED DUEL COMPLETE/i.test(card.textContent || '')) return;
      const mmr = card.querySelector('.rankedMmrResult');
      const cls = rankClass(mmr?.textContent || '');
      if (cls) card.classList.add(cls);
      card.querySelectorAll('.rankedPerformance > div').forEach((el, i) => {
        (el as HTMLElement).dataset.stat = ['perfect','great','good','miss','accuracy','combo','timing'][i] || '';
      });
    });
  };

  const decorateLiveHud = () => {
    const hud = document.querySelector('.realRankedLiveHud') as HTMLElement | null;
    const game = document.querySelector('.game') as HTMLElement | null;
    if (!hud || !game) return;
    if (hud.parentElement !== game) game.appendChild(hud);
    hud.classList.add('rankedScoreboard');
    const players = [...hud.querySelectorAll('span')].filter(el => el.querySelector('.rrMe,.rrOpp')) as HTMLElement[];
    if (players.length < 2) return;
    const scoreOf = (p: HTMLElement) => Number((p.querySelector('.rrMe,.rrOpp')?.textContent || '0').replace(/[^0-9-]/g,'')) || 0;
    [...players].sort((a,b) => scoreOf(b)-scoreOf(a)).forEach((player,i) => { player.style.order=String(i); player.dataset.place=String(i+1); });
  };

  const autoLoadSelectedSong = () => {
    const card = [...document.querySelectorAll('.rankedBackdrop.realRanked .rankedCard')].find(x => /SONG SELECTED/i.test(x.textContent || '')) as HTMLElement | undefined;
    if (!card) { loadingCard = null; return; }
    const overlay = card.closest('.rankedBackdrop.realRanked') as HTMLElement | null;
    if (overlay) overlay.style.visibility = 'hidden';
    const load = card.querySelector('.rankedLoad') as HTMLButtonElement | null;
    if (!load || load.disabled || loadingCard === card) return;
    loadingCard=card; load.click();
  };

  const leaveCurrentLobby = async () => {
    if (!supabase || sendingLeave) return; sendingLeave=true;
    try {
      const {data:auth}=await supabase.auth.getUser(); const uid=auth.user?.id; if(!uid)return;
      const {data:match,error:findError}=await supabase.from('ranked_matches').select('id,status').or(`player_1.eq.${uid},player_2.eq.${uid}`).in('status',['voting','ready']).order('created_at',{ascending:false}).limit(1).maybeSingle();
      if(findError){console.error('ranked leave lookup',findError);return;} if(!match?.id)return;
      const {error}=await supabase.rpc('leave_ranked_match',{p_match:match.id}); if(error)console.error('ranked leave rpc',error);
    } finally { sendingLeave=false; }
  };

  const recoverCancelledLobby = async () => {
    if(!supabase||checkingLeave)return;
    const card=document.querySelector('.rankedBackdrop.realRanked .rankedCard') as HTMLElement|null; if(!card)return;
    if(!/(MATCH FOUND|CHOOSE THE SONG|SONG SELECTED|CHOOSE YOUR DIFFICULTY|SONG LOADED|GET READY|READY)/i.test(card.textContent||''))return;
    checkingLeave=true;
    try {
      const {data:auth}=await supabase.auth.getUser(); const uid=auth.user?.id;if(!uid)return;
      const {data:latest}=await supabase.from('ranked_matches').select('id,status,created_at').or(`player_1.eq.${uid},player_2.eq.${uid}`).order('created_at',{ascending:false}).limit(1).maybeSingle();
      if(!latest||latest.status!=='cancelled'||Date.now()-new Date(latest.created_at).getTime()>600000)return;
      card.closest('.rankedBackdrop.realRanked')?.remove();
      const rankedButton=[...document.querySelectorAll('button')].find(b=>/^RANKED$/i.test(b.textContent?.trim()||'')) as HTMLButtonElement|undefined;
      window.setTimeout(()=>rankedButton?.click(),80);
    } finally { checkingLeave=false; }
  };

  const addStyles=()=>{
    if(document.getElementById('ranked-result-colors'))return;
    const style=document.createElement('style');style.id='ranked-result-colors';style.textContent=`
      .rankedPerformance [data-stat="perfect"] b{color:#ffd43b!important}.rankedPerformance [data-stat="great"] b{color:#4ee6a8!important}.rankedPerformance [data-stat="good"] b{color:#ffad42!important}.rankedPerformance [data-stat="miss"] b{color:#ff4d5e!important}.rankedPerformance [data-stat="accuracy"] b{color:#66d9ff!important}.rankedPerformance [data-stat="combo"] b{color:#b58cff!important}.rankedPerformance [data-stat="timing"] b{color:#75a7ff!important}
      .matchPlayers .rankBronze{color:#cd7f32!important}.matchPlayers .rankSilver{color:#c8ced8!important}.matchPlayers .rankGold{color:#ffd43b!important}.matchPlayers .rankPlatinum{color:#57e0d1!important}.matchPlayers .rankDiamond{color:#6aa9ff!important}.matchPlayers .rankMaster{color:#c084fc!important}
      .rankedCard.rankBronze{--rankAccent:#cd7f32}.rankedCard.rankSilver{--rankAccent:#c8ced8}.rankedCard.rankGold{--rankAccent:#ffd43b}.rankedCard.rankPlatinum{--rankAccent:#57e0d1}.rankedCard.rankDiamond{--rankAccent:#6aa9ff}.rankedCard.rankMaster{--rankAccent:#c084fc}.rankedCard[class*="rank"] .rankedMmrResult b{color:var(--rankAccent)!important}.rankedCard[class*="rank"] .rankedMmrResult{border-color:color-mix(in srgb,var(--rankAccent) 38%,#303646)!important}
      .game>.realRankedLiveHud.rankedScoreboard{position:absolute!important;left:18px!important;bottom:300px!important;top:auto!important;right:auto!important;width:168px!important;max-width:168px!important;height:auto!important;z-index:12!important;margin:0!important;padding:6px!important;background:#0b0e16ee!important;border:1px solid #303747!important;border-radius:11px!important;backdrop-filter:blur(6px);box-shadow:0 8px 22px #0005;pointer-events:none;overflow:hidden!important;transform:none!important}
      .game>.realRankedLiveHud.rankedScoreboard>small{display:none!important}.game>.realRankedLiveHud.rankedScoreboard>div{display:flex!important;flex-direction:column!important;gap:4px!important;width:100%!important;min-width:0!important}.game>.realRankedLiveHud.rankedScoreboard i{display:none!important}
      .game>.realRankedLiveHud.rankedScoreboard span:has(.rrMe,.rrOpp){position:relative!important;display:grid!important;grid-template-columns:minmax(0,1fr) auto!important;grid-template-rows:auto auto!important;align-items:center!important;width:100%!important;min-width:0!important;margin:0!important;padding:6px 7px 6px 25px!important;border-radius:8px!important;background:#151a24!important;border:1px solid #252c39!important;text-align:left!important;transform:none!important}.game>.realRankedLiveHud.rankedScoreboard span:has(.rrMe,.rrOpp):before{content:'#' attr(data-place);position:absolute;left:6px;top:50%;transform:translateY(-50%);font-size:10px;font-weight:1000;color:#8e95a5}.game>.realRankedLiveHud.rankedScoreboard span[data-place='1']{border-color:#ffd43b55!important}.game>.realRankedLiveHud.rankedScoreboard span[data-place='1']:before{color:#ffd43b}
      .game>.realRankedLiveHud.rankedScoreboard span:has(.rrMe,.rrOpp)>b{grid-column:1;grid-row:1;font-size:9px!important;line-height:1.1!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important;min-width:0!important}.game>.realRankedLiveHud.rankedScoreboard span:has(.rrMe,.rrOpp)>em{grid-column:1;grid-row:2;font-size:7px!important;line-height:1.1!important;color:#788195!important;font-style:normal!important;white-space:nowrap!important}.game>.realRankedLiveHud.rankedScoreboard .rrMe,.game>.realRankedLiveHud.rankedScoreboard .rrOpp{grid-column:2!important;grid-row:1 / span 2!important;font-size:14px!important;line-height:1!important;font-variant-numeric:tabular-nums;margin-left:6px!important;white-space:nowrap!important}.game>.realRankedLiveHud.rankedScoreboard .rrLiveExtra{display:none!important}
      @media(max-width:760px){.game>.realRankedLiveHud.rankedScoreboard{left:8px!important;bottom:286px!important;width:150px!important;max-width:150px!important}}
    `;document.head.appendChild(style);
  };

  const scan=()=>{addStyles();decorateRanks();decorateResult();decorateLiveHud();autoLoadSelectedSong();};
  const start=()=>{scan();new MutationObserver(scan).observe(document.body,{childList:true,subtree:true,characterData:true});document.addEventListener('click',event=>{const target=event.target as HTMLElement|null;if(target?.closest('.realRanked .syncLeave,.realRanked .rankedLeave,.realRanked .cancelRealMatch'))void leaveCurrentLobby();},true);window.setInterval(()=>void recoverCancelledLobby(),500);};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
}
