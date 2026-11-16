'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {AnalysisService,extractFormulaCandidates,neighborhood,parseSource}=require('../src/analyzer');
const {identifyFile,idOf,basenameWithoutSuffix}=require('../src/identity');
const {parseXml,pathMatches,makeLineLocator}=require('../src/xml');
const {DEFAULT_RULES,customRuleSet}=require('../src/rules');
const rootXml='http://soap.sforce.com/2006/04/metadata';
function xml(type,body=''){return `<?xml version="1.0"?><${type} xmlns="${rootXml}">${body}</${type}>`;}
const prefix='main/default/';
async function project(files,fn){
  const workspace=await fs.mkdtemp(path.join(os.tmpdir(),'sfdv-regression-'));
  const source=path.join(workspace,'force-app');
  await fs.mkdir(source,{recursive:true});
  for(const [rel,content] of Object.entries(files)){
    const f=path.join(source,prefix,rel);
    await fs.mkdir(path.dirname(f),{recursive:true});await fs.writeFile(f,content,'utf8');
  }
  try{return await fn({workspace,source});}finally{await fs.rm(workspace,{recursive:true,force:true});}
}
function edge(g,s,r,t){return g.edges.find(e=>e.source===s&&e.relation===r&&e.target===t);}

test('source-format file-to-component identity table',async t=>{
  const rows=[
    ['objects/Invoice__c/Invoice__c.object-meta.xml','CustomObject','Invoice__c'],
    ['objects/Invoice__c/fields/Status__c.field-meta.xml','CustomField','Invoice__c.Status__c'],
    ['objects/Account/fields/Phone.field-meta.xml','CustomField','Account.Phone'],
    ['objects/Invoice__c/recordTypes/Wholesale.recordType-meta.xml','RecordType','Invoice__c.Wholesale'],
    ['objects/Invoice__c/validationRules/Positive.validationRule-meta.xml','ValidationRule','Invoice__c.Positive'],
    ['objects/Invoice__c/compactLayouts/Compact.compactLayout-meta.xml','CompactLayout','Invoice__c.Compact'],
    ['objects/Invoice__c/fieldSets/Details.fieldSet-meta.xml','FieldSet','Invoice__c.Details'],
    ['objects/Invoice__c/listViews/Open.listView-meta.xml','ListView','Invoice__c.Open'],
    ['objects/Invoice__c/businessProcesses/Sales.businessProcess-meta.xml','BusinessProcess','Invoice__c.Sales'],
    ['classes/TaxCalculator.cls','ApexClass','TaxCalculator'],
    ['classes/TaxCalculator.cls-meta.xml','ApexClass','TaxCalculator'],
    ['triggers/InvoiceTrigger.trigger','ApexTrigger','InvoiceTrigger'],
    ['flows/Notify.flow-meta.xml','Flow','Notify'],
    ['layouts/Invoice__c-Invoice Layout.layout-meta.xml','Layout','Invoice__c-Invoice Layout'],
    ['permissionsets/Finance.permissionset-meta.xml','PermissionSet','Finance'],
    ['profiles/Admin.profile-meta.xml','Profile','Admin'],
    ['dashboards/Finance/Overview.dashboard-meta.xml','Dashboard','Finance/Overview'],
    ['reports/Finance/Overdue.report-meta.xml','Report','Finance/Overdue'],
    ['email/Finance/Reminder.email-meta.xml','EmailTemplate','Finance/Reminder'],
    ['lwc/invoiceDash/invoiceDash.js','LightningComponentBundle','invoiceDash'],
    ['lwc/invoiceDash/invoiceDash.html','LightningComponentBundle','invoiceDash'],
    ['aura/invoiceTile/invoiceTile.cmp','AuraDefinitionBundle','invoiceTile'],
    ['pages/InvoicePrint.page','ApexPage','InvoicePrint'],
    ['pages/InvoicePrint.page-meta.xml','ApexPage','InvoicePrint'],
    ['messageChannels/Notify.messageChannel-meta.xml','LightningMessageChannel','Notify'],
    ['namedCredentials/API.namedCredential-meta.xml','NamedCredential','API'],
    ['externalCredentials/Auth.externalCredential-meta.xml','ExternalCredential','Auth'],
    ['globalValueSets/Billing_Status.globalValueSet-meta.xml','GlobalValueSet','Billing_Status'],
    ['approvalProcesses/Invoice__c.Approval.approvalProcess-meta.xml','ApprovalProcess','Invoice__c.Approval']
  ];
  for(const [file,type,name] of rows)await t.test(`${file} => ${type}:${name}`,()=>{
    const got=identifyFile(prefix+file);
    assert.equal(got?.type,type);assert.equal(got?.name,name);
  });
  await t.test('manifest / unrecognized paths are not metadata components',()=>{
    assert.equal(identifyFile('sfdx-project.json'),null);
    assert.equal(identifyFile('package.xml'),null);
    assert.equal(identifyFile('misc/notes.txt'),null);
    assert.equal(identifyFile('lwc/orphan.js'),null);
  });
});

