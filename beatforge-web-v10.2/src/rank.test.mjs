import assert from 'node:assert/strict';
import test from 'node:test';
import {rankInfo,challengerPosition} from './rank.ts';

test('Master, Grandmaster and Challenger have distinct MMR ranges',()=>{
  assert.equal(rankInfo(1799).name,'MASTER');
  assert.equal(rankInfo(1800).name,'GRANDMASTER');
  assert.equal(rankInfo(1999).next,2000);
  assert.equal(rankInfo(2000).name,'CHALLENGER');
});

test('Challenger world placement counts stronger players and stable ties',async()=>{
  const db={from:()=>({select:()=>({gt:async()=>({count:3,error:null}),eq:()=>({lt:async()=>({count:2,error:null})})})})};
  assert.equal(await challengerPosition(db,'player',2050),6);
  assert.equal(await challengerPosition(db,'player',1999),null);
});
