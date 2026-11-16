'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const Module=require('node:module');
const {AnalysisService}=require('../src/analyzer');
const {buildAdjacency}=require('../src/graph-queries');

function model(name,root){
  const node={id:`ApexClass:${name}`,name,type:'ApexClass',label:name,file:`main/default/classes/${name}.cls`,sources:[`main/default/classes/${name}.cls`],implicit:false};
  return {nodes:[node],edges:[],unresolved:[],ambiguous:[],diagnostics:[],coverage:{status:'best_effort'},
    unverifiedCandidates:[],dynamicConstructs:[],fileCoverage:[],uncoveredTypes:[],
    adjacency:buildAdjacency([]),sourceRoot:root,
    sourceToIds:{[node.file]:[node.id]},stats:{files:1,filesParsed:1,filesReused:0,nodes:1,edges:0,unresolved:0,errors:0}};
}
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
async function waitFor(check){
  for(let i=0;i<60;i++){
    if(check())return;
    await new Promise(r=>setTimeout(r,5));
  }
  assert.fail('Timed out waiting for simulated VS Code host');
}

test('command integration: superseded analysis never commits into a newer graph session',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'sfdv-host-'));
  const source=path.join(dir,'force-app');
  await fs.mkdir(source,{recursive:true});
  const ws={name:'Project',uri:{scheme:'file',fsPath:dir}};
  const commandHandlers=new Map(),panels=[],warnings=[],errors=[],watchers=[];
  const mock={
    commands:{registerCommand:(id,fn)=>{commandHandlers.set(id,fn);return {dispose(){}};}},
    workspace:{workspaceFolders:[ws],getWorkspaceFolder:()=>ws,
      getConfiguration:()=>({get:(_key,def)=>def}),
      onDidChangeConfiguration:()=>({dispose(){}}),
      createFileSystemWatcher:()=>{const listener={dispose(){this.disposed=true;},onDidChange(cb){this.change=cb;},onDidCreate(cb){this.create=cb;},onDidDelete(cb){this.delete=cb;}};watchers.push(listener);return listener;}
    },
    Uri:{file:(f)=>({scheme:'file',fsPath:f}),joinPath:(uri,part)=>({scheme:'file',fsPath:path.join(uri.fsPath,part)})},
    RelativePattern:class RelativePattern{constructor(base,glob){this.base=base;this.pattern=glob;}},
    ProgressLocation:{Notification:1},ViewColumn:{One:1,Beside:2},
    window:{activeTextEditor:null,
      withProgress:(_opts,cb)=>cb(),showErrorMessage:(str)=>errors.push(str),showWarningMessage:(str)=>warnings.push(str),
      showInformationMessage(){},
      createWebviewPanel:()=>{
        const panel={webview:{cspSource:'vscode-resource:',html:'',sent:[],asWebviewUri:x=>x.fsPath,
            onDidReceiveMessage(handler){this.receive=handler;},postMessage(message){this.sent.push(message);return Promise.resolve(true);}},
          onDidDispose(cb){this.disposeHandler=cb;},reveal(){},dispose(){this.disposeHandler?.();}};
        panels.push(panel);return panel;
      }}
  };
  const oldLoader=Module._load,oldAnalyze=AnalysisService.prototype.analyze;
  const queued=[];
  let ext;
  try{
    Module._load=function(request,parent,isMain){if(request==='vscode')return mock;return oldLoader.apply(this,arguments);};
    delete require.cache[require.resolve('../src/extension')];
    ext=require('../src/extension');
    AnalysisService.prototype.analyze=function(){const d=deferred();queued.push(d);return d.promise;};
    ext.activate({subscriptions:[],globalStorageUri:{fsPath:path.join(dir,'index')}});
    assert.equal(commandHandlers.size,3);
    const command=commandHandlers.get('SFDV.showOrgDependencyGraph');
    const first=command();
    await waitFor(()=>queued.length===1);
    const second=command();
    await waitFor(()=>queued.length===2);
    // Complete the second request first. The older request must be discarded.
    queued[1].resolve(model('Newer',source));
    await second;
    assert.equal(panels.length,1);
    const panel=panels[0];
    await panel.webview.receive({type:'ready'});
    assert.equal(panel.webview.sent.at(-1).data.catalog[0].id,'ApexClass:Newer');
    assert.equal(panel.webview.sent.at(-1).data.nodes.length,0,'org overview remains empty');
    queued[0].resolve(model('Older',source));
    await first;
    assert.equal(panel.webview.sent.at(-1).data.catalog[0].id,'ApexClass:Newer');
    await panel.webview.receive({type:'navigate',scope:{kind:'focus',id:'ApexClass:Newer'}});
    assert.equal(panel.webview.sent.at(-1).data.nodes[0].id,'ApexClass:Newer');
    // A panel disposed while a refresh is running must not be resurrected.
    const pendingRefresh=panel.webview.receive({type:'refresh'});
    await waitFor(()=>queued.length===3);
    const sent=panel.webview.sent.length;
    panel.dispose();
    queued[2].resolve(model('StaleRefresh',source));
    await pendingRefresh;
    assert.equal(panel.webview.sent.length,sent);
    assert.equal(warnings.length,0);assert.equal(errors.length,0);
    assert.ok(watchers.some(w=>w.disposed));
  }finally{
    ext?.deactivate();
    AnalysisService.prototype.analyze=oldAnalyze;
    Module._load=oldLoader;
    delete require.cache[require.resolve('../src/extension')];
    await fs.rm(dir,{recursive:true,force:true});
  }
});