test('XML lexical parser adversarial properties',async t=>{
  const cases=[
    ['namespaces and numeric entities',()=>{const v=parseXml('<md:Flow xmlns:md="x"><name>Pay&#x20;Now&#33;</name></md:Flow>');assert.equal(v.name,'Flow');assert.equal(v.children[0].text,'Pay Now!');}],
    ['self closing tags',()=>{const v=parseXml('<Flow><start/><subflows /></Flow>');assert.equal(v.children.length,2);}],
    ['CDATA formula expressions',()=>{const v=parseXml('<Flow><formulas><![CDATA[Amount__c < 0 && true]]></formulas></Flow>');assert.match(v.children[0].text,/Amount__c < 0/);}],
    ['XML comment does not generate component',()=>{const v=parseXml('<Flow><!--<subflows><flowName>Fake</flowName></subflows>--><label>Okay</label></Flow>');assert.equal(v.children.length,1);}],
    ['reject DTD',()=>assert.throws(()=>parseXml('<!DOCTYPE Flow SYSTEM "file:///etc/passwd"><Flow/>'),/DTD/)],
    ['reject entity definition',()=>assert.throws(()=>parseXml('<!ENTITY x "boom"><Flow/>'),/DTD/)],
    ['reject mismatched closing tag',()=>assert.throws(()=>parseXml('<Flow><a></b></Flow>'),/Mismatched/)],
    ['reject unterminated comment',()=>assert.throws(()=>parseXml('<Flow><!-- hi'),/Unterminated/)],
    ['reject unterminated CDATA',()=>assert.throws(()=>parseXml('<Flow><![CDATA[ hi'),/Unterminated/)],
    ['reject multiple roots',()=>assert.throws(()=>parseXml('<Flow/><Flow/>'),/exactly one/)],
    ['reject unclosed root',()=>assert.throws(()=>parseXml('<Flow><x/>'),/Unclosed/)],
    ['locate evidence lines',()=>{const locate=makeLineLocator('alpha\nbeta\ngamma\n');assert.equal(locate(0),1);assert.equal(locate(6),2);assert.equal(locate(11),3);}]
  ];
  for(const [name,fn] of cases)await t.test(name,fn);
});

