'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {AnalysisService}=require('../src/analyzer');
const {withUnresolvedReferenceNodes}=require('../src/presentation');
const {graphViewModel}=require('../src/graph-view-model');
const {fingerprint}=require('./support/graph-fingerprint');
const {LatestAnalysisController}=require('../src/analysis-controller');
const fixture=path.resolve(__dirname,'../fixtures/enterprise/force-app');
const expected='688030d47d18096d10f788993083a74da0df457b26a624fa02a9252efff8525d';
const xml=(body)=>`<?xml version="1.0"?><Flow xmlns="http://soap.sforce.com/2006/04/metadata">${body}</Flow>`;
async function temporaryProject(fn){
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'sfdv-stable-'));
  const root=path.join(directory,'force-app');
  await fs.mkdir(path.join(root,'main/default/flows'),{recursive:true});
  try{return await fn({root,dir:directory});}finally{await fs.rm(directory,{recursive:true,force:true});}
}
test('v1.0.0 preserves the exact v0.5.0 enterprise semantic graph, edges and source evidence',async()=>{
  const graph=await new AnalysisService().analyze(fixture,{persistIndex:false});
  assert.equal(graph.stats.files,92);
  assert.equal(graph.stats.nodes,94);
  assert.equal(graph.stats.edges,207);
  assert.equal(fingerprint(graph),expected,'Any semantic graph change requires explicit review against v0.5.0 baseline');
});
test('one graph snapshot reuses its unresolved graph, component catalog and file catalog',async()=>{
  const graph=await new AnalysisService().analyze(fixture);
  const a=withUnresolvedReferenceNodes(graph),b=withUnresolvedReferenceNodes(graph);
  assert.strictEqual(a,b);
  const first=graphViewModel(graph),second=graphViewModel(graph);
  assert.strictEqual(first,second);
  assert.strictEqual(first.graph,a);
  assert.ok(first.catalog.some(n=>n.id==='UnresolvedFlow:Deleted_Flow'));
  assert.equal(first.byId.has('CustomField:Invoice__c.Amount__c'),true);
  assert.ok(first.fileCatalog.some(f=>f.file.endsWith('BillingService.cls')));
  const fresh=structuredClone(graph);
  assert.notStrictEqual(graphViewModel(fresh),first,'a new analysis must not reuse stale scope indexes');
});
test('content changes with restored mtime and identical length still invalidate source parsing and graph',async()=>{
  await temporaryProject(async({root,dir})=>{
    const a=path.join(root,'main/default/flows/A.flow-meta.xml');
    const b=path.join(root,'main/default/flows/B.flow-meta.xml');
    await fs.writeFile(a,xml('<subflows><flowName>B</flowName></subflows>'));
    await fs.writeFile(b,xml('<label>B</label>'));
    const svc=new AnalysisService(),options={cacheDir:path.join(dir,'cache')};
    const before=await svc.analyze(root,options);
    assert.ok(before.edges.some(e=>e.source==='Flow:A'&&e.target==='Flow:B'));
    const stat=await fs.stat(a);
    const oldText=await fs.readFile(a,'utf8');
    const changed=oldText.replace('flowName>B','flowName>C');
    assert.equal(changed.length,oldText.length);
    await fs.writeFile(a,changed);
    await fs.utimes(a,stat.atime,stat.mtime);
    const after=await svc.analyze(root,options);
    assert.equal(after.stats.filesParsed,1);
    assert.equal(after.stats.filesReused,1);
    assert.ok(!after.edges.some(e=>e.source==='Flow:A'&&e.target==='Flow:B'));
    assert.ok(after.unresolved.some(u=>u.source==='Flow:A'&&u.targetName==='C'));
    const persisted=await new AnalysisService().analyze(root,options);
    assert.equal(persisted.stats.filesParsed,0);
    assert.ok(persisted.unresolved.some(u=>u.targetName==='C'));
  });
});
test('concurrent analyzer scans are serialized and cannot corrupt shared caches',async()=>{
  await temporaryProject(async({root})=>{
    const a=path.join(root,'main/default/flows/A.flow-meta.xml');
    await fs.writeFile(a,xml('<label>A</label>'));
    const service=new AnalysisService();
    const [first,second,third]=await Promise.all([
      service.analyze(root),service.analyze(root),service.analyze(root,{includeCodeReferences:false})
    ]);
    assert.equal(first.stats.filesParsed,1);
    assert.equal(second.stats.filesParsed,0);
    assert.equal(third.stats.filesParsed,0);
    assert.deepEqual(first.nodes,second.nodes);
    assert.equal(first.nodes.length,third.nodes.length);
  });
});
test('latest-analysis generation suppresses stale commits and invalidates in-flight work',async()=>{
  const ctl=new LatestAnalysisController();
  const first=ctl.begin();
  assert.ok(ctl.isCurrent(first));
  const second=ctl.begin();
  assert.equal(ctl.isCurrent(first),false);
  assert.ok(ctl.isCurrent(second));
  ctl.invalidate();
  assert.equal(ctl.isCurrent(second),false);
  const third=ctl.begin();
  assert.ok(ctl.isCurrent(third));
  ctl.dispose();
  assert.equal(ctl.isCurrent(third),false);
  assert.throws(()=>ctl.begin(),/disposed/);
});
