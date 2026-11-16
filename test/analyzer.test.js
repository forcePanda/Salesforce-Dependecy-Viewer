'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {AnalysisService,neighborhood,parseSource}=require('../src/analyzer');
const {parseXml}=require('../src/xml');
const base=path.resolve(__dirname,'../fixtures/salesforce/force-app');
const id=(t,n)=>`${t}:${n}`;
let graph;
let service;
async function model(){if(!graph){service=new AnalysisService();graph=await service.analyze(base);}return graph;}
function has(g,s,t,r){return g.edges.some(e=>e.source===s&&e.target===t&&(!r||e.relation===r));}
test('XML parser handles metadata namespace, source offsets and mismatched tags',()=>{
  const p=parseXml('<?xml version="1.0"?><ns:Flow xmlns:ns="x"><subflows><flowName>X&amp;Y</flowName></subflows></ns:Flow>');
  assert.equal(p.name,'Flow');assert.equal(p.children[0].children[0].text,'X&Y');
  assert.throws(()=>parseXml('<Flow><x></Flow>'),/Mismatched/);
  assert.throws(()=>parseXml('<!DOCTYPE root [<!ENTITY x SYSTEM "file:///etc/passwd">]><Flow/>'),/DTD/);
});
test('scanner strictly excludes paths outside force-app',async()=>{
  const g=await model();
  assert.ok(g.nodes.find(n=>n.id===id('Flow','Calculate_Tax')));
  assert.ok(!g.nodes.some(n=>n.name.includes('Should_Not_Exist')));
  assert.equal(g.stats.errors,0);
});
test('XML rules detect lookup, formula and containment',async()=>{
  const g=await model();
  assert.ok(has(g,id('CustomField','Invoice__c.Customer__c'),id('CustomObject','Account'),'REFERENCES_OBJECT'));
  assert.ok(has(g,id('CustomField','Invoice__c.Total__c'),id('CustomField','Invoice__c.Amount__c'),'FORMULA_REFERENCES'));
  assert.ok(has(g,id('ValidationRule','Invoice__c.Amount_Required'),id('CustomField','Invoice__c.Amount__c')));
  assert.ok(has(g,id('CustomObject','Invoice__c'),id('CustomField','Invoice__c.Embedded__c'),'CONTAINS'));
});
test('Flow calls, access permissions and layout fields are semantically distinct',async()=>{
  const g=await model();
  assert.ok(has(g,id('Flow','Calculate_Tax'),id('Flow','Notify_Accounting'),'INVOKES'));
  assert.ok(has(g,id('Flow','Calculate_Tax'),id('ApexClass','TaxCalculator'),'INVOKES'));
  assert.ok(has(g,id('Flow','Calculate_Tax'),id('CustomField','Invoice__c.Amount__c'),'READS'));
  assert.ok(has(g,id('PermissionSet','Invoice_Permissions'),id('ApexClass','TaxCalculator'),'GRANTS_ACCESS'));
  assert.ok(has(g,id('PermissionSet','Invoice_Permissions'),id('CustomField','Invoice__c.Amount__c'),'GRANTS_ACCESS'));
  assert.ok(!has(g,id('PermissionSet','Invoice_Permissions'),id('CustomField','Invoice__c.Customer__c'),'GRANTS_ACCESS'));
  assert.ok(has(g,id('Layout','Invoice__c-Invoice Layout'),id('CustomField','Invoice__c.Amount__c'),'DISPLAYS'));
});
test('LWC imports and Apex known-type references work',async()=>{
  const g=await model();
  assert.ok(has(g,id('LightningComponentBundle','invoiceCard'),id('ApexClass','TaxCalculator')));
  assert.ok(has(g,id('LightningComponentBundle','invoiceCard'),id('CustomField','Invoice__c.Amount__c')));
  assert.ok(has(g,id('LightningComponentBundle','invoiceCard'),id('LightningComponentBundle','childWidget')));
  assert.ok(has(g,id('ApexClass','TaxCalculator'),id('ApexClass','HelperClass')));
});
test('reverse dependency view and cycles are bounded',async()=>{
  const g=await model();
  const into=neighborhood(g,[id('CustomField','Invoice__c.Amount__c')],'in',1,false);
  assert.ok(into.nodes.some(n=>n.id===id('PermissionSet','Invoice_Permissions')));
  const cyc=neighborhood(g,[id('Flow','Calculate_Tax')],'out',30,false);
  assert.ok(cyc.nodes.some(n=>n.id===id('Flow','Notify_Accounting')));
  assert.ok(cyc.nodes.length<=g.nodes.length);
});
test('cache reuses source parses on a subsequent scan',async()=>{
  const a=await model();const b=await service.analyze(base);
  assert.equal(a.stats.files,b.stats.files);assert.equal(b.stats.filesParsed,0);assert.equal(b.stats.filesReused,a.stats.files);
});
test('custom rules can override a bundled rule',async()=>{
  const svc=new AnalysisService();
  const g=await svc.analyze(base,{customRules:[{id:'FLOW_SUBFLOW',sourceType:'Flow',path:'subflows.flowName',targetType:'Flow',relation:'CUSTOM_DEPENDENCY'}]});
  assert.ok(has(g,id('Flow','Calculate_Tax'),id('Flow','Notify_Accounting'),'CUSTOM_DEPENDENCY'));
});
