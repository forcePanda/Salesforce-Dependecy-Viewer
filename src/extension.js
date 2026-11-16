'use strict';
const vscode=require('vscode');
const path=require('node:path');
const fs=require('node:fs/promises');
const crypto=require('node:crypto');
const {AnalysisService}=require('./analyzer');
const {projectScope}=require('./graph-scope');
const {graphViewModel}=require('./graph-view-model');
const {LatestAnalysisController}=require('./analysis-controller');
const {identifyFile,idOf}=require('./identity');
const analyzer=new AnalysisService();
const requests=new LatestAnalysisController();
let storageRoot='';
let lastPanel=null;
let lastModel=null;
let lastContext=null;
let lastScope={kind:'base'};
let debounceTimer;
let updateGeneration=0;
function within(base,target){const relative=path.relative(base,target);return relative===''||(!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative));}
async function pickWorkspace(preferred){
  const workspaces=vscode.workspace.workspaceFolders||[];
  if(!workspaces.length){vscode.window.showErrorMessage('SFDV: Open a Salesforce project folder in VS Code first.');return null;}
  if(preferred){const found=vscode.workspace.getWorkspaceFolder(preferred);if(found)return found;}
  if(workspaces.length===1)return workspaces[0];
  return await vscode.window.showQuickPick(workspaces.map(f=>({label:f.name,description:f.uri.fsPath,folder:f})),{placeHolder:'SFDV: Select a workspace'}).then(choice=>choice?.folder||null);
}
async function resolveConfiguredSource(workspace){
  const config=vscode.workspace.getConfiguration('sfdv',workspace.uri);
  const folder=String(config.get('sourceFolder','force-app')).trim();
  if(!folder||path.isAbsolute(folder)||folder.split(/[\\/]+/).includes('..')){
    vscode.window.showErrorMessage('SFDV: sourceFolder must be a workspace-relative folder without "..".');return null;
  }
  const absolute=path.resolve(workspace.uri.fsPath,folder);
  if(!within(workspace.uri.fsPath,absolute)){
    vscode.window.showErrorMessage('SFDV: sourceFolder cannot leave the workspace.');return null;
  }
  try{
    const stat=await fs.stat(absolute);if(!stat.isDirectory())throw new Error('not a directory');
    // A workspace-relative symlink must not redirect analysis outside that workspace.
    const realWorkspace=await fs.realpath(workspace.uri.fsPath);
    const realSource=await fs.realpath(absolute);
    if(!within(realWorkspace,realSource)){
      vscode.window.showErrorMessage('SFDV: sourceFolder resolves outside the workspace through a symlink.');
      return null;
    }
  }catch{vscode.window.showErrorMessage(`SFDV: Source folder does not exist: ${folder}. Update sfdv.sourceFolder in Settings.`);return null;}
  return {absolute,relative:folder,workspace,config};
}
async function build(source){
  return vscode.window.withProgress({location:vscode.ProgressLocation.Notification,title:`SFDV: Analyzing ${source.relative}`,cancellable:false},async()=>{
    const model=await analyzer.analyze(source.absolute,{
      maxFiles:source.config.get('maxFiles',20000),maxFileSizeKB:source.config.get('maxFileSizeKB',5120),
      includeCodeReferences:source.config.get('includeCodeReferences',true),customRules:source.config.get('customRules',[]),
      persistIndex:source.config.get('persistIndex',true),cacheDir:storageRoot
    });
    return model;
  });
}
function chooseCurrentNodes(model,rel){
  const ids=model.sourceToIds[rel]||[];
  const identified=identifyFile(rel);
  const exact=identified?idOf(identified.type,identified.name):'';
  if(ids.includes(exact)){
    if(identified.type==='CustomObject'||identified.type==='Workflow'||identified.type==='CustomLabels')return ids;
    return [exact];
  }
  return ids;
}
async function execute(kind){
  const request=requests.begin();
  const editor=vscode.window.activeTextEditor;
  const workspace=await pickWorkspace(editor?.document.uri);
  if(!requests.isCurrent(request))return;
  if(!workspace)return;
  const source=await resolveConfiguredSource(workspace);if(!source||!requests.isCurrent(request))return;
  let rel=null;
  if(kind!=='org'){
    if(!editor||editor.document.uri.scheme!=='file'){
      vscode.window.showWarningMessage('SFDV: Open a Salesforce metadata file in the editor first.');return;
    }
    const realFile=path.resolve(editor.document.uri.fsPath);
    if(!within(source.absolute,realFile)){
      vscode.window.showWarningMessage(`SFDV: The current file is outside the configured source folder (${source.relative}).`);return;
    }
    if(editor.document.isDirty)vscode.window.showInformationMessage('SFDV: Unsaved editor changes are not included; analysis uses files on disk.');
    rel=path.relative(source.absolute,realFile).split(path.sep).join('/');
    if(!identifyFile(rel)){vscode.window.showWarningMessage('SFDV: This file is not a recognized Salesforce Metadata API source file.');return;}
  }
  let model;
  try{model=await build(source);}catch(error){if(requests.isCurrent(request))vscode.window.showErrorMessage(`SFDV: ${error.message}`);return;}
  if(!requests.isCurrent(request))return;
  const focus=rel?chooseCurrentNodes(model,rel):[];
  if(rel&&!focus.length){vscode.window.showWarningMessage('SFDV: No metadata components were indexed for this file. See diagnostics in the graph.');}
  lastModel=model;lastContext={kind,focus,source,rel};lastScope={kind:'base'};
  renderPanel();
}
function getPayload(model,context,scope={kind:'base'}){
  const {graph,catalog,fileCatalog}=graphViewModel(model);
  const maxNodes=context.source.config.get('maxGraphNodes',1200);
  const subset=projectScope(graph,context,scope,maxNodes);
  const focusIds=scope.kind==='focus'?[scope.id]:scope.kind==='file'?subset.selected:scope.kind==='base'?context.focus:[];
  return {type:'graph',data:{...subset,stats:model.stats,catalog,fileCatalog,
    diagnostics:model.diagnostics,unresolved:model.unresolved,ambiguous:model.ambiguous,unverifiedCandidates:model.unverifiedCandidates,
    dynamicConstructs:model.dynamicConstructs,fileCoverage:model.fileCoverage,coverage:model.coverage,uncoveredTypes:model.uncoveredTypes,
    mode:subset.mode,origin:context.kind,scope,startingFile:context.rel,sourceFolder:context.source.relative,focusIds}};
}
function renderPanel(){
  if(!lastModel||!lastContext)return;
  const context=lastContext;
  if(!lastPanel){
    lastPanel=vscode.window.createWebviewPanel('sfdvDependencyGraph','SFDV · Dependency Explorer',vscode.ViewColumn.One,{
      enableScripts:true,retainContextWhenHidden:true,localResourceRoots:[vscode.Uri.joinPath(context.source.workspace.uri,'__sfdv_nonexistent__'),vscode.Uri.file(path.join(__dirname,'..','media'))]
    });
    lastPanel.onDidDispose(()=>{requests.invalidate();lastPanel=null;lastModel=null;lastContext=null;clearTimeout(debounceTimer);watcher?.dispose();watcher=null;});
    lastPanel.webview.onDidReceiveMessage(async(message)=>{
      try{
        if(!lastModel||!lastContext)return;
        if(message.type==='ready')postGraph();
        if(message.type==='navigate'&&message.scope&&typeof message.scope==='object'){
          const requested=message.scope;
          if(requested.kind==='focus'){
            if(typeof requested.id!=='string'||!graphViewModel(lastModel).byId.has(requested.id))return;
            lastScope={kind:'focus',id:requested.id,direction:['in','out','both'].includes(requested.direction)?requested.direction:'both',depth:Math.min(3,Math.max(1,Number(requested.depth)||1))};
          }else if(requested.kind==='file'){
            if(typeof requested.file!=='string'||requested.file.length>2048)return;
            lastScope={kind:'file',file:requested.file};
          }else if(requested.kind==='types'&&lastContext.kind==='org'){
            const types=new Set(lastModel.nodes.map(n=>n.type));
            lastScope={kind:'types',types:[...new Set(Array.isArray(requested.types)?requested.types.filter(x=>typeof x==='string'&&types.has(x)):[])].sort()};
          }else if(requested.kind==='base')lastScope={kind:'base'};
          else return;
          postGraph();
        }
        if(message.type==='refresh')await refreshAnalysis();
        if(message.type==='openSource')await openSource(message);
      }catch(error){vscode.window.showErrorMessage(`SFDV: ${error.message}`);}
    });
  }
  lastPanel.title= context.kind==='org'?'SFDV · Org dependency graph':context.kind==='out'?'SFDV · Referenced metadata':'SFDV · Referencing metadata';
  const webview=lastPanel.webview;
  const nonce=crypto.randomBytes(16).toString('base64');
  const uri=name=>webview.asWebviewUri(vscode.Uri.file(path.join(__dirname,'..','media',name)));
  webview.html=`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';"><title>SFDV</title><link href="${uri('style.css')}" rel="stylesheet"></head><body><div id="app"></div><script nonce="${nonce}" src="${uri('graph-highlights.js')}"></script><script nonce="${nonce}" src="${uri('navigation-history.js')}"></script><script nonce="${nonce}" src="${uri('app.js')}"></script></body></html>`;
  lastPanel.reveal(vscode.ViewColumn.One,true);
  setupWatcher(context.source);
}
async function refreshAnalysis(source=lastContext?.source){
  if(!lastPanel||!source)return;
  const request=requests.begin();
  try{
    const next=await build(source);
    if(!requests.isCurrent(request)||!lastPanel||lastContext?.source.absolute!==source.absolute)return;
    lastModel=next;postGraph();
  }catch(error){if(requests.isCurrent(request))vscode.window.showWarningMessage(`SFDV: Could not refresh dependencies: ${error.message}`);}
}
function postGraph(){if(lastPanel&&lastModel&&lastContext)lastPanel.webview.postMessage(getPayload(lastModel,lastContext,lastScope));}
async function openSource(message){
  if(!lastContext||typeof message.file!=='string')return;
  const base=lastContext.source.absolute;
  const file=path.resolve(base,message.file);
  if(!within(base,file))return;
  const real=await fs.realpath(file).catch(()=>null);
  if(!real||!within(base,real))return;
  const doc=await vscode.workspace.openTextDocument(vscode.Uri.file(real));
  const editor=await vscode.window.showTextDocument(doc,{viewColumn:vscode.ViewColumn.Beside,preview:true});
  const line=Math.max(0,Math.min(doc.lineCount-1,Number(message.line||1)-1));
  const position=new vscode.Position(line,0);
  editor.selection=new vscode.Selection(position,position);
  editor.revealRange(new vscode.Range(position,position),vscode.TextEditorRevealType.InCenter);
}
let watcher;
function setupWatcher(source){
  watcher?.dispose();
  watcher=vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(vscode.Uri.file(source.absolute),'**/*'));
  const update=()=>{
    // Invalidate an ongoing scan immediately, not after the debounce expires.
    requests.invalidate();
    clearTimeout(debounceTimer);
    debounceTimer=setTimeout(()=>{if(lastContext?.source.absolute===source.absolute)void refreshAnalysis(source);},750);
  };
  watcher.onDidChange(update);watcher.onDidCreate(update);watcher.onDidDelete(update);
}
function activate(context){
  storageRoot=context.globalStorageUri?.fsPath||'';
  context.subscriptions.push(vscode.commands.registerCommand('SFDV.showOrgDependencyGraph',()=>execute('org')));
  context.subscriptions.push(vscode.commands.registerCommand('SFDV.showReferencedMetadata',()=>execute('out')));
  context.subscriptions.push(vscode.commands.registerCommand('SFDV.showReferencingMetadata',()=>execute('in')));
  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(event=>{
    if(!event.affectsConfiguration('sfdv')||!lastContext)return;
    clearTimeout(debounceTimer);
    // Settings changes use the next invocation to resolve the source anew.
    vscode.window.showInformationMessage('SFDV: Settings changed. Run an SFDV command to reanalyze with the new settings.');
  }));
}
function deactivate(){requests.dispose();watcher?.dispose();clearTimeout(debounceTimer);}
module.exports={activate,deactivate};
