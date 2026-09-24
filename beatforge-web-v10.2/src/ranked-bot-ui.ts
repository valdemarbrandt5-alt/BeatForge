if (typeof window !== 'undefined' && window.location.pathname === '/') {
  let queueEl:Element|null=null;
  let queueStartedAt=0;

  const numberFrom=(value:string|null|undefined)=>Number(String(value||'0').replace(/[^0-9-]/g,''))||0;
  const streakTone=(combo:number)=>combo>=200?'streakPink':combo>=100?'streakBlue':combo>=50?'streakGold':'streakBase';
  const fmt=(ms:number)=>{
    const total=Math.max(0,Math.floor(ms/1000));
    const min=Math.floor(total/60),sec=total%60;
    return `${String(min).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
  };

  const updateQueueTimer=()=>{
    const cancel=document.querySelector('.rankedBackdrop.realRanked .cancelRealQueue');
    if(!cancel){
      queueEl=null;queueStartedAt=0;
      document.querySelector('.queueElapsedTimer')?.remove();
      return;
    }
    if(cancel!==queueEl){queueEl=cancel;queueStartedAt=Date.now()}

    const note=document.querySelector('.rankedBackdrop.realRanked .realQueueNote') as HTMLElement|null;
    if(note)note.style.setProperty('display','none','important');
    const card=cancel.closest('.rankedCard') as HTMLElement|null;
    if(!card)return;
    let timer=card.querySelector('.queueElapsedTimer') as HTMLElement|null;
    if(!timer){
      timer=document.createElement('div');timer.className='queueElapsedTimer';
      const button=card.querySelector('.cancelRealQueue');
      button?.insertAdjacentElement('beforebegin',timer);
    }
    timer.textContent=`TIME IN QUEUE · ${fmt(Date.now()-queueStartedAt)}`;
  };

  const botComboFromScore=(score:number)=>{
    if(score<=0)return 0;
    const approximateHits=Math.floor(score/5000);
    const cycle=230;
    return approximateHits%cycle;
  };

  const decorateBotHud=()=>{
    const hud=document.querySelector('.botRankedLiveHud') as HTMLElement|null;
    if(!hud)return;
    const me=hud.querySelector('.botLiveMe') as HTMLElement|null;
    const opp=hud.querySelector('.botLiveOpp') as HTMLElement|null;
    if(!me||!opp)return;

    const myCombo=numberFrom(document.querySelector('.hudCombo b')?.textContent);
    const botScore=numberFrom(opp.querySelector('strong')?.textContent);
    const botCombo=botComboFromScore(botScore);

    [[me,myCombo],[opp,botCombo]].forEach(([row,value])=>{
      const el=row as HTMLElement,combo=Number(value)||0;
      el.classList.remove('streakBase','streakGold','streakBlue','streakPink');
      el.classList.add(streakTone(combo));
      const score=el.querySelector('strong') as HTMLElement|null;
      if(score)score.dataset.combo=`${combo}x`;
    });
  };

  const addStyles=()=>{
    if(document.getElementById('ranked-bot-ui-polish'))return;
    const s=document.createElement('style');s.id='ranked-bot-ui-polish';s.textContent=`
      .queueElapsedTimer{margin:12px 0 14px;color:#8b94a8;font-size:9px;font-weight:1000;letter-spacing:.16em}
      .botRankedLiveHud span>strong:after{content:' ' attr(data-combo);font-size:8px!important;margin-left:2px;font-weight:900!important}
      .botRankedLiveHud span.streakBase{border-color:#303747!important}.botRankedLiveHud span.streakBase>strong:after{color:#8e95a5!important}
      .botRankedLiveHud span.streakGold{border-color:#ffd43b!important;box-shadow:0 0 8px #ffd43b22!important}.botRankedLiveHud span.streakGold>strong:after{color:#ffd43b!important}
      .botRankedLiveHud span.streakBlue{border-color:#58a6ff!important;box-shadow:0 0 8px #58a6ff22!important}.botRankedLiveHud span.streakBlue>strong:after{color:#58a6ff!important}
      .botRankedLiveHud span.streakPink{border-color:#ff72d2!important;box-shadow:0 0 8px #ff72d222!important}.botRankedLiveHud span.streakPink>strong:after{color:#ff72d2!important}
    `;document.head.appendChild(s);
  };

  const start=()=>{
    addStyles();
    updateQueueTimer();decorateBotHud();
    window.setInterval(()=>{updateQueueTimer();decorateBotHud()},200);
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
}
