'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {AnalysisService,neighborhood}=require('../src/analyzer');
const {ReferenceResolver}=require('../src/reference-resolver');
const {cacheFile}=require('../src/persistent-index');
const META='http://soap.sforce.com/2006/04/metadata';
const xml=(type,body='')=>`<?xml version="1.0"?><${type} xmlns="${META}">${body}</${type}>`;
async function withProject(files,fn){
  const work=await fs.mkdtemp(path.join(os.tmpdir(),'sfdv-v040-'));
  const root=path.join(work,'force-app'),cacheDir=path.join(work,'extension-storage');
  async function write(rel,content){const p=path.join(root,'main/default',rel);await fs.mkdir(path.dirname(p),{recursive:true});await fs.writeFile(p,content,'utf8');return p;}
  try{for(const [rel,body] of Object.entries(files))await write(rel,body);return await fn({root,cacheDir,work,write});}
  finally{await fs.rm(work,{recursive:true,force:true});}
}
function edge(graph,source,target,relation){return graph.edges.find(e=>e.source===source&&e.target===target&&e.relation===relation);}
const invoiceFiles={
  'objects/Invoice__c/Invoice__c.object-meta.xml':xml('CustomObject','<label>Invoice</label>'),
  'objects/Invoice__c/fields/Amount__c.field-meta.xml':xml('CustomField','<type>Currency</type>'),
  'objects/Invoice__c/fields/Status__c.field-meta.xml':xml('CustomField','<type>Text</type>'),
  'objects/Payment__c/Payment__c.object-meta.xml':xml('CustomObject','<label>Payment</label>'),
  'objects/Payment__c/fields/Amount__c.field-meta.xml':xml('CustomField','<type>Currency</type>')
};

test('Apex field operations are correctly classified as READS, WRITES, or both',async t=>{
  await withProject({...invoiceFiles,'classes/Accounting.cls':`public class Accounting {
    void apply(Invoice__c inv) {
      Decimal oldTotal = inv.Amount__c;
      inv.Status__c = 'Processed';
      inv.Amount__c += 10;
      Decimal fetched = (Decimal) inv.get('Amount__c');
      inv.put('Status__c', 'Approved');
      update inv;
    }
  }`},async({root})=>{
    const graph=await new AnalysisService().analyze(root);const from='ApexClass:Accounting';
    const amt='CustomField:Invoice__c.Amount__c',stat='CustomField:Invoice__c.Status__c';
    await t.test('reads are edges',()=>assert.ok(edge(graph,from,amt,'READS')));
    await t.test('compound assignment is also a write',()=>assert.ok(edge(graph,from,amt,'WRITES')));
    await t.test('simple assignment writes status',()=>assert.ok(edge(graph,from,stat,'WRITES')));
    await t.test('status is not spuriously read',()=>assert.equal(edge(graph,from,stat,'READS'),undefined));
    await t.test('record update is not a field write',()=>assert.ok(edge(graph,from,'CustomObject:Invoice__c','UPDATES_RECORD')));
    await t.test('same-named Payment field remains unrelated',()=>assert.ok(!graph.edges.some(e=>e.source===from&&e.target==='CustomField:Payment__c.Amount__c')));
    await t.test('reverse lookup sees both field uses',()=>assert.ok(neighborhood(graph,[stat],'in',1).nodes.some(n=>n.id===from)));
  });
});

test('Apex instance invocations resolve through scoped symbols without inventing static calls',async t=>{
  await withProject({
    'classes/WorkerService.cls':'public class WorkerService { public void execute(){} }',
    'classes/OtherService.cls':'public class OtherService { public void execute(){} }',
    'classes/Caller.cls':`public class Caller {
      WorkerService worker;
      void run(WorkerService parameter) {
        WorkerService service = new WorkerService();
        service.execute();
        parameter.execute();
        worker.execute();
        String s = 'OtherService.execute()';
        // OtherService.execute();
      }
    }`,
    'classes/ScopeCase.cls':`public class ScopeCase {
      void one() { WorkerService executor = new WorkerService(); executor.execute(); }
      void two() { OtherService executor = new OtherService(); executor.execute(); }
    }`
  },async({root})=>{
    const g=await new AnalysisService().analyze(root);
    await t.test('typed local, method param and field invoke the correct class',()=>{
      const e=edge(g,'ApexClass:Caller','ApexClass:WorkerService','INVOKES');
      assert.ok(e);assert.ok(e.evidence.some(ev=>ev.rule==='APEX_INSTANCE_CALL'));
    });
    await t.test('comments and strings do not invoke an unrelated class',()=>assert.ok(!edge(g,'ApexClass:Caller','ApexClass:OtherService','INVOKES')));
    await t.test('two lexically scoped variables with same name resolve independently',()=>{
      assert.ok(edge(g,'ApexClass:ScopeCase','ApexClass:WorkerService','INVOKES'));
      assert.ok(edge(g,'ApexClass:ScopeCase','ApexClass:OtherService','INVOKES'));
    });
    await t.test('inverse class lookup includes instance invoker',()=>assert.ok(neighborhood(g,['ApexClass:WorkerService'],'in',1).nodes.some(n=>n.id==='ApexClass:Caller')));
  });
});

