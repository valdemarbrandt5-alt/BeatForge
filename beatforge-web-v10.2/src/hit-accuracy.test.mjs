import assert from 'node:assert/strict';
import test from 'node:test';
import {hitAccuracy,scoreAccuracy} from './hit-accuracy.ts';

test('Perfect, Great and Good count equally as hits',()=>{
  assert.equal(hitAccuracy({perfect:78,great:0,good:0,miss:22}),78);
  assert.equal(hitAccuracy({perfect:0,great:78,good:0,miss:22}),78);
  assert.equal(hitAccuracy({perfect:0,great:0,good:78,miss:22}),78);
});

test('accuracy only changes when a note is missed',()=>{
  assert.equal(hitAccuracy({perfect:20,great:30,good:45,miss:5}),95);
  assert.equal(hitAccuracy({perfect:0,great:0,good:0,miss:0}),0);
});

test('profile corrects an old weighted percentage using stored note hits',()=>{
  assert.equal(scoreAccuracy({perfect:339,great:122,good:28,miss:4,accuracy:94.1}),99.2);
  assert.equal(scoreAccuracy({perfect:0,great:0,good:0,miss:0,accuracy:94.1}),94.1);
});
