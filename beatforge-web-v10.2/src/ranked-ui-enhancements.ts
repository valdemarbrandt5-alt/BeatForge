import { supabase } from './lib/supabase';

if (typeof window !== 'undefined') {
  let autoLoadedFor = '';
  let checkingLeave = false;

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

  const autoLoadSelectedSong = () => {
    const card = [...document.querySelectorAll('.rankedBackdrop.realRanked .rankedCard')]
      .find(x => /SONG SELECTED/i.test(x.textContent || '')) as HTMLElement | undefined;
    if (!card) { autoLoadedFor = ''; return; }
    const load = card.querySelector('.rankedLoad') as HTMLButtonElement | null;
    if (!load || load.disabled) return;
    const key = card.textContent || 'selected';
    if (autoLoadedFor === key) return;
    autoLoadedFor = key;
    window.setTimeout(() => {
      if (load.isConnected && !load.disabled) load.click();
    }, 350);
  };

  const recoverCancelledLobby = async () => {
    if (!supabase || checkingLeave) return;
    const card = document.querySelector('.rankedBackdrop.realRanked .rankedCard') as HTMLElement | null;
    if (!card) return;
    const text = card.textContent || '';
    if (!/(MATCH FOUND|CHOOSE THE SONG|SONG SELECTED|CHOOSE YOUR DIFFICULTY|SONG LOADED|GET READY|READY)/i.test(text)) return;
    checkingLeave = true;
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) return;
      const { data: latest } = await supabase.from('ranked_matches')
        .select('id,status,created_at')
        .or(`player_1.eq.${uid},player_2.eq.${uid}`)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!latest || latest.status !== 'cancelled') return;
      const activeAge = Date.now() - new Date(latest.created_at).getTime();
      if (activeAge > 10 * 60 * 1000) return;
      const overlay = card.closest('.rankedBackdrop.realRanked') as HTMLElement | null;
      overlay?.remove();
      const rankedButton = [...document.querySelectorAll('button')]
        .find(b => /^RANKED$/i.test(b.textContent?.trim() || '')) as HTMLButtonElement | undefined;
      window.setTimeout(() => rankedButton?.click(), 80);
    } finally {
      checkingLeave = false;
    }
  };

  const addStyles = () => {
    if (document.getElementById('ranked-result-colors')) return;
    const style = document.createElement('style');
    style.id = 'ranked-result-colors';
    style.textContent = `
      .rankedPerformance [data-stat="perfect"] b{color:#ffd43b!important}
      .rankedPerformance [data-stat="great"] b{color:#4ee6a8!important}
      .rankedPerformance [data-stat="good"] b{color:#ffad42!important}
      .rankedPerformance [data-stat="miss"] b{color:#ff4d5e!important}
      .rankedPerformance [data-stat="accuracy"] b{color:#66d9ff!important}
      .rankedPerformance [data-stat="combo"] b{color:#b58cff!important}
      .rankedPerformance [data-stat="timing"] b{color:#75a7ff!important}
      .rankedCard.rankBronze .rankedMmrResult b{color:#cd7f32!important}
      .rankedCard.rankSilver .rankedMmrResult b{color:#c8ced8!important}
      .rankedCard.rankGold .rankedMmrResult b{color:#ffd43b!important}
      .rankedCard.rankPlatinum .rankedMmrResult b{color:#57e0d1!important}
      .rankedCard.rankDiamond .rankedMmrResult b{color:#6aa9ff!important}
      .rankedCard.rankMaster .rankedMmrResult b{color:#c084fc!important}
      .rankedCard.rankBronze{--rankAccent:#cd7f32}.rankedCard.rankSilver{--rankAccent:#c8ced8}
      .rankedCard.rankGold{--rankAccent:#ffd43b}.rankedCard.rankPlatinum{--rankAccent:#57e0d1}
      .rankedCard.rankDiamond{--rankAccent:#6aa9ff}.rankedCard.rankMaster{--rankAccent:#c084fc}
      .rankedCard[class*="rank"] .rankedMmrResult{border-color:color-mix(in srgb,var(--rankAccent) 38%,#303646)!important}
    `;
    document.head.appendChild(style);
  };

  const scan = () => {
    addStyles();
    decorateResult();
    autoLoadSelectedSong();
  };

  const start = () => {
    scan();
    new MutationObserver(scan).observe(document.body, { childList: true, subtree: true, characterData: true });
    window.setInterval(() => void recoverCancelledLobby(), 500);
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
}