test('canonical resolver supports exact, case-folded, versioned, and explicit namespaced references',async t=>{
  const nodes=new Map(['ApexClass:ns__Service','ApexClass:Alpha','ApexClass:alpha','Flow:Notify_Finance','CustomLabel:Invoice_Title','LightningMessageChannel:Updates','CustomMetadata:Config__mdt.Default'].map(id=>[id,{id}]));
  const r=new ReferenceResolver(nodes);
  const cases=[
    ['ApexClass','ns.Service','ApexClass:ns__Service'],
    ['Flow','Notify_Finance-3','Flow:Notify_Finance'],
    ['CustomLabel','c.Invoice_Title','CustomLabel:Invoice_Title'],
    ['LightningMessageChannel','Updates__c','LightningMessageChannel:Updates'],
    ['CustomMetadata','Config.Default','CustomMetadata:Config__mdt.Default']
  ];
  for(const [type,name,id] of cases)await t.test(`${type} ${name}`,()=>assert.deepEqual(r.resolve(type,name),{status:'resolved',id}));
  await t.test('case-insensitive alias cannot override an exact match',()=>assert.deepEqual(r.resolve('ApexClass','Alpha'),{status:'resolved',id:'ApexClass:Alpha'}));
  await t.test('non-exact name matching multiple components is ambiguous',()=>{
    const result=r.resolve('ApexClass','ALPHA');assert.equal(result.status,'ambiguous');assert.equal(result.matches.length,2);
  });
  await t.test('an unqualified class never matches a namespaced class by suffix alone',()=>assert.equal(r.resolve('ApexClass','Service').status,'unresolved'));
});

test('namespaced LWC Apex imports and versioned subflows bind to intended components',async()=>{
  await withProject({
    'classes/ns__Service.cls':'public class ns__Service { public static void run(){} }',
    'flows/Notify_Finance.flow-meta.xml':xml('Flow','<label>Finance</label>'),
    'flows/Caller.flow-meta.xml':xml('Flow','<subflows><name>run</name><flowName>notify_finance-3</flowName></subflows>'),
    'lwc/myWidget/myWidget.js':"import action from '@salesforce/apex/ns.Service.run';"
  },async({root})=>{
    const g=await new AnalysisService().analyze(root);
    assert.ok(edge(g,'LightningComponentBundle:myWidget','ApexClass:ns__Service','INVOKES'));
    assert.ok(edge(g,'Flow:Caller','Flow:Notify_Finance','INVOKES'));
  });
});

test('hybrid inverted identifier search flags unverified code mentions without adding graph edges',async()=>{
  await withProject({
    'classes/HelperClass.cls':'public class HelperClass {}',
    'classes/Logger.cls':`public class Logger {
      void log() {
        System.debug(HelperClass);
        String note = 'HelperClass';
        // HelperClass remains in commented code.
      }
    }`
  },async({root})=>{
    const g=await new AnalysisService().analyze(root);
    assert.ok(!g.edges.some(e=>e.source==='ApexClass:Logger'&&e.target==='ApexClass:HelperClass'));
    const candidates=g.unverifiedCandidates.filter(c=>c.source==='ApexClass:Logger'&&c.target==='ApexClass:HelperClass');
    assert.equal(candidates.length,1);assert.equal(candidates[0].line,3);assert.equal(candidates[0].status,'unverified');
    assert.ok(g.stats.unverified>=1);
  });
});

