'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {AnalysisService,neighborhood}=require('../src/analyzer');

const objXml=name=>`<?xml version="1.0"?><CustomObject xmlns="http://soap.sforce.com/2006/04/metadata"><label>${name}</label><pluralLabel>${name}s</pluralLabel></CustomObject>`;
const fieldXml=name=>`<?xml version="1.0"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>${name}</fullName><label>${name}</label><type>Text</type><length>80</length></CustomField>`;
const definitions={
  'Invoice__c':['Amount__c','Status__c','Customer__c','Total__c'],
  'Payment__c':['Amount__c','Invoice__c','Status__c'],
  'Account':['Custom_Rating__c','Name']
};
async function fixture(classes,callback,options={}){
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'sfdv-apex-fields-'));
  const folder=path.join(temp,'force-app');
  const write=async(rel,value)=>{const p=path.join(folder,'main/default',rel);await fs.mkdir(path.dirname(p),{recursive:true});await fs.writeFile(p,value);};
  try{
    for(const [name,fields] of Object.entries(definitions)){
      await write(`objects/${name}/${name}.object-meta.xml`,objXml(name));
      for(const f of fields){
        const xml=name==='Invoice__c'&&f==='Customer__c'
          ? `<?xml version="1.0"?><CustomField><fullName>Customer__c</fullName><label>Customer</label><type>Lookup</type><referenceTo>Account</referenceTo></CustomField>`
          :fieldXml(f);
        await write(`objects/${name}/fields/${f}.field-meta.xml`,xml);
      }
    }
    for(const [name,code] of Object.entries(classes))await write(`classes/${name}.cls`,code);
    return await callback(await new AnalysisService().analyze(folder,options));
  }finally{await fs.rm(temp,{recursive:true,force:true});}
}
const source=name=>`ApexClass:${name}`;
const field=(obj,name)=>`CustomField:${obj}.${name}`;
const object=name=>`CustomObject:${name}`;
const edgesOf=(g,sourceName)=>g.edges.filter(e=>e.source===source(sourceName));
const has=(g,name,target)=>edgesOf(g,name).some(e=>e.target===target);
const evidence=(g,name,target)=>edgesOf(g,name).filter(e=>e.target===target).flatMap(e=>e.evidence);

test('static SOQL resolves unqualified SELECT, WHERE, ORDER BY and aggregate fields to FROM object',async()=>{
  await fixture({InvoiceQuery:`public class InvoiceQuery {
    List<Invoice__c> load() {
      return [SELECT Id, Amount__c, Status__c, SUM(Total__c)
              FROM Invoice__c WHERE Status__c = :state
              ORDER BY Amount__c DESC LIMIT 20];
    }
  }`},g=>{
    for(const f of ['Amount__c','Status__c','Total__c'])assert.ok(has(g,'InvoiceQuery',field('Invoice__c',f)),f);
    assert.ok(has(g,'InvoiceQuery',object('Invoice__c')));
    assert.ok(!has(g,'InvoiceQuery',field('Payment__c','Amount__c')),'same-named field on different object');
    const details=evidence(g,'InvoiceQuery',field('Invoice__c','Status__c'));
    assert.ok(details.some(e=>e.rule==='APEX_SOQL_FIELD'&&e.file.endsWith('InvoiceQuery.cls')&&e.line>=3));
    assert.ok(neighborhood(g,[field('Invoice__c','Amount__c')],'in',1).nodes.some(n=>n.id===source('InvoiceQuery')));
  });
});

test('multi-query Apex uses the correct owner for each field, even with identical API names',async()=>{
  await fixture({MultiQuery:`public class MultiQuery {
    void run() {
      List<Invoice__c> a = [SELECT Amount__c FROM Invoice__c];
      List<Payment__c> b = [SELECT Status__c FROM Payment__c];
    }
  }`},g=>{
    assert.ok(has(g,'MultiQuery',field('Invoice__c','Amount__c')));
    assert.ok(has(g,'MultiQuery',field('Payment__c','Status__c')));
    assert.ok(!has(g,'MultiQuery',field('Payment__c','Amount__c')));
    assert.ok(!has(g,'MultiQuery',field('Invoice__c','Status__c')));
  });
});

