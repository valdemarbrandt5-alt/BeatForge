export function hitAccuracy(stats:{perfect:number;great:number;good:number;miss:number}):number{
  const hits=stats.perfect+stats.great+stats.good;
  const attempts=hits+stats.miss;
  return attempts>0?hits/attempts*100:0;
}
