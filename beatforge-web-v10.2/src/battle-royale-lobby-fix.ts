if (typeof window !== 'undefined' && window.location.pathname === '/') {
  let stableLobby: HTMLElement | null = null;

  const playerKey = (row: Element) => {
    const name = row.querySelector('b')?.textContent?.trim() || '';
    return name.toLowerCase();
  };

  const syncLobby = (incoming: HTMLElement) => {
    if (!stableLobby || !stableLobby.isConnected) {
      stableLobby = incoming;
      stableLobby.dataset.brStableLobby = '1';
      return;
    }
    if (incoming === stableLobby) return;

    const currentCount = stableLobby.querySelector('.brLobbyCount');
    const nextCount = incoming.querySelector('.brLobbyCount');
    if (currentCount && nextCount && currentCount.innerHTML !== nextCount.innerHTML) {
      currentCount.innerHTML = nextCount.innerHTML;
    }

    const currentBand = stableLobby.querySelector('.brSearchBand');
    const nextBand = incoming.querySelector('.brSearchBand');
    if (currentBand && nextBand && currentBand.innerHTML !== nextBand.innerHTML) {
      currentBand.innerHTML = nextBand.innerHTML;
    }

    const currentList = stableLobby.querySelector('.brLobbyPlayers') as HTMLElement | null;
    const nextList = incoming.querySelector('.brLobbyPlayers') as HTMLElement | null;
    if (currentList && nextList) {
      const existing = new Map<string, HTMLElement>();
      [...currentList.children].forEach(child => {
        const row = child as HTMLElement;
        existing.set(playerKey(row), row);
      });

      const keep = new Set<string>();
      [...nextList.children].forEach(child => {
        const nextRow = child as HTMLElement;
        const key = playerKey(nextRow);
        keep.add(key);
        let row = existing.get(key);
        if (!row) {
          row = nextRow.cloneNode(true) as HTMLElement;
        } else if (row.innerHTML !== nextRow.innerHTML || row.className !== nextRow.className) {
          row.innerHTML = nextRow.innerHTML;
          row.className = nextRow.className;
        }
        currentList.appendChild(row);
      });

      [...currentList.children].forEach(child => {
        const row = child as HTMLElement;
        if (!keep.has(playerKey(row))) row.remove();
      });
    }

    // battle-royale.ts redraws the whole lobby every 250 ms. Keep the first
    // lobby mounted and discard the replacement before the browser paints it.
    incoming.remove();
  };

  const processBackdrop = (backdrop: HTMLElement) => {
    if (backdrop.querySelector('.brLobbyPlayers')) {
      syncLobby(backdrop);
      return;
    }

    // A real mode transition (loading song, difficulty, results, etc.) should
    // replace the lobby normally.
    if (stableLobby?.isConnected) stableLobby.remove();
    stableLobby = null;
  };

  const install = () => {
    if (document.getElementById('battle-royale-lobby-stability')) return;

    const style = document.createElement('style');
    style.id = 'battle-royale-lobby-stability';
    style.textContent = `
      .brBackdrop .brLobbyPlayers span {
        opacity: 1 !important;
        transform: none !important;
      }
      .brBackdrop[data-br-stable-lobby="1"] .brLobbyPlayers span {
        animation: none !important;
      }
    `;
    document.head.appendChild(style);

    const observer = new MutationObserver(records => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (!(node instanceof HTMLElement)) continue;
          if (node.matches('.brBackdrop')) processBackdrop(node);
          node.querySelectorAll?.('.brBackdrop').forEach(el => processBackdrop(el as HTMLElement));
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // If CANCEL/X is clicked on the preserved lobby, battle-royale.ts no
    // longer owns that exact DOM node after the first poll, so clean it up too.
    document.addEventListener('click', event => {
      const target = event.target as HTMLElement | null;
      if (!stableLobby || !target || !stableLobby.contains(target)) return;
      if (!target.closest('.brLeaveLobby,.brX')) return;
      window.setTimeout(() => {
        if (stableLobby?.isConnected) stableLobby.remove();
        stableLobby = null;
      }, 0);
    }, true);

    const initial = document.querySelector('.brBackdrop') as HTMLElement | null;
    if (initial?.querySelector('.brLobbyPlayers')) processBackdrop(initial);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install, { once: true });
  } else {
    install();
  }
}