test('declarative rule matching and validation',async t=>{
  const matches=[
    ['subflows.flowName',['subflows','flowName'],true],
    ['subflows.flowName',['screens','flowName'],false],
    ['**.layoutItems.field',['layoutSections','layoutColumns','layoutItems','field'],true],
    ['**.layoutItems.field',['layoutItems','field'],true],
    ['**.layoutItems.field',['layoutItems','layoutName'],false],
    ['**.filters.field',['recordLookups','filters','field'],true],
    ['*.field',['something','field'],true],
    ['*.field',['a','b','field'],false],
    ['**',['anything','nested','here'],true],
    ['**',[],true]
  ];
  for(const [pattern,parts,result] of matches)await t.test(`pathMatches(${pattern}, ${parts.join('.')})`,()=>assert.equal(pathMatches(pattern,parts),result));
  await t.test('all default rule ids are unique, valid, and have semantic relationships',()=>{
    assert.equal(new Set(DEFAULT_RULES.map(x=>x.id)).size,DEFAULT_RULES.length);
    for(const r of DEFAULT_RULES){assert.ok(r.sourceType&&r.targetType&&r.path&&r.relation);assert.match(r.path,/^[\w*]+(?:\.[\w*]+)*$/);}
  });
  await t.test('invalid custom rule is rejected, good rule kept and override is deterministic',()=>{
    const c={id:'FLOW_SUBFLOW',sourceType:'Flow',path:'subflows.flowName',targetType:'Flow',relation:'CUSTOM'};
    const {rules,warnings}=customRuleSet([null,{id:'bad',path:'../evil',sourceType:'Flow',targetType:'ApexClass'},{id:'bad2',path:'x',sourceType:'Flow',targetType:'Flow',transform:'invalid'},c]);
    assert.equal(warnings.length,3);
    assert.equal(rules.filter(x=>x.id===c.id).length,1);
    assert.equal(rules.find(x=>x.id===c.id).relation,'CUSTOM');
  });
});

test('formula scanner rejects prose, string literals, and non-fields',async t=>{
  const fields=new Map(['Amount__c','Status__c','Tax__c'].map(n=>[idOf('CustomField',`Invoice__c.${n}`),{}]));
  const rows=[
    ['IF(Amount__c > 0, Amount__c, 0)',['Invoice__c.Amount__c']],
    ['IF(Status__c = "Amount__c", Tax__c, 0)',['Invoice__c.Status__c','Invoice__c.Tax__c']],
    ['"Amount__c"',[]],
    ['\'Amount__c\'',[]],
    ['$Record.Amount__c * 2',['Invoice__c.Amount__c']],
    ['$Flow.CurrentDate + 3',[]],
    ['$Label.c.Invoice_Title',[]],
    ['Unknown__c + 1',['Invoice__c.Unknown__c']],
    ['OR(TRUE, FALSE)',[]]
  ];
  for(const [formula,wanted] of rows)await t.test(formula,()=>{
    assert.deepEqual(extractFormulaCandidates(formula,'Invoice__c',fields).sort(),wanted.sort());
  });
});

test('adversarial code analysis and explicit unresolved imports',async()=>{
  const f={
    'classes/HelperClass.cls':'public class HelperClass { public static void go(){} }',
    'classes/OtherClass.cls':'public class OtherClass { public static void go(){} }',
    'classes/Caller.cls':`public class Caller { public static void run() { String u='https://domain.invalid/HelperClass.go()';\n// OtherClass.go();\n/* OtherClass.go(); */\nHelperClass.go();\nSystem.debug('OtherClass.go();'); } }`,
    'lwc/widget/widget.js':`import useHelper from '@salesforce/apex/HelperClass.go';\nconst s='@salesforce/apex/OtherClass.go';\nconst fake = "import foo from '@salesforce/apex/OtherClass.go'";\n// import noop from '@salesforce/apex/OtherClass.go';\nimport missing from '@salesforce/apex/DeletedClass.go';`,
    'lwc/widget/widget.html':`<template><!-- <c-missing-widget></c-missing-widget> --><div>hello</div></template>`
  };
  await project(f,async({source})=>{
    const g=await new AnalysisService().analyze(source);
    assert.ok(edge(g,'ApexClass:Caller','INVOKES','ApexClass:HelperClass'));
    assert.equal(edge(g,'ApexClass:Caller','INVOKES','ApexClass:OtherClass'),undefined);
    assert.ok(edge(g,'LightningComponentBundle:widget','INVOKES','ApexClass:HelperClass'));
    assert.equal(edge(g,'LightningComponentBundle:widget','INVOKES','ApexClass:OtherClass'),undefined);
    assert.ok(g.unresolved.some(x=>x.targetType==='ApexClass'&&x.targetName==='DeletedClass'));
    assert.ok(!g.unresolved.some(x=>x.targetName==='missingWidget'));
  });
});

