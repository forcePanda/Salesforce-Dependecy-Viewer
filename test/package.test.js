'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const p=require('../package.json');
test('all user-facing commands have SFDV: names and SFDV. identifiers',()=>{
  const commands=p.contributes.commands;
  assert.equal(commands.length,3);
  for(const c of commands){assert.ok(c.title.startsWith('SFDV: '),c.title);assert.ok(c.command.startsWith('SFDV.'),c.command);}
  assert.equal(new Set(commands.map(c=>c.command)).size,3);
});
test('default source scope is force-app, resource scoped and customizable',()=>{
  const prop=p.contributes.configuration.properties['sfdv.sourceFolder'];
  assert.equal(prop.default,'force-app');assert.equal(prop.type,'string');assert.equal(prop.scope,'resource');
});
test('all three commands activate their extension entrypoints',()=>{
  const commands=p.contributes.commands.map(c=>c.command);
  for(const command of commands)assert.ok(p.activationEvents.includes('onCommand:'+command));
  assert.equal(p.main,'./src/extension.js');
});
test('core analysis requires no runtime npm modules or Salesforce login',()=>{
  assert.ok(!p.dependencies||Object.keys(p.dependencies).length===0);
  assert.ok(p.scripts.test.includes('node --test'));
});
