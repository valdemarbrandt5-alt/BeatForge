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
            const sizeFullscreen = () => {
              if (!shell) return;
              const center=shell.querySelector('.beatforgeFullscreenCenter');
              const controls=shell.querySelector('.controls');
              if(!center)return;
              const side=280, gaps=48;
              const scale=Math.max(1,Math.min(1.35,(window.innerWidth-side*2-gaps)/920,(window.innerHeight-105)/610));
              center.style.width=(920*scale)+'px';
              center.style.height=(610*scale)+'px';
              center.style.setProperty('--bf-scale',String(scale));
              if(controls)controls.style.width=(920*scale)+'px';
            };
            const restore = () => {
              observer?.disconnect(); observer=null;
              window.removeEventListener('resize',sizeFullscreen);
              [...moved].reverse().forEach(({el,parent,next}) => { if (parent) parent.insertBefore(el,next); });
              moved=[]; shell?.remove(); shell=null;
            };
            const enter = async () => {
              const game=document.querySelector('.game');
              const controls=document.querySelector('.controls');
              if(!game||!controls)return;
              const global=document.querySelector('.leaderGlobal');
              const friends=document.querySelector('.leaderFriends');
              shell=document.createElement('div'); shell.className='beatforgeFullscreenShell';
              const arena=document.createElement('div'); arena.className='beatforgeFullscreenArena';
              const left=document.createElement('div'); left.className='beatforgeFullscreenSide left';
              const center=document.createElement('div'); center.className='beatforgeFullscreenCenter';
              const right=document.createElement('div'); right.className='beatforgeFullscreenSide right';
              arena.append(left,center,right); shell.appendChild(arena); document.body.appendChild(shell);
              rememberAndMove(global,left); rememberAndMove(game,center); rememberAndMove(friends,right); rememberAndMove(controls,shell);
              sizeFullscreen(); window.addEventListener('resize',sizeFullscreen);
              observer=new MutationObserver(moveFullscreenModal); observer.observe(document.body,{childList:true,subtree:true});
              try{await shell.requestFullscreen();sizeFullscreen();moveFullscreenModal()}catch{restore()}
            };
            const toggleFullscreen=async()=>{ if(document.fullscreenElement)await document.exitFullscreen();else await enter(); };
            document.addEventListener('fullscreenchange',()=>{if(!document.fullscreenElement&&shell)restore();else if(shell)sizeFullscreen()});
            const install=()=>{
              const controls=document.querySelector('.controls');
              if(!controls||controls.querySelector('.fullscreenBtn'))return;
              const button=document.createElement('button'); button.className='secondary fullscreenBtn'; button.textContent='FULLSCREEN'; button.title='Toggle fullscreen'; button.onclick=toggleFullscreen;
              const volume=controls.querySelector('.volume'); controls.insertBefore(button,volume||null);
            };
            new MutationObserver(install).observe(document.body,{childList:true,subtree:true}); install();
          })();
        `}</Script>
        <style>{`
          .beatforgeFullscreenShell{background:#070a10;width:100vw;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;overflow:hidden;padding:8px 16px;box-sizing:border-box}
          .beatforgeFullscreenArena{width:100%;display:grid;grid-template-columns:280px auto 280px;gap:24px;align-items:center;justify-content:center;min-height:0}
          .beatforgeFullscreenCenter{position:relative;min-width:920px;min-height:610px;overflow:visible;flex:none}
          .beatforgeFullscreenCenter>.game{position:absolute!important;left:50%!important;top:50%!important;width:920px!important;height:610px!important;min-height:610px!important;max-height:610px!important;margin:0!important;transform:translate(-50%,-50%) scale(var(--bf-scale,1))!important;transform-origin:center center!important}
          .beatforgeFullscreenSide{width:280px;min-width:280px;overflow:visible}
          .beatforgeFullscreenSide>.leaderSide{position:static!important;inset:auto!important;transform:none!important;width:280px!important;min-width:280px!important;max-width:280px!important;max-height:610px!important;margin:0!important;display:block!important;visibility:visible!important;overflow:hidden!important;box-sizing:border-box!important}
          .beatforgeFullscreenSide .leaderboard,.beatforgeFullscreenSide .leaderRow{max-width:100%!important;min-width:0!important;box-sizing:border-box!important;overflow:hidden!important}
          .beatforgeFullscreenSide .leaderRow{grid-template-columns:auto minmax(0,1fr) auto!important}
          .beatforgeFullscreenSide .leaderRow strong{min-width:0!important;overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important}
          .beatforgeFullscreenShell>.controls{max-width:calc(100vw - 32px);margin:0!important;display:flex!important;visibility:visible!important;flex:0 0 auto}
          .beatforgeFullscreenShell>.resultBackdrop{position:fixed!important;inset:0!important;z-index:9999!important;width:100%!important;height:100%!important}
          @media(max-width:1500px){.beatforgeFullscreenArena{grid-template-columns:240px auto 240px;gap:14px}.beatforgeFullscreenSide,.beatforgeFullscreenSide>.leaderSide{width:240px!important;min-width:240px!important;max-width:240px!important}}
        `}</style>
      </body>
    </html>
  );
}
