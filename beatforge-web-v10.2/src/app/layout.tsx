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
        <Script id="beatforge-star-system" strategy="afterInteractive">{`
          (()=>{
            let lastStars=0;
            let finalStars=0;
            const updateStars=()=>{
              const meter=document.querySelector('.starMeter');
              const rail=meter?.querySelector('.starRail i');
              const stars=[...(meter?.querySelectorAll('.stars span')||[])];
              if(!meter||!rail||!stars.length)return;
              const raw=parseFloat(rail.style.width)||0;
              const progress=Math.max(0,Math.min(5,raw/20));
              const earned=Math.min(5,Math.floor(progress+0.0001));
              const fraction=earned>=5?1:progress-earned;
              rail.style.width=(fraction*100)+'%';
              meter.setAttribute('data-stars',String(earned));
              if(earned>lastStars){
                finalStars=earned;
                const star=stars[earned-1];
                star?.classList.remove('starEarnPop'); void star?.offsetWidth; star?.classList.add('starEarnPop');
                meter.classList.remove('starMeterBurst'); void meter.offsetWidth; meter.classList.add('starMeterBurst');
                const game=document.querySelector('.game');
                if(game){game.classList.remove('starGameFlash');void game.offsetWidth;game.classList.add('starGameFlash')}
              }
              if(earned<lastStars)finalStars=earned;
              lastStars=earned;
            };
            const addResultStars=()=>{
              document.querySelectorAll('.resultCard').forEach(card=>{
                if(card.querySelector('.resultStarsFinal'))return;
                const label=card.querySelector('.scoreLabel');
                if(!label||!card.textContent?.includes('SONG COMPLETE'))return;
                const wrap=document.createElement('div');wrap.className='resultStarsFinal';
                const title=document.createElement('span');title.textContent='STAR RATING';wrap.appendChild(title);
                const row=document.createElement('div');row.className='resultStarsRow';
                for(let i=1;i<=5;i++){const s=document.createElement('b');s.textContent='★';if(i<=finalStars)s.className='earned';row.appendChild(s)}
                wrap.appendChild(row);label.insertAdjacentElement('afterend',wrap);
              });
            };
            const obs=new MutationObserver(()=>{updateStars();addResultStars()});
            obs.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['style','class']});
            setInterval(updateStars,100);
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

          .starMeter{position:relative;padding:11px 12px!important;transition:border-color .2s,box-shadow .2s}
          .stars{font-size:20px!important;gap:4px}
          .starRail{height:7px!important;margin-top:9px!important;background:#252b38!important;border:1px solid #3a4253;overflow:hidden!important}
          .starRail i{height:100%!important;background:linear-gradient(90deg,#f6b93b,#ffd54a,#fff0a0)!important;box-shadow:0 0 10px #ffd54a88;transition:width .12s linear!important}
          .starMeter:after{content:attr(data-stars) ' / 5';position:absolute;right:10px;bottom:-16px;font-size:8px;font-weight:900;letter-spacing:1px;color:#8e95a5}
          .starEarnPop{animation:bfStarPop .7s cubic-bezier(.2,.9,.25,1.25)!important}
          .starMeterBurst{animation:bfMeterBurst .65s ease-out}
          .starGameFlash:after{content:'';position:absolute;inset:0;z-index:20;pointer-events:none;border:2px solid #ffd54a88;border-radius:18px;animation:bfGameStarFlash .65s ease-out forwards}
          @keyframes bfStarPop{0%{transform:scale(.6);filter:brightness(1)}35%{transform:scale(1.65) rotate(10deg);filter:brightness(1.8);text-shadow:0 0 24px #ffd54a}100%{transform:scale(1);filter:brightness(1)}}
          @keyframes bfMeterBurst{0%{box-shadow:0 0 0 #ffd54a00;border-color:#303747}35%{box-shadow:0 0 24px #ffd54a66;border-color:#ffd54aaa}100%{box-shadow:0 0 0 #ffd54a00;border-color:#303747}}
          @keyframes bfGameStarFlash{0%{opacity:0;box-shadow:inset 0 0 0 #ffd54a00}30%{opacity:1;box-shadow:inset 0 0 45px #ffd54a20}100%{opacity:0;box-shadow:inset 0 0 0 #ffd54a00}}
          .resultStarsFinal{margin:14px auto 2px;padding:12px 16px;border:1px solid #343a49;border-radius:12px;background:#181c26;width:max-content;min-width:210px}
          .resultStarsFinal>span{display:block;color:#8e95a5;font-size:9px;font-weight:900;letter-spacing:1.4px;margin-bottom:6px}
          .resultStarsRow{display:flex;justify-content:center;gap:8px;font-size:26px;color:#343a48}
          .resultStarsRow b{font-weight:400}.resultStarsRow b.earned{color:#ffd54a;text-shadow:0 0 12px #ffd54a88}
        `}</style>
      </body>
    </html>
  );
}
