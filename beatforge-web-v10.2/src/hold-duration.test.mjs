import assert from 'node:assert/strict';
import test from 'node:test';
import {clearHoldDuration} from './hold-duration.ts';

test('ordinary taps and fabricated spans never become holds',()=>{
  assert.equal(clearHoldDuration(undefined,2,0),0);
  assert.equal(clearHoldDuration(.7,2,0),0);
  assert.equal(clearHoldDuration(1.4,.8,0),0);
});

test('a sustained isolated note stays playable without crossing the next attack',()=>{
  assert.equal(clearHoldDuration(1.8,3,0),1.8);
  assert.equal(clearHoldDuration(2,1.5,0),1.42);
  assert.equal(clearHoldDuration(4,undefined,0),3);
});
