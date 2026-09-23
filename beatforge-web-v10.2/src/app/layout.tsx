import type { Metadata } from 'next';
import Script from 'next/script';
import './globals.css';
import './streak-tuning.css';

export const metadata: Metadata = {
  title: 'BeatForge',
  description: '5 lane web rhythm game prototype',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}
        <Script id="beatforge-fullscreen" strategy="afterInteractive">{`
          (() => {
            let fullscreenKey = localStorage.getItem('beatforge-fullscreen-key') || 'f';
            const isTyping = () => {
              const el = document.activeElement;
              return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
            };
            const toggleFullscreen = async () => {
              const game = document.querySelector('.game');
              if (!game) return;
              try {
                if (document.fullscreenElement) await document.exitFullscreen();
                else await game.requestFullscreen();
              } catch {}
            };
            const install = () => {
              const controls = document.querySelector('.controls');
              if (!controls || controls.querySelector('.fullscreenBtn')) return;
              const button = document.createElement('button');
              button.className = 'secondary fullscreenBtn';
              button.textContent = 'FULLSCREEN';
              button.title = 'Toggle fullscreen';
              button.onclick = toggleFullscreen;
              const bind = document.createElement('div');
              bind.className = 'resetBind fullscreenBind';
              const keyButton = document.createElement('button');
              keyButton.title = 'Fullscreen keybind';
              keyButton.setAttribute('aria-label','Fullscreen keybind');
              keyButton.textContent = fullscreenKey.toUpperCase();
              keyButton.onkeydown = e => {
                e.preventDefault(); e.stopPropagation();
                fullscreenKey = e.key.toLowerCase();
                localStorage.setItem('beatforge-fullscreen-key', fullscreenKey);
                keyButton.textContent = fullscreenKey === 'escape' ? 'ESC' : fullscreenKey.toUpperCase();
                keyButton.blur();
              };
              bind.appendChild(keyButton);
              const volume = controls.querySelector('.volume');
              controls.insertBefore(button, volume || null);
              controls.insertBefore(bind, volume || null);
            };
            document.addEventListener('keydown', e => {
              if (isTyping()) return;
              if (e.key.toLowerCase() === fullscreenKey) { e.preventDefault(); toggleFullscreen(); }
            });
            new MutationObserver(install).observe(document.body,{childList:true,subtree:true});
            install();
          })();
        `}</Script>
      </body>
    </html>
  );
}
