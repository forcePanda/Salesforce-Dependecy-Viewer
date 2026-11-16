'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Module=require('module');
test('VS Code host registers all three SFDV-prefixed command IDs',()=>{
  const original=Module._load;
  const commands=[];
  const vscode={commands:{registerCommand:(name,handler)=>{commands.push({name,handler});return {dispose(){}};}},workspace:{onDidChangeConfiguration:()=>({dispose(){}})}};
  try{
    Module._load=function(request,parent,isMain){if(request==='vscode')return vscode;return original.apply(this,arguments);};
    const ext=require('../src/extension');ext.activate({subscriptions:[]});
    assert.deepEqual(commands.map(x=>x.name),['SFDV.showOrgDependencyGraph','SFDV.showReferencedMetadata','SFDV.showReferencingMetadata']);
  }finally{Module._load=original;}
});