test('typed sObject variables, method parameters, fields and loop variables resolve dot access',async()=>{
  await fixture({Typed:`public class Typed {
    private Invoice__c item;
    public void handle(Invoice__c input) {
      Decimal value = input.Amount__c;
      this.item.Status__c = 'Ready';
      for (Payment__c payment : payments) {
        Decimal p = payment.Amount__c;
      }
    }
  }`},g=>{
    assert.ok(has(g,'Typed',field('Invoice__c','Amount__c')));
    assert.ok(has(g,'Typed',field('Invoice__c','Status__c')));
    assert.ok(has(g,'Typed',field('Payment__c','Amount__c')));
    assert.ok(!has(g,'Typed',field('Payment__c','Status__c')));
  });
});

test('same local variable name in different methods does not leak field ownership',async()=>{
  await fixture({Scoped:`public class Scoped {
    public void invoice() {
      Invoice__c row = new Invoice__c();
      Decimal total = row.Total__c;
    }
    public void payment() {
      Payment__c row = new Payment__c();
      Decimal amount = row.Amount__c;
    }
  }`},g=>{
    assert.ok(has(g,'Scoped',field('Invoice__c','Total__c')));
    assert.ok(has(g,'Scoped',field('Payment__c','Amount__c')));
    assert.ok(!has(g,'Scoped',field('Invoice__c','Amount__c')));
    assert.ok(!has(g,'Scoped',field('Payment__c','Status__c')));
  });
});

test('method parameters with the same variable name remain isolated across methods',async()=>{
  await fixture({Parameters:`public class Parameters {
    void acceptInvoice(Invoice__c row) {
      Decimal x = row.Total__c;
    }
    void acceptPayment(Payment__c row) {
      Decimal x = row.Amount__c;
    }
  }`},g=>{
    assert.ok(has(g,'Parameters',field('Invoice__c','Total__c')));
    assert.ok(has(g,'Parameters',field('Payment__c','Amount__c')));
    assert.ok(!has(g,'Parameters',field('Invoice__c','Amount__c')));
    assert.ok(!has(g,'Parameters',field('Payment__c','Status__c')));
  });
});

test('typed List elements resolve fields without treating entire collections as sObjects',async()=>{
  await fixture({Collections:`public class Collections {
    void run() {
      List<Invoice__c> invoices = new List<Invoice__c>();
      String p = invoices[0].Status__c;
      String unrelated = invoices.Amount__c;
    }
  }`},g=>{
    assert.ok(has(g,'Collections',field('Invoice__c','Status__c')));
    assert.ok(!has(g,'Collections',field('Invoice__c','Amount__c')),'List variable is not an sObject');
  });
});

test('field-token variants and Schema namespace access resolve exact indexed fields',async()=>{
  await fixture({Tokens:`public class Tokens {
    void describe() {
      Schema.SObjectField a = Invoice__c.Amount__c;
      Schema.SObjectField b = Invoice__c.Fields.Status__c;
      Schema.SObjectField c = Schema.SObjectType.Invoice__c.fields.Customer__c;
      Schema.SObjectField d = Schema.Account.Custom_Rating__c;
      Schema.SObjectField e = Account.Fields.Name;
    }
  }`},g=>{
    for(const [obj,f] of [['Invoice__c','Amount__c'],['Invoice__c','Status__c'],['Invoice__c','Customer__c'],['Account','Custom_Rating__c'],['Account','Name']]){
      assert.ok(has(g,'Tokens',field(obj,f)),`${obj}.${f}`);
    }
  });
});

test('SObject constructor field initializers are dependencies of the correct object',async()=>{
  await fixture({Constructors:`public class Constructors {
    void make() {
      Invoice__c i = new Invoice__c(Amount__c = 15, Status__c = 'New');
      Payment__c p = new Payment__c(Status__c = 'Paid');
    }
  }`},g=>{
    assert.ok(has(g,'Constructors',field('Invoice__c','Amount__c')));
    assert.ok(has(g,'Constructors',field('Invoice__c','Status__c')));
    assert.ok(has(g,'Constructors',field('Payment__c','Status__c')));
    assert.ok(!has(g,'Constructors',field('Payment__c','Amount__c')));
  });
});

