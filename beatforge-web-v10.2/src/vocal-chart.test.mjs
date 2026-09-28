import assert from 'node:assert/strict';
import test from 'node:test';
import {spaceVocalOnsets} from './vocal-chart.ts';
import {assignPhraseLanes} from './phrase-lanes.ts';

test('near-duplicate vocal attacks become a single hit while phrase gaps remain',()=>{
 const notes=[0,.11,.31,.39,1.1,1.41].map((time,id)=>({id,time}));
 assert.deepEqual(spaceVocalOnsets(notes).map(n=>n.time),[0,.31,1.1,1.41]);
 assert.equal(notes.length,6);
});

test('vocal motifs return to the same lanes and use the full keyboard',()=>{
 const phrase=[0,.28,.6,.91,1.4];
 const filler=[2.1,2.38,2.71,3.04,3.45,3.78,4.15];
 const notes=[...phrase,...filler,...phrase.map(t=>t+8.2)].map((time,id)=>({time,lane:id%5}));
 const lanes=assignPhraseLanes(notes,5,true).map(n=>n.lane);
 assert.deepEqual(lanes.slice(0,5),lanes.slice(-5));
 assert.equal(new Set(lanes).size,5);
});
