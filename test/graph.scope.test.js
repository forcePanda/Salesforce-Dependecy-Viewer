'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {projectScope}=require('../src/graph-scope');
const {buildAdjacency}=require('../src/analyzer');
const {createNavigationHistory,scopeLabel}=require('../media/navigation-history');
const {labelFontSize}=require('../media/graph-highlights');
const nodes=[
  {id:'ApexClass:Billing',name:'Billing',type:'ApexClass'},
  {id:'CustomField:Invoice__c.Amount__c',name:'Invoice__c.Amount__c',type:'CustomField'},
  {id:'Flow:InvoiceFlow',name:'InvoiceFlow',type:'Flow'},
  {id:'ApexClass:Unrelated',name:'Unrelated',type:'ApexClass'},
  {id:'CustomObject:Account',name:'Account',type:'CustomObject'},
  {id:'UnresolvedCustomField:Invoice__c.External__c',name:'Invoice__c.External__c',type:'CustomField',unresolved:true}
];
const edges=[
  {source:nodes[0].id,target:nodes[1].id,relation:'READS'},
  {source:nodes[2].id,target:nodes[0].id,relation:'INVOKES'},
  {source:nodes[0].id,target:nodes[5].id,relation:'UNRESOLVED_REFERENCE',unresolved:true},
  {source:nodes[3].id,target:nodes[4].id,relation:'REFERENCES'}
];
const graph={nodes,edges,adjacency:buildAdjacency(edges),sourceToIds:{'main/default/classes/Billing.cls':[nodes[0].id],'main/default/flows/InvoiceFlow.flow-meta.xml':[nodes[2].id]}};
test('org overview starts completely blank with no selected nodes or edges',()=>{
  const view=projectScope(graph,{kind:'org',focus:[]},{kind:'base'},1200);
  assert.deepEqual(view.nodes,[]);assert.deepEqual(view.edges,[]);
  assert.deepEqual(view.selected,[]);assert.equal(view.mode,'org');
});
test('type selection queries complete graph and includes one-hop neighbor types but not unrelated branches',()=>{
  const view=projectScope(graph,{kind:'org'},{kind:'types',types:['Flow']},1200);
  assert.deepEqual(view.nodes.map(n=>n.id).sort(),[nodes[0].id,nodes[2].id].sort());
  assert.deepEqual(view.edges.map(e=>e.relation),['INVOKES']);
  assert.equal(view.selected.includes(nodes[2].id),true);
});
test('type selection includes verified and unresolved neighbors, without promoting unrelated provisional nodes',()=>{
  const view=projectScope(graph,{kind:'org'},{kind:'types',types:['ApexClass']},1200);
  assert.ok(view.nodes.some(n=>n.id===nodes[5].id&&n.unresolved));
  assert.ok(view.edges.some(e=>e.unresolved));
  assert.equal(view.edges.some(e=>e.source===nodes[1].id&&e.target===nodes[2].id),false);
});
test('type count is not confused with partial overview sample and empty selection stays empty',()=>{
  assert.equal(projectScope(graph,{kind:'org'},{kind:'types',types:[]}).nodes.length,0);
  const capped=projectScope(graph,{kind:'org'},{kind:'types',types:['ApexClass']},2);
  assert.equal(capped.limited,true);assert.equal(capped.nodes.length,2);
  assert.ok(capped.nodes.every(n=>n.type==='ApexClass'),'anchors prioritized before neighbors');
});
test('specific source file loads a complete one-hop neighborhood, and unrelated files are excluded',()=>{
  const view=projectScope(graph,{kind:'org'},{kind:'file',file:'main/default/classes/Billing.cls'});
  assert.deepEqual(new Set(view.nodes.map(n=>n.id)),new Set([nodes[0].id,nodes[1].id,nodes[2].id,nodes[5].id]));
  assert.ok(view.selected.includes(nodes[0].id));
  assert.equal(view.edges.length,3);
  assert.equal(projectScope(graph,{kind:'org'},{kind:'file',file:'../outside/classes/Billing.cls'}).nodes.length,0);
});
test('file-initiated command preserves baseline and reverse dependencies',()=>{
  const ctx={kind:'in',focus:[nodes[0].id]};
  const view=projectScope(graph,ctx,{kind:'base'});
  assert.deepEqual(new Set(view.nodes.map(n=>n.id)),new Set([nodes[0].id,nodes[2].id]));
  assert.equal(view.mode,'in');
});
test('navigation trail returns to the original file, and forward branch is truncated',()=>{
  const history=createNavigationHistory({kind:'base'});
  history.push({kind:'file',file:'main/default/classes/Billing.cls'});
  history.push({kind:'focus',id:nodes[1].id,direction:'both',depth:1});
  assert.equal(history.back().kind,'file');
  assert.equal(history.back().kind,'base');
  assert.equal(history.forward().kind,'file');
  history.push({kind:'focus',id:nodes[2].id,direction:'both',depth:1});
  assert.equal(history.canForward(),false);
  assert.equal(history.home().kind,'base');
  assert.equal(scopeLabel({kind:'file',file:'main/default/classes/Billing.cls'}),'Billing.cls');
});
test('navigation history has a bounded size and does not duplicate current scope',()=>{
  const history=createNavigationHistory();
  assert.equal(history.push({kind:'base'}),false);
  for(let i=0;i<150;i++)history.push({kind:'focus',id:'ApexClass:C'+i});
  assert.equal(history.entries().length,80);
  assert.equal(history.canBack(),true);
  assert.equal(history.go(999),null);
});
test('node label font scales with zoom and is clamped to legible limits',()=>{
  const samples=[0.08,0.2,0.5,1,2,4].map(k=>labelFontSize(k,{selected:true}));
  assert.ok(samples.every((n,i)=>i===0||n>=samples[i-1]));
  assert.ok(samples[0]<samples[3]&&samples[3]<samples[5]);
  assert.ok(samples[0]>=5&&samples[5]<=17);
});
test('VSIX packager and webview load the new graph projector and navigation history',()=>{
  const fs=require('node:fs'),path=require('node:path');
  const ext=fs.readFileSync(path.resolve(__dirname,'../src/extension.js'),'utf8');
  const packageScript=fs.readFileSync(path.resolve(__dirname,'../scripts/package_vsix.py'),'utf8');
  const ui=fs.readFileSync(path.resolve(__dirname,'../media/app.js'),'utf8');
  assert.match(ext,/projectScope\(graph,context,scope,maxNodes\)/);
  assert.match(ext,/uri\('navigation-history\.js'\)/);
  assert.match(packageScript,/for dirname in \('src', 'media', 'rules'\)/);
  assert.ok(fs.existsSync(path.resolve(__dirname,'../src/graph-scope.js')));
  assert.ok(fs.existsSync(path.resolve(__dirname,'../media/navigation-history.js')));
  assert.match(ui,/id="show-labels"/);
  assert.match(ui,/id="file-search"/);
  assert.match(ui,/id="history-home"/);
});
