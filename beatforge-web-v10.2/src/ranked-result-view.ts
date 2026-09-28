import {rankName} from './rank';

const esc=(value:string|number)=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]||c));
const rankClass=(mmr:number)=>`rank${rankName(mmr)[0]}${rankName(mmr).slice(1).toLowerCase()}`;

export function rankedResultScores(me:{name:string;difficulty:string;score:number},opponent:{name:string;difficulty:string;score:number}){
  const rows=[{...me,side:'Me'},{...opponent,side:'Opp'}].sort((a,b)=>b.score-a.score);
  return `<div class="rankedFinalScores">${rows.map((row,index)=>`<span class="ranked${row.side} ${me.score===opponent.score?'rankedDraw':index===0?'rankedWinner':'rankedLoser'}"><i>#${index+1}</i><label>${esc(row.name)}<em>${esc(row.difficulty)}</em></label><b>${row.score.toLocaleString('da-DK')}</b><small>${me.score===opponent.score?'DRAW':index===0?'WINNER':'DEFEAT'}</small></span>`).join('')}</div>`;
}

export function rankedResultMmr(before:number,after:number,delta:number,worldPosition:number|null){
  return `<div class="rankedMmrResult"><b class="${rankClass(before)}">${esc(rankName(before))} · ${before}</b><span>→</span><b class="${rankClass(after)}">${esc(rankName(after))} · ${after}${worldPosition?` · WORLD #${worldPosition}`:''}</b><strong class="${delta>=0?'positive':'negative'}">${delta>0?'+':''}${delta} MMR</strong></div>`;
}

export function rankedResultStats(result:Element|null){
  if(!result)return '<p>Performance details are unavailable.</p>';
  const card=result.querySelector('.resultCard')||result;
  return ['.finalScore','.scoreLabel','.resultStarsFinal','.resultGrid','.resultMeta','.personalBestResult']
    .map(selector=>card.querySelector(selector)?.outerHTML||'').join('');
}

export function wireRankedResult(card:HTMLElement){
  const toggle=card.querySelector<HTMLButtonElement>('.rankedShowStats');
  const sheet=card.querySelector<HTMLElement>('.rankedStatsSheet');
  toggle?.addEventListener('click',()=>{
    if(!sheet)return;
    const open=sheet.hidden;
    sheet.hidden=!open;
    toggle.textContent=open?'SHOW RESULTS':'SEE STATS';
    card.querySelector('.rankedFinalScores')?.classList.toggle('rankedResultsHidden',open);
    card.querySelector('.rankedMmrResult')?.classList.toggle('rankedResultsHidden',open);
  });
}
