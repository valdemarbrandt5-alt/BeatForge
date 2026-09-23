import { supabase } from './lib/supabase';

if (typeof window !== 'undefined' && supabase) {
  const db: any = supabase;
  let activeMatchId: string | null = null;
  let activeUid: string | null = null;
  let accessToken = '';
  let heartbeatBusy = false;
  let promptEl: HTMLElement | null = null;
  let forfeitBy: string | null = null;
  let unloadSent = false;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

  const cacheSession = async () => {
    const result = await db.auth.getSession();
    const session = result?.data?.session;
    activeUid = session?.user?.id || activeUid;
    accessToken = session?.access_token || accessToken;
  };

  const stopCurrentGameplay = () => {
    const reset = Array.from(document.querySelectorAll('.controls button'))
      .find(button => button.textContent?.trim() === 'RESET') as HTMLButtonElement | undefined;
    reset?.click();
  };

  const findPlayingMatch = async () => {
    await cacheSession();
    if (!activeUid) return null;
    const result = await db.from('ranked_matches')
      .select('id,status,forfeit_by')
      .or(`player_1.eq.${activeUid},player_2.eq.${activeUid}`)
      .eq('status','playing')
      .order('created_at',{ascending:false})
      .limit(1)
      .maybeSingle();
    const data = result?.data;
    if (data?.id) {
      if (activeMatchId !== data.id) {
        forfeitBy = null;
        unloadSent = false;
      }
      activeMatchId = String(data.id);
    }
    return data || null;
  };

  const inRankedPlayContext = () => {
    if (document.querySelector('.realRankedLiveHud')) return true;
    const cards = Array.from(document.querySelectorAll('.rankedBackdrop.realRanked .rankedCard'));
    return cards.some(card => /GET READY/i.test(card.textContent || ''));
  };

  const heartbeat = async () => {
    if (heartbeatBusy || !inRankedPlayContext()) return;
    heartbeatBusy = true;
    try {
      if (!activeMatchId) await findPlayingMatch();
      if (!activeMatchId) return;
      await cacheSession();
      const result = await db.rpc('ranked_match_heartbeat',{p_match:activeMatchId});
      if (result?.error) {
        if (!/does not exist/i.test(result.error.message || '')) console.error('ranked heartbeat',result.error);
        return;
      }
      const row = Array.isArray(result?.data) ? result.data[0] : result?.data;
      if (row?.forfeited_by) {
        forfeitBy = String(row.forfeited_by);
        if (row?.match_status === 'finished') stopCurrentGameplay();
      }
      if (row?.match_status === 'finished') activeMatchId = null;
    } finally {
      heartbeatBusy = false;
    }
  };

  const closePrompt = () => {
    promptEl?.remove();
    promptEl = null;
  };

  const openForfeitPrompt = async () => {
    if (promptEl || !document.querySelector('.realRankedLiveHud')) return;
    if (!activeMatchId) await findPlayingMatch();
    if (!activeMatchId) return;

    const fullscreenHost = document.fullscreenElement;
    const host: Element = fullscreenHost?.classList.contains('beatforgeFullscreenShell') ? fullscreenHost : document.body;
    const overlay = document.createElement('div');
    overlay.className = 'rankedBackdrop realRanked rankedForfeitPrompt';
    overlay.innerHTML = '<div class="rankedCard"><small>RANKED DUEL</small><h2>LEAVE MATCH?</h2><p class="forfeitWarning">Leaving counts as a loss and costs <b>20 MMR</b>. The match keeps running while this prompt is open.</p><button class="rankedPrimary confirmForfeit">LEAVE MATCH</button><button class="rankedSecondary cancelForfeit">CANCEL</button></div>';
    host.appendChild(overlay);
    promptEl = overlay;

    const cancel = overlay.querySelector('.cancelForfeit') as HTMLButtonElement | null;
    const confirm = overlay.querySelector('.confirmForfeit') as HTMLButtonElement | null;
    if (cancel) cancel.onclick = closePrompt;
    if (confirm) confirm.onclick = async () => {
      confirm.disabled = true;
      confirm.textContent = 'LEAVING…';
      const id = activeMatchId;
      if (!id) { closePrompt(); return; }
      const result = await db.rpc('forfeit_ranked_match',{p_match:id});
      if (result?.error) {
        console.error('ranked forfeit',result.error);
        confirm.disabled = false;
        confirm.textContent = 'LEAVE MATCH';
        return;
      }
      const row = Array.isArray(result?.data) ? result.data[0] : result?.data;
      if (row?.forfeited_by) forfeitBy = String(row.forfeited_by);
      stopCurrentGameplay();
      activeMatchId = null;
      closePrompt();
    };
  };

  const sendUnloadForfeit = () => {
    if (unloadSent || !activeMatchId || !accessToken || !supabaseUrl || !anonKey) return;
    unloadSent = true;
    void fetch(`${supabaseUrl}/rest/v1/rpc/forfeit_ranked_match`,{
      method:'POST',
      keepalive:true,
      headers:{
        apikey:anonKey,
        Authorization:`Bearer ${accessToken}`,
        'Content-Type':'application/json',
        Prefer:'return=minimal'
      },
      body:JSON.stringify({p_match:activeMatchId})
    }).catch(()=>{});
  };

  const decorateForfeitResult = () => {
    if (!forfeitBy || !activeUid) return;
    const cards = Array.from(document.querySelectorAll('.rankedBackdrop.realRanked .rankedCard'));
    const card = cards.find(x => /RANKED DUEL COMPLETE/i.test(x.textContent || '')) as HTMLElement | undefined;
    if (!card) return;
    const verdict = card.querySelector('.rankedVerdict') as HTMLElement | null;
    if (!verdict) return;
    const iQuit = forfeitBy === activeUid;
    verdict.textContent = iQuit ? 'DEFEAT' : 'VICTORY';
    verdict.classList.remove('win','loss','draw');
    verdict.classList.add(iQuit ? 'loss' : 'win');
    if (!card.querySelector('.forfeitResultNote')) {
      verdict.insertAdjacentHTML('afterend',`<div class="forfeitResultNote">${iQuit ? 'YOU LEFT THE MATCH' : 'OPPONENT LEFT THE MATCH'}</div>`);
    }
  };

  const addStyles = () => {
    if (document.getElementById('ranked-forfeit-style')) return;
    const style = document.createElement('style');
    style.id = 'ranked-forfeit-style';
    style.textContent = '.rankedForfeitPrompt .forfeitWarning{max-width:430px;margin:10px auto 16px;color:#aab2c2;line-height:1.5}.rankedForfeitPrompt .forfeitWarning b{color:#ff6275}.rankedForfeitPrompt .confirmForfeit{background:#ff4d61!important;border-color:#ff4d61!important}.rankedForfeitPrompt .confirmForfeit:hover{filter:brightness(1.08)}.forfeitResultNote{margin:-2px 0 10px;font-size:9px;font-weight:1000;letter-spacing:1.5px;color:#9ca5b7}';
    document.head.appendChild(style);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || !document.querySelector('.realRankedLiveHud')) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    if (promptEl) closePrompt(); else void openForfeitPrompt();
  };

  const scan = () => {
    decorateForfeitResult();
    if (!inRankedPlayContext()) closePrompt();
  };

  const start = () => {
    addStyles();
    void cacheSession();
    const observer = new MutationObserver(scan);
    observer.observe(document.body,{childList:true,subtree:true,characterData:true});
    document.addEventListener('keydown',onKeyDown,true);
    window.addEventListener('pagehide',sendUnloadForfeit);
    window.addEventListener('beforeunload',sendUnloadForfeit);
    window.setInterval(()=>void heartbeat(),1000);
    scan();
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
}
