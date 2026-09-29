import assert from 'node:assert/strict';
import test from 'node:test';
import {sustainNotes} from './sustain-notes.ts';

const dt=.01;
const events=[50,70,90,110,130,150,170,190].map(frame=>({frame,time:frame*dt}));
const voiced=(i)=>i>=50&&i<210;

test('normal pitch and volume vibrato remains one hold without tap spam',()=>{
  const envelope=Array.from({length:300},(_,i)=>voiced(i)?.7*(1+.18*Math.sin(2*Math.PI*5*i*dt)):0);
  const pitch=envelope.map((_,i)=>330*2**(45*Math.sin(2*Math.PI*5*i*dt)/1200));
  const notes=sustainNotes(events,envelope,dt,.68,pitch);
  assert.equal(notes.length,1);
  assert.ok(notes[0].duration>1.45);
});

test('a clear sung pitch break adds a tap while its original hold continues',()=>{
  const envelope=Array.from({length:300},(_,i)=>voiced(i)?.7:0);
  const pitch=envelope.map((_,i)=>i<110?330:370);
  const notes=sustainNotes(events,envelope,dt,.68,pitch);
  assert.equal(notes.length,2);
  assert.ok(notes[0].duration>1.45);
  assert.deepEqual(notes[1],{index:3,duration:0});
});

test('an expressive short volume break adds a tap without ending the vowel',()=>{
  const envelope=Array.from({length:300},(_,i)=>voiced(i)?.7*(1-.8*Math.exp(-(((i-108)/2)**2))):0);
  const notes=sustainNotes(events,envelope,dt,.68);
  assert.equal(notes.length,2);
  assert.ok(notes[0].duration>1.45);
  assert.equal(notes[1].duration,0);
});

test('a genuine pause splits two held syllables',()=>{
  const envelope=Array.from({length:300},(_,i)=>(i>=50&&i<130)||(i>=160&&i<245)?.7:0);
  const notes=sustainNotes([{frame:50,time:.5},{frame:160,time:1.6}],envelope,dt,.68);
  assert.equal(notes.length,2);
  assert.ok(notes[0].duration<.8&&notes[1].duration<.85);
  assert.ok(notes.every(n=>n.duration>.6));
});
