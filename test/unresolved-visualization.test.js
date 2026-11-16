'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {withUnresolvedReferenceNodes}=require('../src/presentation');
const {neighborhood}=require('../src/analyzer');

const a={id:'ApexClass:Caller',type:'ApexClass',name:'Caller',sources:['classes/Caller.cls']};
const b={id:'ApexClass:Known',type:'ApexClass',name:'Known'};
const example={
  nodes:[a,b],edges:[{id:'e',source:a.id,target:b.id,relation:'INVOKES'}],
  unresolved:[
    {source:a.id,targetType:'CustomField',targetName:'Invoice__c.Missing__c',rule:'APEX_SOQL_FIELD',file:'classes/Caller.cls',line:7},
    {source:a.id,targetType:'CustomField',targetName:'Invoice__c.Missing__c',rule:'APEX_FIELD_ACCESS',file:'classes/Caller.cls',line:9},
    {source:a.id,targetType:'ApexClass',targetName:'Service',rule:'APEX_CLASS_USAGE',file:'classes/Caller.cls',line:15},
    {source:a.id,targetType:'Flow',targetName:'Fulfillment',rule:'APEX_FLOW_START',file:'classes/Caller.cls',line:18}
  ],
  ambiguous:[{source:a.id,targetType:'ApexClass',targetName:'Ambiguous',matches:['ApexClass:x','ApexClass:y']}],
  unverifiedCandidates:[{source:a.id,target:'Misleading',file:'classes/Caller.cls',line:20}]
};

test('all explicitly unresolved metadata types appear as grey-edge-capable provisional nodes',()=>{
  const out=withUnresolvedReferenceNodes(example);
  for(const id of ['UnresolvedCustomField:Invoice__c.Missing__c','UnresolvedApexClass:Service','UnresolvedFlow:Fulfillment']){
    assert.ok(out.nodes.some(n=>n.id===id&&n.unresolved===true),id);
    assert.ok(out.edges.some(e=>e.target===id&&e.unresolved===true&&e.relation==='UNRESOLVED_REFERENCE'),id);
    assert.ok(neighborhood(out,[a.id],'out',1).nodes.some(n=>n.id===id),id);
    assert.ok(neighborhood(out,[id],'in',1).nodes.some(n=>n.id===a.id),id);
  }
  assert.ok(!out.nodes.some(n=>n.name==='Ambiguous'||n.name==='Misleading'));
  assert.equal(out.edges.filter(e=>e.unresolved).length,3,'same source+target references share one visual edge');
  const fieldEdge=out.edges.find(e=>e.target==='UnresolvedCustomField:Invoice__c.Missing__c');
  assert.deepEqual(fieldEdge.evidence.map(e=>e.line),[7,9]);
  assert.equal(example.edges.length,1,'verified graph is never mutated');
  assert.equal(example.nodes.length,2,'unresolved nodes stay presentation-only');
  assert.equal(example.unresolved.length,4,'original unresolved evidence stays intact');
});

test('reject invalid or unqualified unresolved field candidates without affecting verified relationships',()=>{
  const graph={nodes:[a],edges:[],unresolved:[
    {source:a.id,targetType:'CustomField',targetName:'Unqualified__c'},
    {source:'ApexClass:UnknownSource',targetType:'Flow',targetName:'X'},
    {source:a.id,targetType:'ApexClass',targetName:'  '},
    {source:a.id,targetType:'Flow',targetName:'\nscript'},
  ]};
  const out=withUnresolvedReferenceNodes(graph);
  assert.equal(out.nodes.length,1);
  assert.equal(out.edges.length,0);
});

test('webview has three inspector metrics and renders unresolved edges with neutral grey dots',()=>{
  const src=fs.readFileSync(path.join(__dirname,'../media/app.js'),'utf8');
  const styles=fs.readFileSync(path.join(__dirname,'../media/style.css'),'utf8');
  assert.match(src,/\$\{allUnresolved\.length\}<\/b><span>Unresolved in scope<\/span>/);
  assert.match(src,/\$\{allUnresolved\.length\}/);
  assert.match(src,/ctx\.setLineDash\(e\.unresolved\?\[1\.5,5\]:\[\]\)/);
  assert.match(src,/ctx\.strokeStyle=e\.unresolved\?\(document\.documentElement\.dataset\.scheme==='dark'\?'#9ca3af':'#89939e'\)/);
  assert.match(styles,/grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
});
