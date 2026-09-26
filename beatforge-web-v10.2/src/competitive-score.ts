export type CompetitionDifficulty='Easy'|'Medium'|'Hard'|'Expert';

export function competitionPoints(input:{notes:number;perfect:number;great:number;good:number;miss:number;maxCombo:number;comboBonus:number;difficulty:string}):number{
  const notes=Math.max(1,input.notes);
  const judged=Math.max(notes,input.perfect+input.great+input.good+input.miss);
  const quality=Math.min(1,(input.perfect+input.great*.8+input.good*.5)/judged);
  const streak=Math.min(1,input.maxCombo/notes);
  const cap=({Easy:.80,Medium:.88,Hard:.95,Expert:1} as Record<string,number>)[input.difficulty]??.88;
  // The first 100,000 points keep the existing accuracy/streak weighting.
  // Each hit at x2..x5 also earns a bonus above that base score. Normalize by
  // chart length so a long song is not automatically worth more than a short one.
  const multiplierBonus=Math.min(1,Math.max(0,input.comboBonus)/(4*notes));
  return Math.max(0,Math.round(cap*(100000*(.85*quality+.15*streak)+50000*multiplierBonus)));
}

export function liveCompetitionPoints():number{
  const node=document.querySelector<HTMLElement>('[data-competition-notes]');
  if(!node)return 0;
  const n=(key:string)=>Number(node.dataset[key]||0);
  return competitionPoints({notes:n('competitionNotes'),perfect:n('competitionPerfect'),great:n('competitionGreat'),good:n('competitionGood'),miss:n('competitionMiss'),maxCombo:n('competitionMaxCombo'),comboBonus:n('competitionComboBonus'),difficulty:node.dataset.competitionDifficulty||'Medium'});
}
