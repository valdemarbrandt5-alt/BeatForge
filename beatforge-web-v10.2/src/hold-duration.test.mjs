import assert from 'node:assert/strict';
import test from 'node:test';
import {clearHoldDuration} from './hold-duration.ts';
import {buildPlayableChart} from './playable-chart.ts';

test('missing, invalid and short measured durations remain taps',()=>{
  for(const duration of [undefined,NaN,Infinity,-1,0,.7])assert.equal(clearHoldDuration(duration),0);
  assert.equal(clearHoldDuration(.72,.6),.72);
});

test('a two second hold survives while other fingers tap on all difficulties',()=>{
  const source=[{id:0,time:1,lane:0,duration:2},...Array.from({length:8},(_,i)=>({id:i+1,time:1.25+i*.2,lane:0}))];
  for(const difficulty of ['Easy','Medium','Hard','Expert']){
    for(const lanes of [3,4,5]){
      const built=buildPlayableChart(source,lanes,difficulty,'vocals');
      const held=built.find(n=>n.duration);
      assert.equal(held?.duration,2);
      assert.ok(built.length>1);
      assert.ok(built.filter(n=>n!==held&&n.time<3).every(n=>n.lane!==held.lane));
      if(difficulty==='Expert')assert.equal(built.length,source.length);
    }
  }
});

test('polyphonic holds preserve their lengths and later taps use released lanes',()=>{
  const source=[...Array.from({length:5},(_,i)=>({id:i,time:1+i*.01,lane:i,duration:2})),
    ...Array.from({length:80},(_,i)=>({id:i+5,time:1.2+i*.15,lane:i%5}))];
  for(const lanes of [3,4,5]){
    const built=buildPlayableChart(source,lanes,'Expert','melody');
    assert.ok(built.some(n=>n.time>3.2&&!n.duration));
    for(const held of built.filter(n=>n.duration)){
      assert.equal(built.filter(n=>n!==held&&n.lane===held.lane&&n.time>=held.time&&n.time<held.time+held.duration+.079).length,0);
    }
    assert.equal(new Set(built.map(n=>`${n.time}:${n.lane}`)).size,built.length);
  }
});

test('difficulty thinning keeps a measured hold even at an otherwise discarded index',()=>{
  const source=Array.from({length:6},(_,i)=>({id:i,time:i*.3,lane:i%5,duration:i===2?1.2:undefined}));
  const built=buildPlayableChart(source,5,'Easy','vocals');
  assert.equal(built.find(n=>n.time===.6)?.duration,1.2);
});

test('a new hold remains long when it starts in the last free lane',()=>{
  const source=[{id:0,time:1,lane:0,duration:2},{id:1,time:1.1,lane:1,duration:2},
    {id:2,time:1.2,lane:2,duration:1.4},{id:3,time:1.4,lane:0}];
  const built=buildPlayableChart(source,3,'Expert','vocals');
  assert.equal(built.find(n=>n.time===1.2)?.duration,1.4);
  assert.equal(built.some(n=>n.time===1.4),false);
});
