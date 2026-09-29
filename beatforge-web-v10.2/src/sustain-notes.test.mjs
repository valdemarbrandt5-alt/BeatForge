import assert from 'node:assert/strict';
import test from 'node:test';
import {sustainNotes} from './sustain-notes.ts';

test('stable new pitch hands a hold to a new lane, vibrato stays on one',()=>{
  const envelope=Array.from({length:250},(_,frame)=>frame>=20&&frame<220?1:0);
  const events=[{frame:20,time:.2},{frame:105,time:1.05}];
  const shifted=Array.from({length:250},(_,frame)=>frame<105?330:330*2**(320/1200));
  const handoff=sustainNotes(events,envelope,.01,.6,shifted);
  assert.equal(handoff.filter(n=>n.duration>0).length,2);
  assert.ok(events[0].time+handoff[0].duration>events[1].time);
  const vibrato=Array.from({length:250},(_,frame)=>330*2**(45*Math.sin(frame*.32)/1200));
  assert.equal(sustainNotes(events,envelope,.01,.6,vibrato).filter(n=>n.duration>0).length,1);
});
