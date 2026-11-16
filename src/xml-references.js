'use strict';
const {children,value}=require('./xml');
const {idOf}=require('./identity');
const FORMULA_RULE_TYPES=new Set(['ValidationRule','CustomField','Flow','WorkflowRule','WorkflowFieldUpdate','ApprovalProcess']);


function clean(v){return String(v||'').trim().replace(/^['"]|['"]$/g,'');}
function parentObject(comp){
  if(comp.type==='Layout')return comp.name.split('/').pop().split('-')[0];
  if(comp.type==='CustomObject'||comp.type==='Workflow')return comp.name;
  if(comp.type==='Flow')return comp.flowObject||'';
  const idx=comp.name.indexOf('.');return idx>0?comp.name.slice(0,idx):'';
}
function looksLikeObject(s){return /^(?:[A-Za-z][\w]*__(?:c|e|mdt|x|b|kav)|[A-Z][A-Za-z0-9_]+)$/.test(s);}
function convertValue(raw,rule,comp,element,components){
  const v=clean(raw);if(!v||v==='SYSTEM'||v==='NONE'||v==='null'||v==='-1')return [];
  const obj=parentObject(comp);
  switch(rule.transform){
    case 'identity':case 'maybeName': return [v];
    case 'tabObject': return v==='true'?[comp.name]:v==='false'?[]:[v];
    case 'localField':return [v.includes('.')?v:obj?`${obj}.${v}`:v];
    case 'objectField':return [v.includes('.')?v:obj?`${obj}.${v}`:v];
    case 'localChild':return [v.includes('.')?v:obj?`${obj}.${v}`:v];
    case 'layoutField':{
      const s=v.replace(/^\$Record\./,'');return [s.includes('.')?s:obj?`${obj}.${s}`:s];
    }
    case 'reportField':return [v];
    case 'relatedListObject':{
      // Common layout related-list format: Contacts, CustomObj__r or EntityApiName.ChildRelationship
      return v.includes('.')?[v.split('.')[0]]:[];
    }
    case 'componentName':{
      if(v.startsWith('c:'))return [v.slice(2)];
      if(v.startsWith('c-'))return [kebabToCamel(v.slice(2))];
      if(v.startsWith('c/'))return [v.slice(2)];
      if(v.startsWith('force:')||v.startsWith('flexipage:')||v.startsWith('standard:')||v.startsWith('lightning:'))return [];
      if(v.includes(':'))return [v.split(':').pop()];
      return [v];
    }
    case 'flowField':{
      if(v.includes('.'))return [v.startsWith('$Record.')&&obj?`${obj}.${v.slice(8)}`:v];
      // Find nearest operation-level object; don't assume an unqualified field belongs to $Record.
      let p=element?.parent;
      for(let depth=0;p&&depth<8;p=p.parent,depth++){
        const localObject=value(p,'object');if(localObject)return [`${localObject}.${v}`];
      }
      return [];
    }
    case 'customMetadataField':{
      // Metadata record fullName is TypeName.RecordName without __mdt.
      const metadataType=comp.name.split('.')[0];
      const owner=metadataType.endsWith('__mdt')?metadataType:`${metadataType}__mdt`;
      return [`${owner}.${v}`];
    }
    case 'mergeFormula':{
      const result=new Set();let m;
      const expression=/\{!\s*([^}]+)\s*\}/g;
      while((m=expression.exec(v)))for(const candidate of extractFormulaCandidates(m[1],obj,components))result.add(candidate);
      return [...result];
    }
    case 'mergeLabel':{
      const result=new Set();let m;
      const expression=/\{!\s*([^}]+)\s*\}/g;
      while((m=expression.exec(v)))for(const candidate of extractLabelReferences(m[1]))result.add(candidate);
      return [...result];
    }
    case 'formula': return extractFormulaCandidates(v,obj,components);
    case 'formulaLabel':return extractLabelReferences(v);
    case 'qualifiedField':return /^\w+(?:__\w+)?\.[A-Za-z_]\w*$/.test(v)?[v]:[];
    case 'flowExpression':{
      // Flow resource references are not necessarily metadata: only resolve
      // typed record variables, record operations, and $Record field access.
      const binding=flowRecordOwners(comp,element);
      let m=/^\$Record\.([A-Za-z_]\w*)$/.exec(v);
      if(m)return obj?[`${obj}.${m[1]}`]:[];
      m=/^([A-Za-z_]\w*)\.([A-Za-z_]\w*)$/.exec(v);
      if(!m)return [];
      const owner=binding.get(m[1]);
      return owner?[`${owner}.${m[2]}`]:[];
    }
    default: return [v];
  }
}
function extractLabelReferences(expression){
  const withoutStrings=expression.replace(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"/g,' ');
  const found=new Set();let m;
  const pattern=/\$Label\.(?:(?:c|[A-Za-z_]\w*)\.)?([A-Za-z_]\w*)/g;
  while((m=pattern.exec(withoutStrings)))found.add(m[1]);
  return [...found];
}
const FLOW_OWNER_CACHE=new WeakMap();
function flowRecordOwners(comp,element){
  const root=element?.root||null;
  if(root&&FLOW_OWNER_CACHE.has(root))return FLOW_OWNER_CACHE.get(root);
  const result=new Map();
  if(comp.flowObject)result.set('$Record',comp.flowObject);
  if(!root)return result;
  for(const variable of children(root,'variables')){
    const key=value(variable,'name'),object=value(variable,'objectType');
    if(key&&object)result.set(key,object);
  }
  for(const section of ['recordLookups','recordCreates','recordUpdates','recordDeletes']){
    for(const operation of children(root,section)){
      const name=value(operation,'name'),object=value(operation,'object');
      if(name&&object)result.set(name,object);
    }
  }
  if(root)FLOW_OWNER_CACHE.set(root,result);
  return result;
}
function kebabToCamel(v){return v.replace(/-([a-z0-9])/g,(_,c)=>c.toUpperCase());}
function conditionOk(element,when){
  if(!when)return true;
  const parent=element.parent;
  if(!parent)return false;
  if(when.oneOf&&when.sibling)return when.oneOf.includes(value(parent,when.sibling));
  if(when.sibling){const test=value(parent,when.sibling);return when.equals===undefined?Boolean(test):test===String(when.equals);}
  if(Array.isArray(when.anyTrue))return when.anyTrue.some(k=>value(parent,k)==='true');
  return true;
}
// A formula is not arbitrary prose: conservatively recognize API-like field tokens.
function extractFormulaCandidates(expression,obj,components){
  const withoutStrings=expression.replace(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"/g,' ');
  const tokens=withoutStrings.match(/\$?[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*/g)||[];
  const found=new Set();
  for(let token of tokens){
    if(/^\$Record\./.test(token))token=obj?`${obj}.${token.slice(8)}`:'';
    if(!token||/^\$(?:Flow|User|Profile|Organization|System)\b/.test(token))continue;
    if(token.startsWith('$Label.'))continue;
    if(token.startsWith('$'))continue;
    const id=token.includes('.')?token:obj?`${obj}.${token}`:token;
    if(components?.has(idOf('CustomField',id)))found.add(id);
    else if(/__(?:c|r)$/.test(token)&&obj)found.add(id);
  }
  return [...found];
}


module.exports={convertValue,conditionOk,extractFormulaCandidates,extractLabelReferences,FORMULA_RULE_TYPES};