test('source scope, ignored directories, symlinks and disabled code parsing',async()=>{
  await project({
    'objects/Invoice__c/Invoice__c.object-meta.xml':xml('CustomObject','<label>Invoice</label>'),
    'classes/Caller.cls':'public class Caller { void f(){ Other.go(); }}',
    'classes/Other.cls':'public class Other { public static void go(){} }',
    'flows/InScope.flow-meta.xml':xml('Flow','<label>In Scope</label>')
  },async({source,workspace})=>{
    await fs.mkdir(path.join(source,'node_modules','flows'),{recursive:true});
    await fs.writeFile(path.join(source,'node_modules','flows','Hidden.flow-meta.xml'),xml('Flow'));
    await fs.mkdir(path.join(source,'.git','flows'),{recursive:true});
    await fs.writeFile(path.join(source,'.git','flows','GitOnly.flow-meta.xml'),xml('Flow'));
    await fs.mkdir(path.join(workspace,'outside','flows'),{recursive:true});
    await fs.writeFile(path.join(workspace,'outside','flows','Outside.flow-meta.xml'),xml('Flow'));
    await fs.symlink(path.join(workspace,'outside'),path.join(source,'external-link'),'dir');
    const svc=new AnalysisService();
    const g=await svc.analyze(source,{includeCodeReferences:false});
    assert.ok(g.nodes.some(n=>n.id==='Flow:InScope'));
    assert.ok(!g.nodes.some(n=>/Hidden|GitOnly|Outside/.test(n.id)));
    assert.equal(edge(g,'ApexClass:Caller','INVOKES','ApexClass:Other'),undefined);
    const enabled=await svc.analyze(source,{includeCodeReferences:true});
    assert.ok(edge(enabled,'ApexClass:Caller','INVOKES','ApexClass:Other'));
    assert.equal(enabled.stats.filesParsed,0,'code option should not invalidate parsers');
  });
});

test('malformed and oversized files produce diagnostics not phantom dependency edges',async()=>{
  await project({
    'flows/Broken.flow-meta.xml':'<Flow><subflows><flowName>Present</flowName></Flow>',
    'flows/Present.flow-meta.xml':xml('Flow','<label>Present</label>'),
    'flows/Large.flow-meta.xml':xml('Flow',`<description>${'X'.repeat(3000)}</description>`)
  },async({source})=>{
    const g=await new AnalysisService().analyze(source,{maxFileSizeKB:1});
    assert.ok(g.diagnostics.some(x=>x.file.includes('Broken')&&x.severity==='error'));
    assert.ok(g.diagnostics.some(x=>x.file.includes('Large')&&/exceeds limit/.test(x.message)));
    assert.equal(edge(g,'Flow:Broken','INVOKES','Flow:Present'),undefined);
    assert.equal(g.stats.files,3);
  });
});

test('file limits are surfaced as an incomplete result rather than silently truncated',async()=>{
  await project(Object.fromEntries(['One','Two','Three','Four'].map(n=>[`flows/${n}.flow-meta.xml`,xml('Flow')])),async({source})=>{
    const g=await new AnalysisService().analyze(source,{maxFiles:2});
    assert.equal(g.stats.files,2);
    assert.ok(g.diagnostics.some(x=>/Reached sfdv.maxFiles/.test(x.message)));
  });
});

test('a scan hitting the exact file limit does not falsely claim truncation',async()=>{
  await project(Object.fromEntries(['One','Two'].map(n=>[`flows/${n}.flow-meta.xml`,xml('Flow')])),async({source})=>{
    const graph=await new AnalysisService().analyze(source,{maxFiles:2});
    assert.equal(graph.stats.files,2);
    assert.ok(!graph.diagnostics.some(x=>/Reached sfdv.maxFiles/.test(x.message)));
  });
});

