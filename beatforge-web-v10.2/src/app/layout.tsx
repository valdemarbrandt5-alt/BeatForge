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
            const rememberAndMove = (el, target) => {
              if (!el) return;
              moved.push({el,parent:el.parentNode,next:el.nextSibling});
              target.appendChild(el);
            };
            const restore = () => {
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
              try{await shell.requestFullscreen()}catch{restore()}
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
          .beatforgeFullscreenShell{background:#070a10;width:100vw;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;overflow:auto;padding:18px;box-sizing:border-box}
          .beatforgeFullscreenArena{width:100%;display:grid;grid-template-columns:minmax(180px,1fr) 920px minmax(180px,1fr);gap:18px;align-items:center;justify-items:center}
          .beatforgeFullscreenCenter{width:920px;height:610px;flex:none}
          .beatforgeFullscreenCenter>.game{width:920px!important;height:610px!important;min-height:610px!important;max-height:610px!important;margin:0!important}
          .beatforgeFullscreenSide{width:100%;max-width:270px;min-width:0}
          .beatforgeFullscreenSide>.leaderSide{position:static!important;inset:auto!important;transform:none!important;width:100%!important;max-height:610px!important;margin:0!important;display:block!important;visibility:visible!important}
          .beatforgeFullscreenShell>.controls{width:920px;max-width:calc(100vw - 36px);margin:0!important;display:flex!important;visibility:visible!important;flex:0 0 auto}
          @media(max-width:1400px){.beatforgeFullscreenArena{grid-template-columns:220px 920px 220px;justify-content:center;gap:10px}.beatforgeFullscreenSide{max-width:220px}}
        `}</style>
      </body>
    </html>
  );
}
