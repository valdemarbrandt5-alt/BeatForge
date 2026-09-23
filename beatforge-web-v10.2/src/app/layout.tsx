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
            let shell = null;
            let moved = [];
            let observer = null;
            const rememberAndMove = (el, target) => {
              if (!el || moved.some(x => x.el === el)) return;
              moved.push({el,parent:el.parentNode,next:el.nextSibling});
              target.appendChild(el);
            };
            const moveFullscreenModal = () => {
              if (!shell) return;
              document.querySelectorAll('body > .resultBackdrop, body > main > .resultBackdrop').forEach(el => rememberAndMove(el, shell));
            };
            const restore = () => {
              observer?.disconnect(); observer=null;
              [...moved].reverse().forEach(({el,parent,next}) => {
                if (parent) parent.insertBefore(el,next);
              });
              moved=[];
              shell?.remove();
              shell=null;
            };
            const enter = async () => {
              const game=document.querySelector('.game');
              const controls=document.querySelector('.controls');
              if(!game||!controls)return;
              const global=document.querySelector('.leaderGlobal');
              const friends=document.querySelector('.leaderFriends');
              shell=document.createElement('div');
              shell.className='beatforgeFullscreenShell';
              const arena=document.createElement('div');
              arena.className='beatforgeFullscreenArena';
              const left=document.createElement('div'); left.className='beatforgeFullscreenSide left';
              const center=document.createElement('div'); center.className='beatforgeFullscreenCenter';
              const right=document.createElement('div'); right.className='beatforgeFullscreenSide right';
              arena.append(left,center,right); shell.appendChild(arena);
              document.body.appendChild(shell);
              rememberAndMove(global,left);
              rememberAndMove(game,center);
              rememberAndMove(friends,right);
              rememberAndMove(controls,shell);
              observer=new MutationObserver(moveFullscreenModal);
              observer.observe(document.body,{childList:true,subtree:true});
              try{await shell.requestFullscreen();moveFullscreenModal()}catch{restore()}
            };
            const toggleFullscreen=async()=>{
              if(document.fullscreenElement)await document.exitFullscreen();else await enter();
            };
            document.addEventListener('fullscreenchange',()=>{if(!document.fullscreenElement&&shell)restore()});
            const install=()=>{
              const controls=document.querySelector('.controls');
              if(!controls||controls.querySelector('.fullscreenBtn'))return;
              const button=document.createElement('button');
              button.className='secondary fullscreenBtn';
              button.textContent='FULLSCREEN';
              button.title='Toggle fullscreen';
              button.onclick=toggleFullscreen;
              const volume=controls.querySelector('.volume');
              controls.insertBefore(button,volume||null);
            };
            new MutationObserver(install).observe(document.body,{childList:true,subtree:true});
            install();
          })();
        `}</Script>
        <style>{`
          .beatforgeFullscreenShell{background:#070a10;width:100vw;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;overflow:hidden;padding:10px 18px;box-sizing:border-box}
          .beatforgeFullscreenArena{width:100%;display:grid;grid-template-columns:minmax(190px,1fr) minmax(0,calc((100vh - 100px) * 1.5082)) minmax(190px,1fr);gap:16px;align-items:center;justify-items:center;min-height:0}
          .beatforgeFullscreenCenter{width:min(1120px,calc((100vh - 100px) * 1.5082));aspect-ratio:920/610;min-width:0;flex:none}
          .beatforgeFullscreenCenter>.game{width:100%!important;height:100%!important;min-height:0!important;max-height:none!important;margin:0!important}
          .beatforgeFullscreenSide{width:100%;max-width:300px;min-width:0}
          .beatforgeFullscreenSide>.leaderSide{position:static!important;inset:auto!important;transform:none!important;width:100%!important;max-height:calc(100vh - 130px)!important;margin:0!important;display:block!important;visibility:visible!important}
          .beatforgeFullscreenShell>.controls{width:min(1120px,calc((100vh - 100px) * 1.5082));max-width:calc(100vw - 36px);margin:0!important;display:flex!important;visibility:visible!important;flex:0 0 auto}
          .beatforgeFullscreenShell>.resultBackdrop{position:fixed!important;inset:0!important;z-index:9999!important;width:100%!important;height:100%!important}
          @media(max-width:1500px){.beatforgeFullscreenArena{grid-template-columns:220px minmax(0,calc((100vh - 100px) * 1.5082)) 220px;gap:10px}.beatforgeFullscreenSide{max-width:220px}}
        `}</style>
      </body>
    </html>
  );
}
