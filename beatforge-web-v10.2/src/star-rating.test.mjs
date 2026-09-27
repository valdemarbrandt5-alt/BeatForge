import assert from 'node:assert/strict';
import test from 'node:test';
import {chartScorePotential,starProgress,starRating} from './star-rating.ts';

test('five stars start at ninety percent of the perfect chart score',()=>{
  const notes=Array.from({length:10},(_,time)=>({time}));
  const potential=chartScorePotential(notes);
  assert.equal(potential,11000);
  assert.equal(starRating(9899,potential),4);
  assert.equal(starRating(9900,potential),5);
  assert.equal(starProgress(potential,potential),5);
});

test('holds add to the potential while the combo multiplier rises',()=>{
  assert.equal(chartScorePotential([{time:0,duration:1}]),1250);
  assert.equal(chartScorePotential([{time:0,duration:2},{time:1}]),2500);
});
