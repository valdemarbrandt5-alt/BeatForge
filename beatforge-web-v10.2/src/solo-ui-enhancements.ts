if (typeof window !== 'undefined' && window.location.pathname === '/') {
  type Difficulty = 'Easy'|'Medium'|'Hard'|'Expert';
  let prompt:HTMLElement|null=null;
  let pendingTile:HTMLElement|null=null;
  const seenCards=new WeakSet<Element>();
  const previousBest=new WeakMap<Element,any>();

  const escapeHtml=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]||c));
  const intFrom=(value:string|null|undefined)=>Number(String(value||'').replace(/\D/g,''))||0;
  const decimalFrom=(value:string|null|undefined)=>{
    const match=String(value||'').replace(',','.').match(/\d+(?:\.\d+)?/);
    return match?Number(match[0])||0:0;
  };

  const difficultyGroup=()=>Array.from(document.querySelectorAll('.chartOptions>div')).find(group=>group.querySelector('small')?.textContent?.trim().toUpperCase()==='DIFFICULTY') as HTMLElement|undefined;
  const hideInlineDifficulty=()=>{
    const group=difficultyGroup();
    if(group)group.style.setProperty('display','none','important');
  };

  const keyFor=()=>{
    const game=document.querySelector('.game');
    const title=document.querySelector('.leaderGlobal .leaderHead strong')?.textContent?.trim()||'demo';
    const diff=document.querySelector('.leaderGlobal .leaderHead small')?.textContent?.split('·')[0]?.trim()||'unknown';
    return 'beatforge-pb:'+title.toLowerCase()+':'+diff.toLowerCase()+':'+(game?.querySelectorAll('.lane').length||5);
  };

  const readBest=(key:string)=>{
    try{return JSON.parse(localStorage.getItem(key)||'null')}catch{return null}
  };

  const writeCorrectedBest=(card:Element)=>{
    const box=card.querySelector('.personalBestResult') as HTMLElement|null;
    if(!box)return;
    const score=intFrom(card.querySelector('.finalScore')?.textContent);
    if(!score)return;
    const meta=card.querySelectorAll('.resultMeta>div');
    const accuracy=decimalFrom(meta[0]?.querySelector('b')?.textContent);
    const combo=intFrom(meta[1]?.querySelector('b')?.textContent);
    const key=keyFor();
    const correctedKey=key+':fixed-v1';
    let old=readBest(correctedKey);
    if(!old)old=previousBest.get(card)||readBest(key);

    const oldScore=Number(old?.score||0);
    const oldAccuracy=Number(old?.accuracy||0);
    const oldCombo=Number(old?.combo||0);
    const first=!oldScore;
    const isPB=first||score>oldScore;
    const best={
      score:Math.max(score,oldScore),
      accuracy:Math.max(accuracy,oldAccuracy),
      combo:Math.max(combo,oldCombo),
    };
    try{localStorage.setItem(correctedKey,JSON.stringify(best));localStorage.setItem(key,JSON.stringify(best))}catch{}

    box.classList.toggle('newPB',isPB);
    if(first){
      box.innerHTML='<strong>FIRST SCORE SAVED</strong><span>This is now your personal best.</span>';
    }else if(isPB){
      const gain=score-oldScore;
      box.innerHTML=`<strong>NEW PERSONAL BEST!</strong><span>+${gain.toLocaleString()} SCORE</span><small><span>Accuracy ${oldAccuracy.toFixed(1)}% → ${accuracy.toFixed(1)}%</span><span>Max combo ${oldCombo} → ${combo}</span></small>`;
    }else if(score===oldScore){
      box.innerHTML=`<strong>PERSONAL BEST ${oldScore.toLocaleString()}</strong><span>Matched your personal best</span><small><span>Best accuracy ${best.accuracy.toFixed(1)}%</span><span>Best combo ${best.combo}</span></small>`;
    }else{
      const gap=oldScore-score;
      box.innerHTML=`<strong>PERSONAL BEST ${oldScore.toLocaleString()}</strong><span>${gap.toLocaleString()} from your best</span><small><span>Best accuracy ${best.accuracy.toFixed(1)}%</span><span>Best combo ${best.combo}</span></small>`;
    }
    box.dataset.bfFixedScore=String(score);
  };

  const fixPersonalBest=()=>{
    document.querySelectorAll('.resultCard').forEach(card=>{
      if(!/SONG COMPLETE/i.test(card.textContent||''))return;
      if(!seenCards.has(card)){
        seenCards.add(card);
        previousBest.set(card,readBest(keyFor()));
      }
      const box=card.querySelector('.personalBestResult') as HTMLElement|null;
      if(!box)return;
      const score=intFrom(card.querySelector('.finalScore')?.textContent);
      if(box.dataset.bfFixedScore===String(score))return;
      writeCorrectedBest(card);
    });
  };

  const closePrompt=()=>{prompt?.remove();prompt=null;pendingTile=null};

  const chooseDifficulty=(diff:Difficulty)=>{
    const tile=pendingTile;
    prompt?.remove();prompt=null;pendingTile=null;
    if(!tile)return;
    tile.click();
    const apply=()=>{
      const group=difficultyGroup();
      const button=Array.from(group?.querySelectorAll('button')||[]).find(btn=>btn.textContent?.trim()===diff) as HTMLButtonElement|undefined;
      if(button&&!button.disabled)button.click();
    };
    requestAnimationFrame(()=>{apply();window.setTimeout(apply,80)});
  };

  const showDifficultyPrompt=(tile:HTMLElement)=>{
    closePrompt();
    pendingTile=tile;
    const title=tile.querySelector('.tileInfo strong,.chartIdentity strong,strong')?.textContent?.trim()||'Selected song';
    const artist=tile.querySelector('.tileInfo span,.chartIdentity em')?.textContent?.trim()||'';
    const overlay=document.createElement('div');
    overlay.className='soloDifficultyBackdrop';
    overlay.innerHTML=`<div class="soloDifficultyCard"><small>SOLO PLAY</small><h2>CHOOSE YOUR DIFFICULTY</h2><p>You choose the difficulty for this run.</p><div class="soloSong"><strong>${escapeHtml(title)}</strong>${artist?`<span>${escapeHtml(artist)}</span>`:''}</div><div class="soloDifficultyGrid"><button data-diff="Easy"><b>Easy</b><span>Safer combos</span></button><button data-diff="Medium"><b>Medium</b><span>Balanced</span></button><button data-diff="Hard"><b>Hard</b><span>More scoring potential</span></button><button data-diff="Expert"><b>Expert</b><span>Maximum scoring potential</span></button></div><button class="soloDifficultyCancel">CANCEL</button></div>`;
    document.body.appendChild(overlay);
    prompt=overlay;
    overlay.querySelectorAll<HTMLButtonElement>('[data-diff]').forEach(button=>button.onclick=()=>chooseDifficulty(button.dataset.diff as Difficulty));
    (overlay.querySelector('.soloDifficultyCancel') as HTMLButtonElement).onclick=closePrompt;
  };

  const interceptSongChoice=(event:MouseEvent)=>{
    if(!event.isTrusted)return;
    const target=event.target as HTMLElement|null;
    if(!target||target.closest('.tileLike,.adminChartButton,.deleteChart'))return;
    const tile=target.closest('button.communityTile,button.savedChart') as HTMLElement|null;
    if(!tile)return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    showDifficultyPrompt(tile);
  };

  const addStyles=()=>{
    if(document.getElementById('solo-ui-enhancements-style'))return;
    const style=document.createElement('style');
    style.id='solo-ui-enhancements-style';
    style.textContent=`
      .soloDifficultyBackdrop{position:fixed;inset:0;z-index:14500;background:#03050be8;backdrop-filter:blur(12px);display:grid;place-items:center;padding:20px}
      .soloDifficultyCard{width:min(560px,94vw);background:linear-gradient(155deg,#151824,#0d1018);border:1px solid #383e4e;border-radius:20px;padding:28px 30px;text-align:center;box-shadow:0 28px 90px #000a}
      .soloDifficultyCard>small{font-size:8px;font-weight:1000;letter-spacing:2px;color:#a58bff}.soloDifficultyCard h2{font-size:25px;margin:10px 0 6px}.soloDifficultyCard>p{margin:0 0 16px;color:#aab1c1;font-size:11px}
      .soloSong{display:grid;gap:3px;text-align:left;padding:11px 13px;margin:0 0 16px;border:1px solid #303747;border-radius:11px;background:#0a0f17}.soloSong strong{font-size:11px}.soloSong span{font-size:8px;color:#8490a5}
      .soloDifficultyGrid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.soloDifficultyGrid button{min-height:64px;text-align:left;padding:12px 16px;border:1px solid #343c4e;border-radius:11px;background:#141923;color:#fff}.soloDifficultyGrid button:hover{border-color:#8066ff;background:#1a1e2b;transform:translateY(-1px)}.soloDifficultyGrid b{display:block;font-size:13px}.soloDifficultyGrid span{display:block;margin-top:5px;font-size:8px;color:#8993a7;font-weight:800}
      .soloDifficultyCancel{margin-top:14px;padding:10px 20px;border:1px solid #343c4e;border-radius:10px;background:#111722;color:#abb4c5;font-size:9px;font-weight:1000}
    `;
    document.head.appendChild(style);
  };

  const start=()=>{
    addStyles();hideInlineDifficulty();fixPersonalBest();
    document.addEventListener('click',interceptSongChoice,true);
    new MutationObserver(()=>{hideInlineDifficulty();fixPersonalBest()}).observe(document.body,{childList:true,subtree:true,characterData:true});
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
}
