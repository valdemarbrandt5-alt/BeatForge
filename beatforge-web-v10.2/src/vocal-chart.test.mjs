import assert from 'node:assert/strict';
import test from 'node:test';
import {assignPhraseLanes} from './phrase-lanes.ts';

test('vocal motifs return to the same lanes and use the full keyboard',()=>{
 const phrase=[0,.28,.6,.91,1.4];
 const filler=[2.1,2.38,2.71,3.04,3.45,3.78,4.15];
 const notes=[...phrase,...filler,...phrase.map(t=>t+8.2)].map((time,id)=>({time,lane:id%5}));
 const lanes=assignPhraseLanes(notes,5).map(n=>n.lane);
 assert.deepEqual(lanes.slice(0,5),lanes.slice(-5));
 assert.equal(new Set(lanes).size,5);
});

test('consecutive vocal syllables change fingers rather than grouping by lane',()=>{
 const notes=Array.from({length:40},(_,id)=>({time:id*.25,lane:0}));
 const lanes=assignPhraseLanes(notes,5).map(n=>n.lane);
 assert.equal(new Set(lanes.slice(0,10)).size,5);
 assert.ok(lanes.every((lane,id)=>id===0||lane!==lanes[id-1]));
});
