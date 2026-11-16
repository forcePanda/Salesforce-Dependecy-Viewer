'use strict';
const path=require('node:path');
const {parseXml,value,one,makeLineLocator}=require('./xml');
const {identifyFile,idOf}=require('./identity');
const SUPPORTED_CODE=new Set(['.cls','.trigger','.js','.html','.cmp','.app','.evt','.page','.component','.email']);
const NESTED={fields:'CustomField',recordTypes:'RecordType',validationRules:'ValidationRule',fieldSets:'FieldSet',listViews:'ListView',compactLayouts:'CompactLayout',businessProcesses:'BusinessProcess',webLinks:'WebLink',sharingReasons:'SharingReason',rules:'WorkflowRule',alerts:'WorkflowAlert',fieldUpdates:'WorkflowFieldUpdate',tasks:'WorkflowTask',outboundMessages:'WorkflowOutboundMessage',flowActions:'WorkflowFlowAction',labels:'CustomLabel'};

function parseSource(rel,raw){
  const identity=identifyFile(rel);
  const components=[],code=[],diagnostics=[];
  if(!identity)return {components,code,diagnostics,raw};
  const id=idOf(identity.type,identity.name);
  const component={type:identity.type,name:identity.name,file:rel,sources:[rel]};
  if(identity.isCode){
    components.push(component);
    if(SUPPORTED_CODE.has(path.extname(rel).toLowerCase()))code.push({id,rel,text:raw,locate:makeLineLocator(raw)});
    return {components,code,diagnostics,raw};
  }
  if(rel.endsWith('.json')){
    // Experience bundle JSON is an unstructured nested format. Do not invent dependencies.
    diagnostics.push({severity:'info',file:rel,message:'JSON metadata detected; dependency rules are not yet implemented for this format'});
    return {components,code,diagnostics,raw};
  }
  if(!rel.endsWith('.xml'))return {components,code,diagnostics,raw};
  try{
    const xml=parseXml(raw);
    if(!/^[A-Z]/.test(xml.name))return {components,code,diagnostics,raw};
    component.xml=xml;component.locate=makeLineLocator(raw);
    component.flowObject=xml.name==='Flow'?value(one(xml,'start'),'object'):'';
    component.emailObject=xml.name==='EmailTemplate'?value(xml,'relatedEntityType'):'';
    components.push(component);
    // MDAPI source format: sub-components can be embedded under the parent XML.
    if(xml.name==='CustomObject'||xml.name==='Workflow'||xml.name==='CustomLabels'){
      for(const child of xml.children){
        const type=NESTED[child.name];if(!type)continue;
        const partName=value(child,'fullName')||value(child,'name');if(!partName)continue;
        const parentName=identity.name;
        const childName=xml.name==='CustomLabels'?partName:`${parentName}.${partName}`;
        components.push({type,name:childName,file:rel,sources:[rel],xml:child,locate:component.locate,flowObject:''});
      }
    }
  }catch(e){diagnostics.push({severity:'error',file:rel,message:`Invalid XML: ${e.message}`});}
  return {components,code,diagnostics,raw};
}
/** Mask comments and optionally literals, preserving all character offsets and newlines.
 * Unlike regex comment stripping, this never treats // inside a quoted string as a comment.
 */
function maskSource(raw,maskStrings=false){
  let result='', state='code', quote='';
  for(let i=0;i<raw.length;i++){
    const c=raw[i], n=raw[i+1]||'';
    const blank=x=>x==='\n'||x==='\r'?x:' ';
    if(state==='line') {if(c==='\n'||c==='\r'){state='code';result+=c;}else result+=' ';continue;}
    if(state==='htmlcomment'){if(raw.startsWith('-->',i)){result+='   ';i+=2;state='code';}else result+=blank(c);continue;}
    if(state==='block') {if(c==='*'&&n==='/'){result+='  ';i++;state='code';}else result+=blank(c);continue;}
    if(state==='string') {
      if(c==='\\'&&i+1<raw.length){result+=maskStrings?blank(c):c;result+=maskStrings?blank(n):n;i++;continue;}
      result+=maskStrings?blank(c):c;
      if(c===quote)state='code';continue;
    }
    if(raw.startsWith('<!--',i)){state='htmlcomment';result+='    ';i+=3;continue;}
    if(c==='/'&&n==='/'){state='line';result+='  ';i++;continue;}
    if(c==='/'&&n==='*'){state='block';result+='  ';i++;continue;}
    if(c==='\"'||c==="'"||c==='`'){state='string';quote=c;result+=maskStrings?' ':c;continue;}
    result+=c;
  }
  return result;
}

module.exports={parseSource,maskSource,SUPPORTED_CODE};
