import { supabase } from './lib/supabase';

if (typeof window !== 'undefined') {
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
    if (!supabase) return;
    const { data } = await supabase.auth.getSession();
    activeUid = data.session?.user.id || activeUid;
    accessToken = data.session?.access_token || accessToken;
  };

  const findPlayingMatch = async () => {
    if (!supabase) return null;
    await cacheSession();
    if (!activeUid) return null;
    const { data } = await supabase.from('ranked_matches')
      .select('id,status,forfeit_by')
      .or(`player_1.eq.${activeUid},player_2.eq.${activeUid}`)
      .eq('status','playing')
      .order('created_at',{ascending:false})
      .limit(1)
      .maybeSingle();
    if (data?.id) {
      if (activeMatchId !== data.id) {
        forfeitBy = null;
        unloadSent = false;
      }
      activeMatchId = data.id;
    }
    return data;
  };

  const inRankedPlayContext = () => {
    if (document.querySelector('.realRankedLiveHud')) return true;
    return [...document.querySelectorAll('.rankedBackdrop.realRanked .rankedCard')]
      .some(card => /GET READY/i.test(card.textContent || ''));
  };

  const heartbeat = async () => {
    if (!supabase || heartbeatBusy || !inRankedPlayContext()) return;
    heartbeatBusy = true;
    try {
      if (!activeMatchId) await findPlayingMatch();
      if (!activeMatchId) return;
      await cacheSession();
      const { data, error } = await supabase.rpc('ranked_match_heartbeat',{p_match:activeMatchId});
      if (error) {
        if (!/does not exist/i.test(error.message || '')) console.error('ranked heartbeat',error);
        return;
      }
      const row = Array.isArray(data) ? data[0] : data;
      if (row?.forfeited_by) forfeitBy = String(row.forfeited_by);
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
    if (!supabase || promptEl || !document.querySelector('.realRankedLiveHud')) return;
    if (!activeMatchId) await findPlayingMatch();
    if (!activeMatchId) return;

    const host = document.fullscreenElement?.classList?.contains('beatforgeFullscreenShell')
      ? document.fullscreenElement
      : document.body;
    const o = document.createElement('div');
    o.className = 'rankedBackdrop realRanked rankedForfeitPrompt';
    o.innerHTML = '<div class="rankedCard"><small>RANKED DUEL</small><h2>LEAVE MATCH?</h2><p class="forfeitWarning">Leaving counts as a loss and costs <b>20 MMR</b>. The match keeps running while this prompt is open.</p><button class="rankedPrimary confirmForfeit">LEAVE MATCH</button><button class="rankedSecondary cancelForfeit">CANCEL</button></div>';
    host.appendChild(o);
    promptEl = o;

    (o.querySelector('.cancelForfeit') as HTMLButtonElement).onclick = closePrompt;
    (o.querySelector('.confirmForfeit') as HTMLButtonElement).onclick = async () => {
      const button = o.querySelector('.confirmForfeit') as HTMLButtonElement;
      button.disabled = true;
      button.textContent = 'LEAVING…';
      const id = activeMatchId;
      if (!id) { closePrompt(); return; }
      const { data, error } = await supabase.rpc('forfeit_ranked_match',{p_match:id});
      if (error) {
        console.error('ranked forfeit',error);
        button.disabled = false;
        button.textContent = 'LEAVE MATCH';
        return;
      }
      const row = Array.isArray(data) ? data[0] : data;
      if (row?.forfeited_by) forfeitBy = String(row.forfeited_by);
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
    const card = [...document.querySelectorAll('.rankedBackdrop.realRanked .rankedCard')]
      .find(x => /RANKED DUEL COMPLETE/i.test(x.textContent || '')) as HTMLElement | undefined;
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
    style.textContent = `
      .rankedForfeitPrompt .forfeitWarning{max-width:430px;margin:10px auto 16px;color:#aab2c2;line-height:1.5}.rankedForfeitPrompt .forfeitWarning b{color:#ff6275}.rankedForfeitPrompt .confirmForfeit{background:#ff4d61!important;border-color:#ff4d61!important}.rankedForfeitPrompt .confirmForfeit:hover{filter:brightness(1.08)}
      .forfeitResultNote{margin:-2px 0 10px;font-size:9px;font-weight:1000;letter-spacing:1.5px;color:#9ca5b7}
    `;
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
    if (!inRankedPlayContext()) {
      promptEl?.remove();
      promptEl = null;
    }
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
