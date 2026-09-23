import { supabase } from './lib/supabase';

// Runs before React hydration. Keep BeatForge's fullscreen helper from physically
// re-parenting React-owned result modals; doing that breaks React reconciliation
// and was the source of the fullscreen crash at SONG COMPLETE.
if (typeof window !== 'undefined') {
  const nativeAppendChild = Node.prototype.appendChild;
  Node.prototype.appendChild = function<T extends Node>(child: T): T {
    const target = this as Node & { classList?: DOMTokenList };
    const el = child as Node & { classList?: DOMTokenList };
    if (
      target.classList?.contains('beatforgeFullscreenShell') &&
      el.classList?.contains('resultBackdrop') &&
      !el.classList?.contains('rankedBackdrop')
    ) {
      // Leave the React result where React rendered it, then leave fullscreen.
      // Once fullscreen closes the normal result/ranked flow can render safely.
      if (document.fullscreenElement) {
        void document.exitFullscreen().catch(() => {});
      }
      return child;
    }
    return nativeAppendChild.call(this, child) as T;
  };

  const handled = new WeakSet<Element>();
  let reporting = false;

  const numberFrom = (value: string | null | undefined) => {
    const n = Number(String(value || '0').replace(/[^0-9-]/g, ''));
    return Number.isFinite(n) ? n : 0;
  };

  const reportRankedFinish = async (result: Element) => {
    if (!supabase || reporting || handled.has(result)) return;
    handled.add(result);
    reporting = true;
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) return;

      // Only touch the newest genuinely active ranked match for this account.
      const { data: match } = await supabase
        .from('ranked_matches')
        .select('id,status,player_1,player_2')
        .or(`player_1.eq.${uid},player_2.eq.${uid}`)
        .eq('status', 'playing')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!match) return;

      const modalScore = numberFrom(result.querySelector('.finalScore')?.textContent);
      const hudScore = numberFrom(document.querySelector('.hudScore b')?.textContent);
      const score = Math.max(modalScore, hudScore);

      const { error } = await supabase.rpc('update_ranked_score', {
        p_match: match.id,
        p_score: score,
        p_finished: true,
      });
      if (error) console.error('ranked finish bridge', error);
    } finally {
      reporting = false;
    }
  };

  const scan = () => {
    document.querySelectorAll('.resultBackdrop').forEach((result) => {
      if (/SONG COMPLETE/i.test(result.textContent || '')) {
        void reportRankedFinish(result);
      }
    });
  };

  const start = () => {
    const root = document.body;
    if (!root) return;
    new MutationObserver(scan).observe(root, { childList: true, subtree: true });
    scan();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
}
