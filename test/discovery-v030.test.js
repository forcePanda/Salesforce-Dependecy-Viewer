'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {AnalysisService,extractLabelReferences,neighborhood}=require('../src/analyzer');
const {DEFAULT_RULES}=require('../src/rules');
const fixture=path.resolve(__dirname,'../fixtures/enterprise/force-app');

async function temporaryTree(fn){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'sfdv-v030-'));
  async function write(rel,data){const file=path.join(root,rel);await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,data);return file;}
  try{return await fn(root,write);}finally{await fs.rm(root,{recursive:true,force:true});}
}
const xml=(type,inner)=>`<?xml version="1.0"?><${type} xmlns="http://soap.sforce.com/2006/04/metadata">${inner}</${type}>`;
const edge=(graph,source,target,relation)=>graph.edges.find(e=>e.source===source&&e.target===target&&e.relation===relation);

test('v0.3 discovery: every declarative rule has unique ID and an explicit source property',()=>{
  assert.ok(DEFAULT_RULES.length>=119);
  assert.equal(new Set(DEFAULT_RULES.map(r=>r.id)).size,DEFAULT_RULES.length);
  for(const rule of DEFAULT_RULES){assert.ok(rule.sourceType&&rule.targetType&&rule.path&&rule.relation,rule.id);}
});

test('v0.3 discovery: label-expression parsing ignores quoted labels',()=>{
  assert.deepEqual(extractLabelReferences(`$Label.Invoice_Title + '$Label.Fake' + "$Label.Bogus"`),['Invoice_Title']);
  assert.deepEqual(extractLabelReferences('$Label.c.Invoice_Title + $Label.pkg.Other_Label'),['Invoice_Title','Other_Label']);
});

test('v0.3 discovery: typed Flow variables cannot borrow same-named fields from another object',async()=>{
 await temporaryTree(async(root,write)=>{
  await write('main/default/objects/Invoice__c/Invoice__c.object-meta.xml',xml('CustomObject','<label>Invoice</label>'));
  await write('main/default/objects/Payment__c/Payment__c.object-meta.xml',xml('CustomObject','<label>Payment</label>'));
  for(const obj of ['Invoice__c','Payment__c'])await write(`main/default/objects/${obj}/fields/Amount__c.field-meta.xml`,xml('CustomField','<fullName>Amount__c</fullName><type>Currency</type>'));
  await write('main/default/flows/TestFlow.flow-meta.xml',xml('Flow',`<start><object>Invoice__c</object></start>
    <variables><name>payment</name><dataType>SObject</dataType><objectType>Payment__c</objectType></variables>
    <assignments><name>A</name><assignmentItems>
      <value><elementReference>payment.Amount__c</elementReference></value>
      <value><elementReference>unknown.Amount__c</elementReference></value>
    </assignmentItems></assignments>`));
  const g=await new AnalysisService().analyze(root);
  assert.ok(edge(g,'Flow:TestFlow','CustomField:Payment__c.Amount__c','REFERENCES'));
  assert.equal(edge(g,'Flow:TestFlow','CustomField:Invoice__c.Amount__c','REFERENCES'),undefined);
  assert.equal(g.unresolved.length,0,'untyped resource should not become a fabricated reference');
 });
});

test('v0.3 discovery: bare SOQL child field resolves through relationshipName, never outer object',async()=>{
  const g=await new AnalysisService().analyze(fixture);
  const apex='ApexClass:ExpandedDiscovery';
  assert.ok(edge(g,apex,'CustomField:Invoice__c.Amount__c','READS'));
  assert.equal(edge(g,apex,'CustomField:Account.Amount__c','READS'),undefined);
  const e=edge(g,apex,'CustomField:Invoice__c.Amount__c','READS');
  assert.ok(e.evidence.some(x=>x.rule==='APEX_SOQL_FIELD'&&x.file.endsWith('ExpandedDiscovery.cls')));
});

test('v0.3 discovery: referenced email-template merge fields are indexed from body with XML context',async()=>{
  const g=await new AnalysisService().analyze(fixture);
  const template='EmailTemplate:Finance/Invoice_Reminder';
  for(const field of ['CustomField:Invoice__c.Amount__c','CustomField:Invoice__c.Status__c']){
    const e=edge(g,template,field,'REFERENCES');
    assert.ok(e);
    assert.ok(e.evidence.some(x=>x.rule==='EMAIL_TEMPLATE_FIELD'&&x.file.endsWith('Invoice_Reminder.email')));
  }
  assert.equal(edge(g,template,'CustomField:Payment__c.Amount__c','REFERENCES'),undefined);
});

test('v0.3 discovery: relatedTo in template without declared relatedEntityType remains unresolved semantically',async()=>{
 await temporaryTree(async(root,write)=>{
   await write('main/default/objects/Invoice__c/Invoice__c.object-meta.xml',xml('CustomObject','<label>Invoice</label>'));
   await write('main/default/objects/Invoice__c/fields/Amount__c.field-meta.xml',xml('CustomField','<fullName>Amount__c</fullName>'));
   await write('main/default/email/No_Context.email','Hi {!relatedTo.Amount__c}');
   const g=await new AnalysisService().analyze(root);
   assert.equal(edge(g,'EmailTemplate:No_Context','CustomField:Invoice__c.Amount__c','REFERENCES'),undefined);
 });
});

test('v0.3 discovery: strings/comments cannot manufacture references to existing metadata',async()=>{
  const g=await new AnalysisService().analyze(fixture);
  const bad='ApexClass:NegativeReferences';
  assert.ok(g.nodes.some(n=>n.id===bad));
  assert.equal(g.edges.filter(e=>e.source===bad).length,0);
});

test('v0.3 discovery: cycle and reverse graph traversal preserve semantic evidence',async()=>{
  const g=await new AnalysisService().analyze(fixture);
  const referenced=neighborhood(g,['CustomField:Invoice__c.Amount__c'],'in',1,false);
  assert.ok(referenced.nodes.some(n=>n.id==='EmailTemplate:Finance/Invoice_Reminder'));
  assert.ok(referenced.nodes.some(n=>n.id==='Flow:Discovery_Flow'));
  assert.ok(referenced.nodes.some(n=>n.id==='ApexClass:ExpandedDiscovery'));
  assert.ok(referenced.edges.filter(e=>e.target==='CustomField:Invoice__c.Amount__c').every(e=>e.relation!=='CONTAINS'));
});
