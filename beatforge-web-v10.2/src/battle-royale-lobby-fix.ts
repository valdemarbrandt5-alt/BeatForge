if (typeof window !== 'undefined' && window.location.pathname === '/') {
  const install = () => {
    if (document.getElementById('battle-royale-lobby-stability')) return;
    const style = document.createElement('style');
    style.id = 'battle-royale-lobby-stability';
    style.textContent = `
      /* The lobby is refreshed several times per second. The old entrance
         animation restarted on every refresh, so the player rows spent most
         of their time fading in and looked like they were disappearing. */
      .brBackdrop .brLobbyPlayers span {
        animation: none !important;
        opacity: 1 !important;
        transform: none !important;
      }
    `;
    document.head.appendChild(style);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install, { once: true });
  } else {
    install();
  }
}