test('dynamic SOQL and reflection are incomplete, but literal static SOQL is not mistaken for dynamic',async()=>{
  await withProject({...invoiceFiles,
    'classes/Dynamic.cls':`public class Dynamic {
       void run(String name) {
         List<SObject> d = Database.query('SELECT Amount__c FROM Invoice__c');
         List<SObject> q = Database.query('SELECT Amount__c FROM Invoice__c WHERE Status__c = :x' + name);
         List<SObject> r = Database.query(buildQuery());
         Type t = Type.forName(name);
         Type known = Type.forName('MissingService');
       }
     }`
  },async({root})=>{
    const g=await new AnalysisService().analyze(root);
    const found=g.dynamicConstructs.filter(x=>x.source==='ApexClass:Dynamic');
    assert.equal(found.filter(x=>x.kind==='DYNAMIC_SOQL').length,2,JSON.stringify(found));
    assert.equal(found.filter(x=>x.kind==='DYNAMIC_CLASS').length,1);
    assert.equal(g.coverage.status,'partial');
    assert.ok(g.unresolved.some(x=>x.targetType==='ApexClass'&&x.targetName==='MissingService'));
    assert.ok(edge(g,'ApexClass:Dynamic','CustomField:Invoice__c.Amount__c','READS'));
    assert.ok(g.fileCoverage.some(x=>x.file.endsWith('Dynamic.cls')&&x.status==='partial'));
  });
});

test('persisted parsed index survives a new analyzer instance and invalidates only changed files',async t=>{
  await withProject({
    'classes/Referenced.cls':'public class Referenced {}',
    'classes/Caller.cls':'public class Caller { Referenced one; }',
    'flows/A.flow-meta.xml':xml('Flow','<label>A</label>'),
    'flows/B.flow-meta.xml':xml('Flow','<label>B</label><subflows><flowName>A</flowName></subflows>')
  },async({root,cacheDir,write})=>{
    const first=await new AnalysisService().analyze(root,{cacheDir});
    await t.test('first run creates a private cache file',async()=>{
      const f=cacheFile(cacheDir,await fs.realpath(root));const st=await fs.stat(f);
      assert.ok(st.size>0);assert.equal(st.mode&0o777,0o600);
    });
    const second=await new AnalysisService().analyze(root,{cacheDir});
    await t.test('fresh instance reuses parsed XML and code',()=>{
      assert.equal(second.stats.filesParsed,0);assert.equal(second.stats.filesReused,first.stats.files);
      assert.deepEqual(second.edges,first.edges);
      assert.deepEqual(second.nodes,first.nodes);
    });
    await write('classes/Caller.cls','public class Caller { }');
    const third=await new AnalysisService().analyze(root,{cacheDir});
    await t.test('only updated source is reparsed and stale edge removed',()=>{
      assert.equal(third.stats.filesParsed,1);
      assert.ok(!third.edges.some(e=>e.source==='ApexClass:Caller'&&e.target==='ApexClass:Referenced'));
      assert.ok(edge(third,'Flow:B','Flow:A','INVOKES'));
    });
    await fs.rm(path.join(root,'main/default/flows/A.flow-meta.xml'));
    const fourth=await new AnalysisService().analyze(root,{cacheDir});
    await t.test('deleted files invalidate cached nodes and surface unresolved references',()=>{
      assert.ok(!fourth.nodes.some(n=>n.id==='Flow:A'));
      assert.ok(fourth.unresolved.some(u=>u.source==='Flow:B'&&u.targetName==='A'));
    });
    const fifth=await new AnalysisService().analyze(root,{cacheDir,persistIndex:false});
    await t.test('disabled disk cache requires reparse in a fresh process',()=>assert.equal(fifth.stats.filesParsed,fifth.stats.files));
  });
});

test('cache corruption causes a safe rebuild, not silent loss of edges',async()=>{
  await withProject({'flows/A.flow-meta.xml':xml('Flow'), 'flows/B.flow-meta.xml':xml('Flow','<subflows><flowName>A</flowName></subflows>')},async({root,cacheDir})=>{
    await new AnalysisService().analyze(root,{cacheDir});
    await fs.writeFile(cacheFile(cacheDir,await fs.realpath(root)),'corrupt');
    const rebuilt=await new AnalysisService().analyze(root,{cacheDir});
    assert.equal(rebuilt.stats.filesParsed,2);
    assert.ok(rebuilt.diagnostics.some(d=>d.message.includes('Persistent index cannot be read')));
    assert.ok(edge(rebuilt,'Flow:B','Flow:A','INVOKES'));
  });
});

