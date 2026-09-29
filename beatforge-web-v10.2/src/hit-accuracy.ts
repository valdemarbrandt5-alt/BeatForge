export function hitAccuracy(stats:{perfect:number;great:number;good:number;miss:number}):number{
  const hits=stats.perfect+stats.great+stats.good;
  const attempts=hits+stats.miss;
  return attempts>0?hits/attempts*100:0;
}

// Older scores may contain timing-weighted accuracy. Their hit counts are the source of truth.
export function scoreAccuracy(row:{perfect:number|null;great:number|null;good:number|null;miss:number|null;accuracy?:number|null}):number{
  const counts=[row.perfect,row.great,row.good,row.miss].map(Number);
  if([row.perfect,row.great,row.good,row.miss].every(n=>n!==null)&&counts.every(n=>Number.isFinite(n)&&n>=0)&&counts.reduce((sum,n)=>sum+n,0)>0){
    const [perfect,great,good,miss]=counts;
    return Number(hitAccuracy({perfect,great,good,miss}).toFixed(1));
  }
  return Number(row.accuracy)||0;
}
