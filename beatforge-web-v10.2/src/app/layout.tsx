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
            let shell = null;
            let gameHome = null;
            let controlsHome = null;
            let gameNext = null;
            let controlsNext = null;
            const isTyping = () => {
              const el = document.activeElement;
              return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
            };
            const restore = () => {
              const game = shell?.querySelector('.game');
              const controls = shell?.querySelector('.controls');
              if (game && gameHome) gameHome.insertBefore(game, gameNext);
              if (controls && controlsHome) controlsHome.insertBefore(controls, controlsNext);
              shell?.remove(); shell = null;
            };
            const enter = async () => {
              const game = document.querySelector('.game');
              const controls = document.querySelector('.controls');
              if (!game || !controls) return;
              gameHome=game.parentNode; controlsHome=controls.parentNode;
              gameNext=game.nextSibling; controlsNext=controls.nextSibling;
              shell=document.createElement('div'); shell.className='beatforgeFullscreenShell';
              const stage=document.createElement('div'); stage.className='beatforgeFullscreenStage';
              stage.appendChild(game); shell.appendChild(stage); shell.appendChild(controls);
              document.body.appendChild(shell);
              try { await shell.requestFullscreen(); } catch { restore(); }
            };
            const toggleFullscreen = async () => {
              if (document.fullscreenElement) await document.exitFullscreen(); else await enter();
            };
            document.addEventListener('fullscreenchange',()=>{if(!document.fullscreenElement&&shell)restore()});
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
              keyButton.textContent = fullscreenKey === 'escape' ? 'ESC' : fullscreenKey.toUpperCase();
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
        <style>{`
          .beatforgeFullscreenShell{background:#070a10;width:100vw;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;overflow:hidden;padding:18px;box-sizing:border-box}
          .beatforgeFullscreenStage{height:min(76vh,720px);width:min(94vw,1100px);display:flex;align-items:stretch;justify-content:center;min-height:0}
          .beatforgeFullscreenStage>.game{width:100%!important;height:100%!important;min-height:0!important;max-height:none!important;margin:0!important;flex:none!important}
          .beatforgeFullscreenShell>.controls{width:min(94vw,1100px);margin:0!important;flex:0 0 auto;display:flex!important;visibility:visible!important}
        `}</style>
      </body>
    </html>
  );
}