test('rule overrides invalidate resolved graph even when all parsed metadata is cached',async()=>{
  await withProject({'flows/A.flow-meta.xml':xml('Flow'), 'flows/B.flow-meta.xml':xml('Flow','<subflows><flowName>A</flowName></subflows>')},async({root,cacheDir})=>{
    const svc=new AnalysisService();const before=await svc.analyze(root,{cacheDir});
    assert.ok(edge(before,'Flow:B','Flow:A','INVOKES'));
    const changed=await svc.analyze(root,{cacheDir,customRules:[{id:'FLOW_SUBFLOW',sourceType:'Flow',path:'subflows.flowName',targetType:'Flow',relation:'CUSTOM_CALL'}]});
    assert.equal(changed.stats.filesParsed,0);
    assert.ok(edge(changed,'Flow:B','Flow:A','CUSTOM_CALL'));
    assert.equal(edge(changed,'Flow:B','Flow:A','INVOKES'),undefined);
  });
});

test('invalid XML and unsupported JSON are reported as incomplete, not as dependency-free',async()=>{
  await withProject({'flows/Broken.flow-meta.xml':'<Flow><subflows>',
    'experiences/Site/routes/home.json':'{"devName":"home"}'},async({root})=>{
    const g=await new AnalysisService().analyze(root);
    assert.equal(g.coverage.status,'partial');
    assert.ok(g.fileCoverage.some(c=>c.file.endsWith('Broken.flow-meta.xml')&&c.status==='failed'));
    assert.ok(g.fileCoverage.some(c=>c.file.endsWith('home.json')&&c.status==='partial'));
  });
});

test('unhandled XML identifier appears as unverified, not as an asserted relationship',async()=>{
  await withProject({
    'classes/ReportService.cls':'public class ReportService {}',
    'flows/A.flow-meta.xml':xml('Flow','<unknownFutureReference>ReportService</unknownFutureReference>')
  },async({root})=>{
    const graph=await new AnalysisService().analyze(root);
    assert.ok(!graph.edges.some(e=>e.source==='Flow:A'&&e.target==='ApexClass:ReportService'));
    assert.ok(graph.unverifiedCandidates.some(c=>c.origin==='xml'&&c.source==='Flow:A'&&c.target==='ApexClass:ReportService'));
    assert.ok(graph.fileCoverage.some(c=>c.file.endsWith('A.flow-meta.xml')&&c.status==='partial'));
  });
});

test('unchanged repository reuses the persisted directed graph and adjacency index',async()=>{
  await withProject({'flows/Source.flow-meta.xml':xml('Flow','<subflows><flowName>Target</flowName></subflows>'),
    'flows/Target.flow-meta.xml':xml('Flow')},async({root,cacheDir})=>{
    const first=await new AnalysisService().analyze(root,{cacheDir});
    const second=await new AnalysisService().analyze(root,{cacheDir});
    assert.equal(second.stats.graphReused,true);
    assert.ok(second.adjacency.functional.out['Flow:Source'].includes('Flow:Target'));
    assert.ok(second.adjacency.functional.in['Flow:Target'].includes('Flow:Source'));
    assert.deepEqual(neighborhood(second,['Flow:Target'],'in',1).nodes.map(n=>n.id).sort(),
      neighborhood(first,['Flow:Target'],'in',1).nodes.map(n=>n.id).sort());
  });
});

test('persistent graph cannot hide changes to code analysis setting',async()=>{
  await withProject({'classes/Called.cls':'public class Called { public static void run() {} }',
    'classes/Caller.cls':'public class Caller { void run(){ Called.run(); } }'},async({root,cacheDir})=>{
    const withCode=await new AnalysisService().analyze(root,{cacheDir});
    assert.ok(edge(withCode,'ApexClass:Caller','ApexClass:Called','INVOKES'));
    const withoutCode=await new AnalysisService().analyze(root,{cacheDir,includeCodeReferences:false});
    assert.ok(!withoutCode.edges.some(e=>e.source==='ApexClass:Caller'&&e.target==='ApexClass:Called'));
    assert.equal(withoutCode.stats.graphReused,undefined);
    assert.equal(withoutCode.stats.filesParsed,0);
  });
});
