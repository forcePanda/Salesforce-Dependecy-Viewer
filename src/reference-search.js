'use strict';
const {makeLineLocator}=require('./xml');
const {idOf}=require('./identity');
/** Build a token->component inverted index once. Broad matches are *never*
 * promoted to graph edges; they remain suggestions for a stronger parser.
 */
function findUnverifiedReferences(fragments,nodes,resolvedEdges,maskSource,cap=1000){
  const dictionary=new Map();
  const include=new Set(['ApexClass','CustomObject','CustomField','Flow','CustomLabel']);
  for(const node of nodes.values()){
    if(!include.has(node.type)||node.implicit)continue;
    const key=node.name.toLowerCase();
    if(!dictionary.has(key))dictionary.set(key,[]);
    dictionary.get(key).push(node.id);
  }
  const edges=new Set(resolvedEdges.map(e=>`${e.source}|${e.target}`));
  const candidates=[],seen=new Set();let truncated=false;
  function collect(source,file,content,locate,kind){
    const pattern=/\b[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)?\b/g;let m;
    while((m=pattern.exec(content))){
      for(const target of dictionary.get(m[0].toLowerCase())||[]){
        if(source===target||edges.has(`${source}|${target}`))continue;
        const line=locate(m.index),key=`${source}|${target}|${file}|${line}`;
        if(seen.has(key))continue;seen.add(key);
        if(candidates.length>=cap){truncated=true;return;}
        candidates.push({source,target,status:'unverified',file,line,match:m[0],origin:kind,
          reason:'Lexical identifier found without a validated syntactic dependency'});
      }
    }
  }
  for(const fragment of fragments){
    for(const source of fragment.code){
      if(!['ApexClass','ApexTrigger','LightningComponentBundle','AuraDefinitionBundle','ApexPage','ApexComponent'].some(t=>source.id.startsWith(t+':')))continue;
      collect(source.id,source.rel,maskSource(source.text,true),source.locate,'code');
      if(truncated)break;
    }
    if(truncated)break;
    for(const comp of fragment.components){
      if(!comp.xml)continue;
      const source=idOf(comp.type,comp.name);
      const stack=[comp.xml];
      while(stack.length){
        const item=stack.pop();
        if(item.children.length){stack.push(...item.children);continue;}
        if(['label','fullName','description','masterLabel','errorMessage','inlineHelpText','helpText'].includes(item.name))continue;
        const content=item.text||'';
        // Only identifier-sized XML values, not long formulas or prose. Formula
        // analysis has a dedicated semantic parser and lexical matches alone
        // must not create edges.
        if(content.length>160||!content.trim())continue;
        const locate=()=>comp.locate(item.offset);
        collect(source,comp.file,content,locate,'xml');
        if(truncated)break;
      }
      if(truncated)break;
    }
    if(truncated)break;
  }
  return {candidates,truncated};
}
/** Flag dynamic constructs without pretending to know their targets. */
function discoverDynamicConstructs(fragment,maskSource){
  const findings=[];
  for(const entry of fragment.code){
    if(!/^Apex(?:Class|Trigger):/.test(entry.id))continue;
    const text=maskSource(entry.text,false),code=maskSource(entry.text,true);
    const patterns=[
      {kind:'DYNAMIC_SOQL',re:/\bDatabase\s*\.\s*(?:query|countQuery|queryWithBinds)\s*\(/g},
      {kind:'DYNAMIC_CLASS',re:/\bType\s*\.\s*forName\s*\(/g},
      {kind:'DYNAMIC_SOBJECT',re:/\bSchema\s*\.\s*getGlobalDescribe\s*\(\s*\)\s*\.\s*get\s*\(/g}
    ];
    for(const item of patterns){let m;while((m=item.re.exec(code))){
      const argument=text.slice(m.index+m[0].length).trimStart();
      if(item.kind!=='DYNAMIC_SOBJECT'){
        const quoted=/^(['"])((?:\\.|(?!\1)[\s\S])*?)\1/.exec(argument);
        if(quoted&&/^\s*[,)]/.test(argument.slice(quoted[0].length)))continue;
      }
      findings.push({source:entry.id,file:entry.rel,line:entry.locate(m.index),kind:item.kind,
        reason:'Dynamic reference cannot be resolved reliably from repository metadata alone'});
    }}
  }
  return findings;
}
module.exports={findUnverifiedReferences,discoverDynamicConstructs};
