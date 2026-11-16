'use strict';
/** A hand-curated independent dependency oracle, not graph-generated snapshots. */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const {AnalysisService,neighborhood}=require('../src/analyzer');
const base=path.resolve(__dirname,'../fixtures/enterprise/force-app');
const expected=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../fixtures/enterprise/expected-dependencies.json'),'utf8'));
let graph;
async function load(){if(!graph)graph=await new AnalysisService().analyze(base);return graph;}
function getEdge(g,source,relation,target){return g.edges.find(e=>e.source===source&&e.target===target&&e.relation===relation);}

test('enterprise repository: coverage and independent golden dependency oracle',async t=>{
  const g=await load();
  await t.test('complete non-errored source scan',()=>{
    for(const [metric,min] of Object.entries(expected.expectedStats)){
      if(metric.startsWith('min'))assert.ok(g.stats[metric.slice(3).toLowerCase()]>=min,`${metric}: ${JSON.stringify(g.stats)}`);
      else assert.equal(g.stats[metric],min,metric);
    }
    assert.ok(new Set(g.nodes.map(n=>n.type)).size>=35);
  });
  await t.test('only in-scope files contribute nodes and edges',()=>{
    assert.ok(!g.nodes.some(n=>/Outside_(Metadata|Nearby)/.test(n.id)));
    assert.ok(!g.edges.some(e=>/Outside_(Metadata|Nearby)/.test(e.source+e.target)));
    assert.ok(g.nodes.every(n=>n.sources.every(p=>!p.startsWith('../')&&!path.isAbsolute(p))));
  });
  await t.test('all graph edges resolve to indexed components',()=>{
    const ids=new Set(g.nodes.map(n=>n.id));
    assert.equal(ids.size,g.nodes.length);
    assert.ok(g.edges.every(e=>ids.has(e.source)&&ids.has(e.target)));
  });
  for(const [source,relation,target,rule] of expected.positive){
    await t.test(`MUST detect ${rule}: ${source} → ${target}`,()=>{
      const e=getEdge(g,source,relation,target);
      assert.ok(e,`Expected ${source} -[${relation}]-> ${target}`);
      const evidence=e.evidence.filter(x=>x.rule===rule);
      assert.ok(evidence.length,`Missing ${rule} evidence on ${e.id}`);
      for(const ev of evidence){
        assert.ok(ev.file&&ev.line>=1&&ev.property&&ev.confidence,`Incomplete evidence ${JSON.stringify(ev)}`);
        assert.ok(!ev.file.startsWith('../'),'escaped source in evidence');
      }
    });
  }
  for(const [source,relation,target,reason] of expected.negative){
    await t.test(`MUST NOT detect: ${reason}`,()=>{
      assert.equal(getEdge(g,source,relation,target),undefined,`${source} -[${relation}]-> ${target} is a false positive`);
    });
  }
  await t.test('unresolved references are preserved rather than discarded',()=>{
    const actual=g.unresolved.map(u=>[u.source,u.targetType,u.targetName,u.rule].join('|')).sort();
    const wanted=expected.unresolvedTargets.map(x=>x.join('|')).sort();
    assert.deepEqual(actual,wanted);
    assert.ok(g.unresolved.every(u=>u.line>0&&u.file&&u.reason));
  });
  await t.test('same source/target may carry different semantic edge kinds',()=>{
    const edges=g.edges.filter(e=>e.source==='Flow:Calculate_Tax'&&e.target==='CustomObject:Invoice__c');
    assert.ok(edges.some(e=>e.relation==='TRIGGERS_ON'));
    assert.ok(edges.some(e=>e.relation==='ACCESSES_OBJECT'));
  });
  await t.test('one edge aggregates all source evidence for repeated references',()=>{
    const e=getEdge(g,'Flow:Calculate_Tax','ACCESSES_OBJECT','CustomObject:Invoice__c');
    assert.ok(e.evidence.length>=2);
    assert.equal(g.edges.filter(edge=>edge.source===e.source&&edge.target===e.target&&edge.relation===e.relation).length,1);
  });
  await t.test('nested metadata fields have canonical unique names',()=>{
    const embedded=g.nodes.find(x=>x.id==='CustomField:Invoice__c.Embedded__c');
    assert.equal(embedded.file,'main/default/objects/Invoice__c/Invoice__c.object-meta.xml');
    assert.ok(g.nodes.some(x=>x.id==='RecordType:Invoice__c.Legacy'));
  });
  await t.test('bundle files are merged into one component identity',()=>{
    const bundle=g.nodes.find(x=>x.id==='LightningComponentBundle:invoiceDashboard');
    assert.ok(bundle.sources.some(x=>x.endsWith('.js')));
    assert.ok(bundle.sources.some(x=>x.endsWith('.html')));
    assert.ok(bundle.sources.some(x=>x.endsWith('-meta.xml')));
    assert.equal(g.nodes.filter(n=>n.id===bundle.id).length,1);
  });
  await t.test('sourceToIds maps enclosing object file to embedded child nodes',()=>{
    const ids=g.sourceToIds['main/default/objects/Invoice__c/Invoice__c.object-meta.xml'];
    assert.ok(ids.includes('CustomObject:Invoice__c'));
    assert.ok(ids.includes('CustomField:Invoice__c.Embedded__c'));
    assert.ok(ids.includes('ValidationRule:Invoice__c.Must_Have_Number'));
  });
  await t.test('direct reverse references are not confused with indirect ones',()=>{
    const result=neighborhood(g,['CustomField:Invoice__c.Amount__c'],'in',1,false);
    const ids=new Set(result.nodes.map(n=>n.id));
    assert.ok(ids.has('Flow:Calculate_Tax'));
    assert.ok(ids.has('PermissionSet:Invoice_Manager'));
    assert.ok(ids.has('CustomField:Invoice__c.Total__c'));
    assert.ok(!ids.has('Dashboard:Finance/Finance_Overview'));
  });
  await t.test('cycles terminate and never add synthetic transitive edges',()=>{
    const a='Flow:Calculate_Tax',b='Flow:Notify_Accounting';
    const result=neighborhood(g,[a],'out',100,false);
    assert.ok(result.nodes.length<=g.nodes.length);
    assert.ok(result.nodes.some(n=>n.id===b));
    assert.equal(g.edges.filter(e=>e.source===a&&e.target===a).length,0);
  });
  await t.test('both-direction graph neighborhood respects depth',()=>{
    const center='ApexClass:TaxCalculator';
    const result=neighborhood(g,[center],'both',1,false);
    const ids=new Set(result.nodes.map(n=>n.id));
    assert.ok(ids.has('ApexClass:HelperClass'),'outgoing neighbor');
    assert.ok(ids.has('ApexClass:BillingService'),'incoming neighbor');
    assert.ok(ids.has('Flow:Calculate_Tax'),'incoming flow neighbor');
  });
});
