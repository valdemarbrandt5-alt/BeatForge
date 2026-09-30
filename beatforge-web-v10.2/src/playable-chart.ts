import {assignPhraseLanes} from './phrase-lanes.ts';
import {clearHoldDuration} from './hold-duration.ts';
import type {ChartInstrument} from './chart-instruments';

type Difficulty='Easy'|'Medium'|'Hard'|'Expert';
export type PlayableNote={id:number,time:number,lane:number,duration?:number,hit?:boolean,miss?:boolean,holding?:boolean,completed?:boolean};

/** Keep the measured sustain on one finger and route new attacks around it. */
export function buildPlayableChart(source:PlayableNote[],lanes:number,diff:Difficulty,instrument:ChartInstrument):PlayableNote[]{
  const keep={Easy:.38,Medium:.62,Hard:.82,Expert:1}[diff];
  const minHold={vocals:.6,melody:.72,bass:.76,drums:.9,mix:.9}[instrument];
  const ordered=[...source].sort((a,b)=>a.time-b.time||(b.duration||0)-(a.duration||0));
  // Lower difficulties thin out taps, but keep the long note they decorate.
  const kept=assignPhraseLanes(ordered.filter((n,i)=>clearHoldDuration(n.duration,minHold)>0||keep===1||((i*37)%100)/100<keep),lanes);
  const blocked=Array(lanes).fill(-Infinity) as number[];
  const built:PlayableNote[]=[];
  const cfg={Easy:{chord:0,triple:0},Medium:{chord:35,triple:0},Hard:{chord:25,triple:0},Expert:{chord:18,triple:97}}[diff];
  kept.forEach((n,i)=>{
    const seed=(((i+1)*1103515245+Math.round(n.time*1000)*12345)>>>0);
    const preferred=((n.lane%lanes)+lanes)%lanes;
    const order=[preferred,...Array.from({length:lanes},(_,x)=>x).filter(x=>x!==preferred)];
    const available=order.filter(x=>blocked[x]<=n.time-.08);
    // Never put a fresh hit under a finger that must still be held down.
    if(!available.length)return;
    const lane=available[0];
    // A later attack cannot shorten a measured hold. If every lane is held,
    // that later attack is omitted until a lane becomes free.
    const dur=clearHoldDuration(n.duration,minHold);
    blocked[lane]=n.time+dur;
    const base:PlayableNote={...n,lane,duration:dur||undefined,hit:false,miss:false,holding:false,completed:false};
    built.push(base);
    const chordEvery=instrument==='vocals'?0:instrument==='mix'&&diff==='Expert'?4:cfg.chord;
    const nextIsChord=kept[i+1]&&kept[i+1].time-n.time<.08;
    const wantsChord=!!chordEvery&&!nextIsChord&&lanes>=3&&i>1&&i<kept.length-1&&seed%chordEvery===0;
    if(wantsChord){
      const free=available.filter(x=>x!==lane);
      if(free.length){
        const chordLane=free[(seed>>>8)%free.length];
        built.push({...base,lane:chordLane,duration:undefined});
        blocked[chordLane]=n.time;
        const tripleEvery=instrument==='mix'&&diff==='Expert'?43:cfg.triple;
        if(tripleEvery&&lanes>=4&&seed%tripleEvery===0){
          const third=free.filter(x=>x!==chordLane);
          if(third.length){
            const thirdLane=third[(seed>>>13)%third.length];
            built.push({...base,lane:thirdLane,duration:undefined});
            blocked[thirdLane]=n.time;
          }
        }
      }
    }
  });
  return built.sort((a,b)=>a.time-b.time||a.lane-b.lane).map((n,id)=>({...n,id}));
}
