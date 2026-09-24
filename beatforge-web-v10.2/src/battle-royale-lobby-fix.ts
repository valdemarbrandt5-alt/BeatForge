if (typeof window !== 'undefined' && window.location.pathname === '/') {
  let stableLobby: HTMLElement | null = null;
  const nativeRemove = HTMLElement.prototype.remove;

  const playerKey = (row: Element) => {
    const name = row.querySelector('b')?.textContent?.trim() || '';
    return name.toLowerCase();
  };

  const hardRemove = (node: HTMLElement | null) => {
    if (!node) return;
    try { nativeRemove.call(node); } catch { node.parentElement?.removeChild(node); }
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

      const ordered: HTMLElement[] = [];
      [...nextList.children].forEach(child => {
        const nextRow = child as HTMLElement;
        const key = playerKey(nextRow);
        let row = existing.get(key);
        if (!row) {
          row = nextRow.cloneNode(true) as HTMLElement;
        } else if (row.innerHTML !== nextRow.innerHTML || row.className !== nextRow.className) {
          row.innerHTML = nextRow.innerHTML;
          row.className = nextRow.className;
        }
        ordered.push(row);
      });

      // Only touch the list when its actual player set/order changed. This keeps
      // every existing row mounted through the 250 ms polling loop.
      const currentOrder = [...currentList.children].map(playerKey).join('|');
      const nextOrder = ordered.map(playerKey).join('|');
      if (currentOrder !== nextOrder) {
        currentList.replaceChildren(...ordered);
      }
    }

    // battle-royale.ts creates a replacement backdrop every poll. Copy its new
    // data into the original lobby and discard the replacement before paint.
    hardRemove(incoming);
  };

  const processBackdrop = (backdrop: HTMLElement) => {
    if (backdrop.querySelector('.brLobbyPlayers')) {
      syncLobby(backdrop);
      return;
    }

    // A genuine transition (loading, difficulty, results, etc.) is allowed to
    // replace the preserved lobby.
    if (stableLobby?.isConnected) hardRemove(stableLobby);
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
        animation: none !important;
        transition: none !important;
      }
      .brBackdrop[data-br-stable-lobby="1"] .brLobbyPlayers {
        min-height: 0;
      }
    `;
    document.head.appendChild(style);

    // The BR core calls overlay.remove() before drawing the next polling frame.
    // Keep the one real lobby mounted. Its replacement is caught by the
    // observer below, used only as fresh data, then removed with nativeRemove.
    const patchedRemove = function(this: HTMLElement) {
      if (stableLobby === this && this.isConnected && this.querySelector('.brLobbyPlayers')) return;
      nativeRemove.call(this);
    };
    HTMLElement.prototype.remove = patchedRemove;

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

    document.addEventListener('click', event => {
      const target = event.target as HTMLElement | null;
      if (!stableLobby || !target || !stableLobby.contains(target)) return;
      if (!target.closest('.brLeaveLobby,.brX')) return;
      window.setTimeout(() => {
        if (stableLobby?.isConnected) hardRemove(stableLobby);
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