test('relationship fields resolve through CustomField.referenceTo, not by guessing target object',async()=>{
  await fixture({Relate:`public class Relate {
    private Invoice__c invoice;
    void run() {
      String a = invoice.Customer__r.Custom_Rating__c;
      String b = this.invoice.Customer__r.Custom_Rating__c;
      List<Invoice__c> rows = [SELECT Customer__r.Custom_Rating__c FROM Invoice__c];
    }
  }`},g=>{
    assert.ok(has(g,'Relate',field('Invoice__c','Customer__c')),'lookup field');
    assert.ok(has(g,'Relate',field('Account','Custom_Rating__c')),'target field');
    assert.ok(has(g,'Relate',object('Account')),'target object');
    assert.ok(!has(g,'Relate',field('Payment__c','Invoice__c')));
    assert.ok(evidence(g,'Relate',field('Account','Custom_Rating__c')).some(e=>e.rule==='APEX_SOQL_RELATIONSHIP_FIELD'));
  });
});

test('subquery fields are never incorrectly assigned to the outer SOQL object',async()=>{
  await fixture({Nested:`public class Nested {
    void run() {
      List<Invoice__c> rows = [SELECT Status__c,
          (SELECT Amount__c FROM Payments__r)
          FROM Invoice__c WHERE Total__c > 0];
    }
  }`},g=>{
    assert.ok(has(g,'Nested',field('Invoice__c','Status__c')));
    assert.ok(has(g,'Nested',field('Invoice__c','Total__c')));
    assert.ok(!has(g,'Nested',field('Invoice__c','Amount__c')),'inner query must not be assumed to query Invoice__c');
  });
});

test('get / put field names resolve only for known typed receivers, never arbitrary strings',async()=>{
  await fixture({GetPut:`public class GetPut {
    void run() {
      Invoice__c invoice = new Invoice__c();
      Object x = invoice.get('Amount__c');
      invoice.put('Status__c', 'Open');
      Object y = something.get('Total__c');
      String display = 'invoice.get(\'Customer__c\')';
    }
  }`},g=>{
    for(const f of ['Amount__c','Status__c'])assert.ok(has(g,'GetPut',field('Invoice__c',f)),f);
    assert.ok(!has(g,'GetPut',field('Invoice__c','Total__c')));
    assert.ok(!has(g,'GetPut',field('Invoice__c','Customer__c')));
  });
});

test('literal Database.query SOQL resolves fields; unrelated SOQL-looking strings do not',async()=>{
  await fixture({Dynamic:`public class Dynamic {
    void run() {
      List<SObject> a = Database.query('SELECT Status__c FROM Invoice__c');
      String innocent = 'SELECT Amount__c FROM Payment__c';
    }
  }`},g=>{
    assert.ok(has(g,'Dynamic',field('Invoice__c','Status__c')));
    assert.ok(!has(g,'Dynamic',field('Payment__c','Amount__c')));
  });
});

test('comments, arbitrary strings, unknown fields, and other objects do not produce field edges',async()=>{
  await fixture({Noise:`public class Noise {
    // [SELECT Status__c FROM Invoice__c]
    /* Invoice__c.Amount__c and Payment__c.Amount__c */
    String t = 'Invoice__c.Amount__c';
    void run() {
      System.debug('new Invoice__c(Amount__c=3)');
      Object x = other.Amount__c;
      List<Invoice__c> a = [SELECT Id, Unknown__c FROM Invoice__c];
    }
  }`},g=>{
    for(const f of Object.keys(definitions).flatMap(obj=>definitions[obj].map(f=>field(obj,f))))assert.ok(!has(g,'Noise',f),f);
    assert.ok(has(g,'Noise',object('Invoice__c')));
    assert.ok(!g.nodes.some(n=>n.id===field('Invoice__c','Unknown__c')));
  });
});

test('code-reference option disables field and SOQL inspection',async()=>{
  await fixture({Disabled:'public class Disabled { Invoice__c i = new Invoice__c(Amount__c = 1); }'},g=>{
    assert.ok(!has(g,'Disabled',field('Invoice__c','Amount__c')));
  },{includeCodeReferences:false});
});

test('real enterprise fixture Apex class exposes SOQL fields and their reverse links',async()=>{
  const enterprise=path.resolve(__dirname,'../fixtures/enterprise/force-app');
  const g=await new AnalysisService().analyze(enterprise);
  assert.ok(has(g,'BillingService',field('Invoice__c','Amount__c')));
  assert.ok(has(g,'BillingService',object('Invoice__c')));
  assert.ok(!has(g,'BillingService',field('Invoice__c','NeverUsed__c')));
  assert.ok(neighborhood(g,[field('Invoice__c','Amount__c')],'in',1).nodes.some(n=>n.id===source('BillingService')));
});
