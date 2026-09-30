type Event={frame:number,time:number};

/** Match backend/sustain.py for browser-generated full mix charts. */
export function sustainNotes(events:Event[],envelope:ArrayLike<number>,secondsPerFrame:number,minHold:number,pitches?:ArrayLike<number>,splitAttacks=false,sustainedFloorRatio?:number,onsetStrength?:ArrayLike<number>):{index:number,duration:number}[]{
  if(!events.length||!envelope.length)return [];
  const dt=secondsPerFrame;
  let maximum=0;
  for(let i=0;i<envelope.length;i++)maximum=Math.max(maximum,envelope[i]);
  const noiseFloor=maximum*.012,grace=Math.max(1,Math.round(.085/dt)),maxFrames=Math.round(3/dt);
  let activeStart=-1,activeEnd=-1,lastTap=-Infinity;
  let activeResult=-1;
  const result:{index:number,duration:number}[]=[];
  const window=(values:ArrayLike<number>,frame:number,start:number,end:number)=>Array.from({length:Math.max(0,Math.min(values.length,frame+Math.round(end/dt))-Math.max(0,frame+Math.round(start/dt)))},(_,i)=>values[Math.max(0,frame+Math.round(start/dt))+i]);
  const quantile=(values:number[],q:number)=>{
    if(!values.length)return 0;
    const ordered=[...values].sort((a,b)=>a-b),at=(ordered.length-1)*q,left=Math.floor(at);
    return ordered[left]+(ordered[Math.ceil(at)]-ordered[left])*(at-left);
  };
  const middle=(values:number[])=>quantile(values,.5);
  const restarts=new Set<number>();
  if(splitAttacks)for(const {frame} of events){
    const shoulder=middle(window(envelope,frame,-.20,-.08));
    const low=quantile(window(envelope,frame,-.065,.01),.25),after=middle(window(envelope,frame,.02,.10));
    if(shoulder>noiseFloor&&low<shoulder*.65&&after>Math.max(noiseFloor,low*1.8))restarts.add(frame);
  }
  const isInflection=(frame:number)=>{
    if(pitches){
      const before=window(pitches,frame,-.16,-.04).filter(x=>x>0),after=window(pitches,frame,.04,.16).filter(x=>x>0);
      if(before.length>=2&&after.length>=2){
        const left=middle(before),right=middle(after),change=Math.abs(1200*Math.log2(right/left));
        const spread=Math.max(middle(before.map(x=>Math.abs(1200*Math.log2(x/left)))),middle(after.map(x=>Math.abs(1200*Math.log2(x/right)))));
        if(change>=120&&spread<70)return true;
      }
    }
    const before=middle(window(envelope,frame,-.18,-.09)),after=middle(window(envelope,frame,.03,.12));
    const valley=window(envelope,frame,-.09,.025);
    return valley.length>0&&Math.min(before,after)>noiseFloor*2&&Math.min(...valley)<Math.min(before,after)*.5;
  };
  const lastingPitchChange=(frame:number)=>{
    if(!pitches)return false;
    const before=window(pitches,frame,-.18,-.06).filter(x=>x>0);
    const after=window(pitches,frame,.10,.27).filter(x=>x>0);
    const later=window(pitches,frame,.27,.42).filter(x=>x>0);
    if(Math.min(before.length,after.length,later.length)<2)return false;
    const old=middle(before),next=middle(after),still=middle(later);
    const cents=(a:number,b:number)=>Math.abs(1200*Math.log2(a/b));
    return cents(next,old)>=240&&cents(still,next)<90&&middle(after.map(x=>cents(x,next)))<70;
  };
  const newSyllable=(frame:number)=>{
    if(!onsetStrength)return false;
    const before=middle(window(envelope,frame,-.16,-.06)),after=middle(window(envelope,frame,.02,.09));
    const nearby=middle(window(onsetStrength,frame,-.20,-.06));
    return before>noiseFloor&&after>before*1.28&&onsetStrength[frame]>Math.max(noiseFloor,nearby*1.8);
  };
  events.forEach(({frame},index)=>{
    const before=middle(window(envelope,frame,-.06,-.015)),after=middle(window(envelope,frame,.02,.07));
    if(activeEnd>=0&&Math.abs(frame-activeEnd)*dt<.1&&before>noiseFloor&&after<Math.max(noiseFloor,before*.15))return;
    if(frame<=activeEnd){
      const elapsed=(frame-activeStart)*dt,remaining=(activeEnd-frame)*dt;
      if(!splitAttacks&&activeResult>=0&&elapsed>=minHold&&remaining>=minHold&&(frame-lastTap)*dt>=.35&&lastingPitchChange(frame)){
        result[activeResult].duration=Math.min(3,elapsed+.08);
        result.push({index,duration:Math.min(3,remaining-.06)});
        activeResult=result.length-1;activeStart=lastTap=frame;
        return;
      }
      if((frame-activeStart)*dt>=.25&&(activeEnd-frame)*dt>=.12&&(frame-lastTap)*dt>=.28&&isInflection(frame)){
        result.push({index,duration:0});lastTap=frame;
      }
      return;
    }
    const level=quantile(window(envelope,frame,0,.12),.7)||envelope[frame],floor=Math.max(noiseFloor,level*.35);
    let lastActive=frame,quiet=0;
    for(let current=frame+1;current<Math.min(envelope.length,frame+maxFrames+1);current++){
      if(restarts.has(current))break;
      if(envelope[current]>floor){lastActive=current;quiet=0;}else if(++quiet>grace)break;
    }
    if(sustainedFloorRatio!==undefined&&lastActive>frame){
      const supportFloor=Math.max(noiseFloor,level*sustainedFloorRatio);
      const supportGrace=Math.max(grace,Math.round(.12/dt)),warmup=Math.round(.16/dt);
      let lastSupported=frame,unsupported=0;
      for(let current=frame+1;current<=lastActive;current++){
        if(envelope[current]>supportFloor){lastSupported=current;unsupported=0;}
        else if(current-frame>warmup&&++unsupported>supportGrace)break;
      }
      lastActive=lastSupported;
    }
    const raw=(lastActive-frame)*dt,duration=raw>=minHold?Math.min(3,raw-.06):0;
    result.push({index,duration});
    if(duration){activeStart=frame;activeEnd=lastActive;lastTap=frame;activeResult=result.length-1;}
  });
  return result;
}
