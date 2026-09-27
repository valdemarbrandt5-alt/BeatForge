type ChartNote={time:number;duration?:number};

const multiplier=(combo:number)=>combo>=50?5:combo>=30?4:combo>=20?3:combo>=10?2:1;

// Perfect taps and uninterrupted holds with the game's combo multipliers.
export function chartScorePotential(notes:ChartNote[]):number{
  const events:{time:number;starts:number;ends:number;hits:number}[]=[];
  for(const note of notes){
    if(!Number.isFinite(note.time))continue;
    events.push({time:note.time,starts:note.duration&&note.duration>=.45?1:0,ends:0,hits:1});
    if(note.duration&&Number.isFinite(note.duration)&&note.duration>=.45)
      events.push({time:note.time+note.duration,starts:0,ends:1,hits:0});
  }
  events.sort((a,b)=>a.time-b.time||a.ends-b.ends);
  let score=0,combo=0,holds=0,previous=events[0]?.time??0;
  for(const event of events){
    score+=(event.time-previous)*holds*250*multiplier(combo);
    previous=event.time;
    holds-=event.ends;
    if(event.hits){combo++;score+=1000*multiplier(combo)}
    holds+=event.starts;
  }
  return Math.round(score);
}

// Five stars are awarded at 90% of a perfect chart score.
export function starProgress(score:number,potential:number):number{
  return potential>0?Math.max(0,Math.min(5,score/potential*5/.9)):0;
}

export function starRating(score:number,potential:number):number{
  return Math.floor(starProgress(score,potential)+1e-8);
}
