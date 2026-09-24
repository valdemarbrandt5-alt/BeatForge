if (typeof window !== 'undefined') {
  let cleaning = false;

  const inBotRankedContext = () =>
    !!document.querySelector('.rankedBotBackdrop,.rankedBotLeavePrompt,.botRankedLiveHud');

  const removeResurrectedHumanOverlay = () => {
    if (cleaning || !inBotRankedContext()) return;
    cleaning = true;
    try {
      document.querySelectorAll('.rankedBackdrop.realRanked').forEach(node => node.remove());
    } finally {
      cleaning = false;
    }
  };

  const afterFullscreenChange = () => {
    // The human Ranked component still holds a ref to its old queue modal.
    // On fullscreenchange it can otherwise re-append that detached FIND MATCH modal.
    window.setTimeout(removeResurrectedHumanOverlay, 0);
    window.setTimeout(removeResurrectedHumanOverlay, 80);
  };

  const start = () => {
    document.addEventListener('fullscreenchange', afterFullscreenChange);
    new MutationObserver(removeResurrectedHumanOverlay)
      .observe(document.body, { childList: true, subtree: true });
    removeResurrectedHumanOverlay();
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
}
