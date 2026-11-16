'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {highlightedNodeIds,shouldDrawLabel}=require('../media/graph-highlights');

test('a selected node and every directly highlighted neighbor show names even zoomed out',()=>{
  const edges=[{source:'A',target:'B'},{source:'C',target:'A'},{source:'C',target:'D'}];
  const names=highlightedNodeIds('A',null,edges);
  assert.deepEqual([...names].sort(),['A','B','C']);
  for(const id of names)assert.equal(shouldDrawLabel({id,degree:1},names,0.08,4000),true,id);
  assert.equal(shouldDrawLabel({id:'D',degree:1},names,0.08,4000),false);
});

test('hovering an unselected node also names its neighbors',()=>{
  const highlighted=highlightedNodeIds(null,'D',[{source:'C',target:'D'}]);
  assert.deepEqual([...highlighted].sort(),['C','D']);
  for(const id of ['C','D'])assert.ok(shouldDrawLabel({id,degree:1},highlighted,0.1,2000));
});

test('normal graph labels remain zoom/degree dependent; no highlight produces no forced labels',()=>{
  const none=highlightedNodeIds(null,null,[{source:'A',target:'B'}]);
  assert.equal(none.size,0);
  assert.equal(shouldDrawLabel({id:'A',degree:1},none,1,100),false);
  assert.equal(shouldDrawLabel({id:'A',degree:2},none,1,100),true);
  assert.equal(shouldDrawLabel({id:'A',degree:3},none,0.1,100),false);
});

test('webview loads the shared highlight logic before graph app',()=>{
  const js=fs.readFileSync(path.join(__dirname,'../src/extension.js'),'utf8');
  const helper=js.indexOf('uri(\'graph-highlights.js\')');
  const app=js.indexOf('uri(\'app.js\')');
  assert.ok(helper>=0&&app>helper);
  assert.match(fs.readFileSync(path.join(__dirname,'../media/app.js'),'utf8'),/shouldDrawLabel\(n,neighbors,k,filteredNodes.length\)/);
});

test('selecting a component from capped overview requests complete neighborhood instead of hiding its fields',()=>{
  const js=fs.readFileSync(path.join(__dirname,'../media/app.js'),'utf8');
  assert.match(js,/if\(state\.data\?\.limited\)jump\(id,'both',1\)/);
});
