'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {AnalysisService,neighborhood}=require('../src/analyzer');
const {withUnresolvedFieldNodes}=require('../src/presentation');

async function runFixture(callback){
  const work=await fs.mkdtemp(path.join(os.tmpdir(),'sfdv-missing-field-'));
  const root=path.join(work,'force-app');
  const write=async(rel,text)=>{const full=path.join(root,'main/default',rel);await fs.mkdir(path.dirname(full),{recursive:true});await fs.writeFile(full,text);};
  try{
    await write('objects/Invoice__c/Invoice__c.object-meta.xml','<CustomObject><label>Invoice</label></CustomObject>');
    await write('objects/Invoice__c/fields/Status__c.field-meta.xml','<CustomField><fullName>Status__c</fullName><type>Text</type></CustomField>');
    await write('objects/Payment__c/Payment__c.object-meta.xml','<CustomObject><label>Payment</label></CustomObject>');
    await write('objects/Payment__c/fields/Amount__c.field-meta.xml','<CustomField><fullName>Amount__c</fullName><type>Currency</type></CustomField>');
    await write('classes/InvoiceProcessor.cls',`public class InvoiceProcessor {
      void run(Invoice__c invoice) {
        invoice.Amount__c = 10;
        String status = invoice.Status__c;
        List<Invoice__c> rows = [SELECT Status__c, Amount__c FROM Invoice__c WHERE Amount__c > 0];
        System.debug('invoice.Fake__c');
        // invoice.Commented__c = 1;
      }
    }`);
    await callback(await new AnalysisService().analyze(root));
  }finally{await fs.rm(work,{recursive:true,force:true});}
}

test('Apex field references missing from repository are surfaced as unresolved, not silently dropped',async()=>{
  await runFixture(g=>{
    assert.ok(g.edges.some(e=>e.source==='ApexClass:InvoiceProcessor'&&e.target==='CustomField:Invoice__c.Status__c'));
    assert.ok(g.unresolved.some(u=>u.source==='ApexClass:InvoiceProcessor'&&u.targetType==='CustomField'&&u.targetName==='Invoice__c.Amount__c'));
    assert.ok(!g.edges.some(e=>e.source==='ApexClass:InvoiceProcessor'&&e.target==='CustomField:Payment__c.Amount__c'));
    assert.ok(!g.unresolved.some(u=>/Fake__c|Commented__c/.test(u.targetName)));
  });
});

test('unresolved fields display as visibly provisional graph neighbors and support reverse exploration',async()=>{
  await runFixture(g=>{
    const display=withUnresolvedFieldNodes(g);
    const ghost='UnresolvedCustomField:Invoice__c.Amount__c';
    assert.ok(display.nodes.some(n=>n.id===ghost&&n.unresolved===true));
    assert.ok(display.edges.some(e=>e.source==='ApexClass:InvoiceProcessor'&&e.target===ghost&&e.unresolved===true));
    assert.ok(neighborhood(display,['ApexClass:InvoiceProcessor'],'out',1).nodes.some(n=>n.id===ghost));
    assert.ok(neighborhood(display,[ghost],'in',1).nodes.some(n=>n.id==='ApexClass:InvoiceProcessor'));
    assert.ok(!display.nodes.some(n=>n.id==='UnresolvedCustomField:Invoice__c.Status__c'));
    assert.ok(!g.nodes.some(n=>n.id===ghost),'provisional UI nodes must not contaminate verified metadata');
  });
});

test('Apex-only repositories still report object-owned custom fields as unresolved',async()=>{
  const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'sfdv-apex-only-'));
  try{
    const root=path.join(tmp,'force-app');
    const cls=path.join(root,'main/default/classes/ExternalReferences.cls');
    await fs.mkdir(path.dirname(cls),{recursive:true});
    await fs.writeFile(cls,`public class ExternalReferences {
      void execute() {
        Invoice__c inv = new Invoice__c();
        inv.Amount__c = 55;
        List<Opportunity> opps = [SELECT Account_Reference__c FROM Opportunity];
        System.debug('Invoice__c.StringOnly__c');
      }
    }`);
    const model=await new AnalysisService().analyze(root);
    assert.ok(model.unresolved.some(x=>x.targetType==='CustomField'&&x.targetName==='Invoice__c.Amount__c'));
    assert.ok(model.unresolved.some(x=>x.targetType==='CustomField'&&x.targetName==='Opportunity.Account_Reference__c'));
    assert.ok(!model.unresolved.some(x=>x.targetName.includes('StringOnly__c')));
    const view=withUnresolvedFieldNodes(model);
    assert.ok(neighborhood(view,['ApexClass:ExternalReferences'],'out',1).nodes.some(n=>n.id==='UnresolvedCustomField:Opportunity.Account_Reference__c'));
    assert.ok(!model.edges.some(x=>x.source==='ApexClass:ExternalReferences'&&x.target.startsWith('CustomField:')));
  }finally{await fs.rm(tmp,{recursive:true,force:true});}
});

test('lookup traversal without lookup field metadata preserves the owning lookup without inventing its target',async()=>{
  const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'sfdv-missing-lookup-'));
  try{
    const root=path.join(tmp,'force-app');
    const cls=path.join(root,'main/default/classes/Lookup.cls');
    await fs.mkdir(path.dirname(cls),{recursive:true});
    await fs.writeFile(cls,`public class Lookup {
      void execute(Invoice__c row) {
        String name = row.Account__r.External_Key__c;
      }
    }`);
    const model=await new AnalysisService().analyze(root);
    assert.ok(model.unresolved.some(x=>x.targetType==='CustomField'&&x.targetName==='Invoice__c.Account__c'));
    assert.ok(!model.unresolved.some(x=>x.targetName.endsWith('External_Key__c')),
      'unknown relationship target must not be guessed');
  }finally{await fs.rm(tmp,{recursive:true,force:true});}
});