test('analysis cache reloads changed files, evicts deleted files and has stable ids',async()=>{
  await project({
    'flows/Caller.flow-meta.xml':xml('Flow','<subflows><flowName>Target</flowName></subflows>'),
    'flows/Target.flow-meta.xml':xml('Flow','<label>Target</label>')
  },async({source})=>{
    const svc=new AnalysisService();const first=await svc.analyze(source);
    assert.ok(edge(first,'Flow:Caller','INVOKES','Flow:Target'));
    const same=await svc.analyze(source);
    assert.equal(same.stats.filesReused,2);
    const sourcePath=path.join(source,prefix,'flows/Caller.flow-meta.xml');
    await fs.writeFile(sourcePath,xml('Flow','<label>Caller no longer invokes anyone</label>'));
    const now=new Date(Date.now()+2000);await fs.utimes(sourcePath,now,now);
    const updated=await svc.analyze(source);
    assert.equal(updated.stats.filesParsed,1);
    assert.equal(edge(updated,'Flow:Caller','INVOKES','Flow:Target'),undefined);
    await fs.rm(path.join(source,prefix,'flows/Target.flow-meta.xml'));
    const deleted=await svc.analyze(source);
    assert.ok(!deleted.nodes.some(n=>n.id==='Flow:Target'));
    assert.equal(deleted.stats.files,1);
  });
});

test('custom rule override takes effect even for cached file parses',async()=>{
  await project({
    'flows/A.flow-meta.xml':xml('Flow','<subflows><flowName>B</flowName></subflows>'),
    'flows/B.flow-meta.xml':xml('Flow')
  },async({source})=>{
    const svc=new AnalysisService();
    const a=await svc.analyze(source);
    assert.ok(edge(a,'Flow:A','INVOKES','Flow:B'));
    const b=await svc.analyze(source,{customRules:[{id:'FLOW_SUBFLOW',sourceType:'Flow',path:'subflows.flowName',targetType:'Flow',relation:'CUSTOM'}]});
    assert.equal(b.stats.filesReused,2);
    assert.ok(edge(b,'Flow:A','CUSTOM','Flow:B'));
    assert.equal(edge(b,'Flow:A','INVOKES','Flow:B'),undefined);
  });
});

test('unresolved explicit references stay unresolved when only a similarly named other type exists',async()=>{
  await project({
    'flows/CallMissing.flow-meta.xml':xml('Flow','<subflows><flowName>Other</flowName></subflows>'),
    'classes/Other.cls':'public class Other{}'
  },async({source})=>{
    const g=await new AnalysisService().analyze(source);
    assert.ok(g.unresolved.some(x=>x.source==='Flow:CallMissing'&&x.targetName==='Other'&&x.targetType==='Flow'));
    assert.equal(edge(g,'Flow:CallMissing','INVOKES','ApexClass:Other'),undefined);
  });
});

test('synthetic 300-node dependency graph remains bounded and repeatable',async()=>{
  const files={};const count=300;
  for(let i=0;i<count;i++){
    const name=`Flow_${String(i).padStart(4,'0')}`;
    const target=`Flow_${String((i+1)%count).padStart(4,'0')}`;
    files[`flows/${name}.flow-meta.xml`]=xml('Flow',`<subflows><flowName>${target}</flowName></subflows>`);
  }
  await project(files,async({source})=>{
    const svc=new AnalysisService();const g=await svc.analyze(source);
    assert.equal(g.stats.nodes,count);
    assert.equal(g.stats.edges,count);
    assert.equal(g.stats.unresolved,0);
    assert.equal(g.stats.errors,0);
    const sub=neighborhood(g,['Flow:Flow_0000'],'out',500,false);
    assert.equal(sub.nodes.length,count);
    const second=await svc.analyze(source);
    assert.equal(second.stats.filesReused,count);
    assert.deepEqual(new Set(second.edges.map(e=>e.source+'>'+e.target)),new Set(g.edges.map(e=>e.source+'>'+e.target)));
  });
});
