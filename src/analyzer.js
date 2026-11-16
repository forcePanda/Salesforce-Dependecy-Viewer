'use strict';
const fs=require('node:fs/promises');
const crypto=require('node:crypto');
const {children,value,walk,pathMatches}=require('./xml');
const {idOf}=require('./identity');
const {customRuleSet}=require('./rules');
const {ReferenceResolver}=require('./reference-resolver');
const {loadIndex,saveIndex}=require('./persistent-index');
const {findUnverifiedReferences,discoverDynamicConstructs}=require('./reference-search');
const {convertValue,conditionOk,extractFormulaCandidates,extractLabelReferences,FORMULA_RULE_TYPES}=require('./xml-references');
const {parseSource,maskSource}=require('./source-parsing');
const {extractCodeReferences}=require('./code-references');
const {buildAdjacency,neighborhood}=require('./graph-queries');
const {collectSourceFiles,loadFragments}=require('./source-index');
/** Coordinates a serialized, content-verified source scan and graph assembly. */
class AnalysisService{
  constructor(){this.fileCache=new Map();this.previousStats={};this.loadedCacheRoots=new Set();this.graphSnapshots=new Map();this._queue=Promise.resolve();}
  async analyze(base,options={}){
    // Serialize per service: parallel scans must never mutate shared caches.
    const job=this._queue.then(()=>this._analyze(base,options));
    this._queue=job.catch(()=>{});
    return job;
  }
  async _analyze(base,options={}){
    const started=Date.now();
    const limit=options.maxFiles||20000,sizeLimit=(options.maxFileSizeKB||5120)*1024;
    const diagnostics=[];
    const root=await fs.realpath(base);
    const cacheDir=options.persistIndex===false?'':options.cacheDir||'';
    const cacheKey=cacheDir+'|'+root;
    if(cacheDir&&!this.loadedCacheRoots.has(cacheKey)){
      try{
        const saved=await loadIndex(cacheDir,root);
        for(const [file,record] of saved.records)if(!this.fileCache.has(file))this.fileCache.set(file,record);
        if(saved.graph&&saved.signature)this.graphSnapshots.set(cacheKey,{graph:saved.graph,signature:saved.signature});
      }catch(e){diagnostics.push({severity:'warning',file:'',message:`Persistent index cannot be read; will rebuild: ${e.message}`});}
      this.loadedCacheRoots.add(cacheKey);
    }
    const {rules,warnings:ruleWarnings}=customRuleSet(options.customRules);
    diagnostics.push(...ruleWarnings.map(message=>({severity:'warning',file:'',message})));
    const {files,truncated}=await collectSourceFiles(root,limit,diagnostics);
    const {fragments,changed,reused}=await loadFragments(files,root,sizeLimit,this.fileCache,diagnostics);
    const filesSignature=crypto.createHash('sha256').update(JSON.stringify({
      engine:require('../package.json').version,sourceRoot:root,
      options:{includeCodeReferences:options.includeCodeReferences!==false,customRules:options.customRules||[],
        maxFiles:limit,maxFileSizeKB:options.maxFileSizeKB||5120,maxUnverifiedCandidates:options.maxUnverifiedCandidates||1500},
      truncated,files:files.map(f=>{
        const entry=this.fileCache.get(f.absolute);return [f.rel,entry?.sha256];
      })
    })).digest('hex');
    const snapshot=this.graphSnapshots.get(cacheKey);
    if(cacheDir&&snapshot?.signature===filesSignature&&reused===files.length&&changed===0&&diagnostics.length===0){
      const graph=structuredClone(snapshot.graph);
      graph.stats.filesParsed=0;graph.stats.filesReused=reused;graph.stats.elapsedMs=Date.now()-started;
      graph.stats.graphReused=true;
      this.previousStats=graph.stats;
      return graph;
    }
    // Discovery pass. Extract identities before references so resolution is independent of file order.
    const nodes=new Map();const sourceToIds=new Map();
    function register(record){
      const id=idOf(record.type,record.name);
      const old=nodes.get(id);
      if(old){if(record.emailObject)old.emailObject=record.emailObject;for(const f of record.sources||[])if(!old.sources.includes(f))old.sources.push(f);if(old.implicit&&!record.implicit){old.implicit=false;old.file=record.file||old.file;}return old;}
      const node={id,type:record.type,name:record.name,label:record.name.split('/').pop(),sources:[...(record.sources||[])],file:record.file||'',flowObject:record.flowObject||'',emailObject:record.emailObject||'',implicit:!!record.implicit};
      nodes.set(id,node);return node;
    }
    for(const frag of fragments){
      for(const c of frag.components){
        const node=register(c);
        for(const source of c.sources||[]){if(!sourceToIds.has(source))sourceToIds.set(source,new Set());sourceToIds.get(source).add(node.id);}
      }
      diagnostics.push(...frag.diagnostics);
    }
    // Parent containers for source-format child metadata (including standard object extensions).
    for(const node of [...nodes.values()]){
      if(['CustomField','RecordType','ValidationRule','FieldSet','ListView','CompactLayout','BusinessProcess','WebLink','SharingReason'].includes(node.type)){
        const parent=node.name.split('.')[0];if(parent)register({type:'CustomObject',name:parent,implicit:true,sources:[]});
      }
    }
    // Custom metadata records can contain MetadataRelationship fields whose
    // values point to EntityDefinition / FieldDefinition. Inspect the field's
    // actual definition; arbitrary text values are never interpreted as names.
    const metadataValueTargets=new Map();
    for(const frag of fragments)for(const field of frag.components){
      if(field.type!=='CustomField'||!field.xml)continue;
      if(value(field.xml,'type')!=='MetadataRelationship')continue;
      const target=value(field.xml,'referenceTo');
      if(target==='EntityDefinition'||target==='FieldDefinition')metadataValueTargets.set(field.name,target);
    }
    // Known lookup relationships let Apex references like
    // Invoice__c.Account__r.External_Id__c resolve through the declared
    // CustomField.referenceTo rather than guessing which object owns a field.
    const lookupTargets=new Map(),childRelationships=new Map();
    for(const frag of fragments){for(const component of frag.components){
      if(component.type!=='CustomField'||!component.xml)continue;
      const dot=component.name.indexOf('.');
      if(dot<0)continue;
      const owner=component.name.slice(0,dot),field=component.name.slice(dot+1);
      const referenceTypes=children(component.xml,'referenceTo').map(x=>x.text.trim()).filter(Boolean);
      if(referenceTypes.length!==1)continue;
      const relation=/__c$/i.test(field)?field.replace(/__c$/i,'__r'):null;
      if(relation)lookupTargets.set(`${owner}.${relation}`.toLowerCase(),{owner,lookupField:component.name,targetObject:referenceTypes[0]});
      const childName=value(component.xml,'relationshipName');
      if(childName){
        // The relationshipName is the *parent-to-child* SOQL relationship,
        // not the child's __r relationship field.
        const target=referenceTypes[0];
        for(const alias of [childName,childName.endsWith('__r')?childName:`${childName}__r`]){
          childRelationships.set(`${target}.${alias}`.toLowerCase(),{owner:target,childObject:owner,lookupField:component.name});
        }
      }
    }}
    const rulesByType=new Map();for(const rule of rules){if(!rulesByType.has(rule.sourceType))rulesByType.set(rule.sourceType,[]);rulesByType.get(rule.sourceType).push(rule);}
    const allCandidates=[];
    for(const frag of fragments){
      for(const c of frag.components){
        if(!c.xml)continue;
        const comp=nodes.get(idOf(c.type,c.name));if(!comp)continue;
        const selectedRules=rulesByType.get(c.type)||[];
        walk(c.xml,(e,parts)=>{
          if(c.type==='Flow')e.root=c.xml;
          for(const rule of selectedRules){
            if(!pathMatches(rule.path,parts)||!conditionOk(e,rule.when))continue;
            const raw=e.text.trim();if(!raw)continue;
            if(rule.transform==='formula'&&!FORMULA_RULE_TYPES.has(c.type))continue;
            const transformed=convertValue(raw,rule,comp,e,nodes);
            for(const target of transformed){
              if(!target)continue;
              allCandidates.push({source:comp.id,targetType:rule.targetType,targetName:target,relation:rule.relation,rule:rule.id,file:c.file,line:c.locate(e.offset),property:parts.join('.'),confidence:rule.transform==='formula'?'inferred':'explicit'});
            }
          }
        });
      }
    }
    for(const frag of fragments)for(const c of frag.components){
      if(c.type!=='CustomMetadata'||!c.xml)continue;
      const typeName=c.name.split('.')[0];
      const owner=typeName.endsWith('__mdt')?typeName:`${typeName}__mdt`;
      for(const entry of children(c.xml,'values')){
        const field=value(entry,'field'),rawValue=value(entry,'value');
        if(!field||!rawValue)continue;
        const declaredType=metadataValueTargets.get(`${owner}.${field}`);
        if(!declaredType)continue;
        const targetType=declaredType==='FieldDefinition'?'CustomField':'CustomObject';
        allCandidates.push({source:idOf(c.type,c.name),targetType,targetName:rawValue,relation:'REFERENCES',
          rule:declaredType==='FieldDefinition'?'CUSTOM_METADATA_FIELD_VALUE':'CUSTOM_METADATA_OBJECT_VALUE',
          file:c.file,line:c.locate(entry.offset),property:'values.value',confidence:'explicit'});
      }
    }
    if(options.includeCodeReferences!==false){
      for(const frag of fragments){for(const text of frag.code||[]){
        const node=nodes.get(text.id);if(node)allCandidates.push(...extractCodeReferences(text,node,nodes,lookupTargets,childRelationships));
      }}
    }
    // Build a directed multigraph where every edge retains its evidence.
    const edges=new Map(),unresolved=[],ambiguous=[];
    const referenceResolver=new ReferenceResolver(nodes);
    const pushEdge=(source,target,relation,candidate)=>{
      if(source===target)return;
      const key=JSON.stringify([source,target,relation]);
      let edge=edges.get(key);
      if(!edge){edge={id:`e${edges.size}`,source,target,relation,evidence:[]};edges.set(key,edge);}
      if(candidate)edge.evidence.push({rule:candidate.rule,file:candidate.file,line:candidate.line,property:candidate.property,confidence:candidate.confidence,raw:candidate.targetName});
    };
    for(const node of nodes.values()){
      if(node.type==='CustomMetadata'){
        const base=node.name.split('.')[0];const owner=base.endsWith('__mdt')?base:`${base}__mdt`;
        const parent=idOf('CustomObject',owner);
        if(nodes.has(parent))pushEdge(parent,node.id,'CONTAINS',{rule:'CUSTOM_METADATA_RECORD_TYPE',file:node.file,line:1,property:'type',confidence:'explicit',targetName:node.name});
      }
      if(['CustomField','RecordType','ValidationRule','FieldSet','ListView','CompactLayout','BusinessProcess','WebLink','SharingReason'].includes(node.type)){
        const parent=idOf('CustomObject',node.name.split('.')[0]);if(nodes.has(parent))pushEdge(parent,node.id,'CONTAINS',{rule:'PARENT_CONTAINER',file:node.file,line:1,property:'parent',confidence:'explicit',targetName:node.name});
      }
    }
    for(const c of allCandidates){
      const source=nodes.get(c.source);if(!source)continue;
      const result=referenceResolver.resolve(c.targetType,c.targetName);
      if(result.status==='resolved')pushEdge(c.source,result.id,c.relation,c);
      else if(result.status==='ambiguous')ambiguous.push({source:c.source,targetType:c.targetType,targetName:c.targetName,
        matches:result.matches,rule:c.rule,file:c.file,line:c.line,
        reason:'Multiple indexed components match; no dependency edge was created'});
      else unresolved.push({source:c.source,targetType:c.targetType,targetName:c.targetName,
        rule:c.rule,file:c.file,line:c.line,reason:'Target not indexed inside configured source folder'});
    }
    const knownRuleTypes=new Set(rules.map(r=>r.sourceType));
    const uncovered=[...new Set([...nodes.values()].filter(n=>!n.implicit&&!knownRuleTypes.has(n.type)&&!['ApexClass','ApexTrigger','AuraDefinitionBundle','LightningComponentBundle','CustomLabel','CustomLabels'].includes(n.type)).map(n=>n.type))].sort();
    const dynamicConstructs=options.includeCodeReferences!==false?fragments.flatMap(f=>discoverDynamicConstructs(f,maskSource)):[];
    const searched=options.includeCodeReferences!==false?findUnverifiedReferences(fragments,nodes,[...edges.values()],maskSource,options.maxUnverifiedCandidates||1500):{candidates:[],truncated:false};
    if(searched.truncated)diagnostics.push({severity:'warning',file:'',message:'Unverified candidate list is capped; not all possible lexical references are displayed'});
    const byFile=new Map(fragments.map(f=>[f.components[0]?.file||f.code[0]?.rel||'',{status:'analyzed',reasons:[]}]).filter(([f])=>f));
    for(const frag of fragments){
      const file=frag.components[0]?.file||frag.code[0]?.rel;if(!file)continue;
      const entry=byFile.get(file);
      if(frag.code.some(c=>/^Apex(Class|Trigger):/.test(c.id))){entry.status='best_effort';entry.reasons.push('Apex static analysis does not evaluate runtime references');}
      if(frag.code.some(c=>/^(LightningComponentBundle|AuraDefinitionBundle|ApexPage|ApexComponent):/.test(c.id))){entry.status='best_effort';entry.reasons.push('Source-code references are analyzed by supported constructs');}
    }
    for(const d of diagnostics){if(!d.file)continue;const entry=byFile.get(d.file)||{status:'analyzed',reasons:[]};
      if(d.severity==='error')entry.status='failed';
      else if(d.message.includes('not yet implemented')||d.message.includes('skipped'))entry.status='partial';
      if(d.severity==='error'||d.severity==='info'||d.severity==='warning')entry.reasons.push(d.message);
      byFile.set(d.file,entry);
    }
    for(const dynamic of dynamicConstructs){const entry=byFile.get(dynamic.file)||{status:'best_effort',reasons:[]};entry.status='partial';entry.reasons.push(`${dynamic.kind} at line ${dynamic.line}`);byFile.set(dynamic.file,entry);}
    for(const u of unresolved){const entry=byFile.get(u.file);if(entry&&entry.status!=='failed'){
      entry.status='partial';if(!entry.reasons.includes('Unresolved metadata reference'))entry.reasons.push('Unresolved metadata reference');}}
    for(const u of ambiguous){const entry=byFile.get(u.file);if(entry&&entry.status!=='failed'){
      entry.status='partial';if(!entry.reasons.includes('Ambiguous metadata reference'))entry.reasons.push('Ambiguous metadata reference');}}
    for(const hint of searched.candidates){const entry=byFile.get(hint.file);if(entry&&entry.status!=='failed'){
      entry.status='partial';if(!entry.reasons.includes('Unverified lexical reference candidate'))entry.reasons.push('Unverified lexical reference candidate');}}

    const fileCoverage=[...byFile].map(([file,info])=>({file,...info})).sort((a,b)=>a.file.localeCompare(b.file));
    const incomplete=Boolean(truncated||diagnostics.some(d=>d.severity==='error')||fileCoverage.some(x=>x.status==='partial'||x.status==='failed')||searched.truncated||ambiguous.length>0||uncovered.length>0);
    const coverage={status:incomplete?'partial':'best_effort',filesAnalyzed:fileCoverage.length,
      filesPartial:fileCoverage.filter(x=>x.status==='partial').length,filesFailed:fileCoverage.filter(x=>x.status==='failed').length,
      dynamicReferences:dynamicConstructs.length,unverifiedCandidates:searched.candidates.length,ambiguousReferences:ambiguous.length,typesWithoutRules:uncovered.length,
      note:'Static results cannot prove the absence of unknown or dynamic dependencies'};
    const adjacency=buildAdjacency([...edges.values()]);
    const graph={nodes:[...nodes.values()].map(n=>({...n,sources:[...n.sources]})),edges:[...edges.values()],unresolved,ambiguous,diagnostics,uncoveredTypes:uncovered,
      unverifiedCandidates:searched.candidates,dynamicConstructs,fileCoverage,coverage,adjacency,
      stats:{files:files.length,filesParsed:changed,filesReused:reused,nodes:nodes.size,edges:edges.size,unresolved:unresolved.length,ambiguous:ambiguous.length,unverified:searched.candidates.length,errors:diagnostics.filter(d=>d.severity==='error').length,elapsedMs:Date.now()-started},
      sourceToIds:Object.fromEntries([...sourceToIds].map(([k,v])=>[k,[...v]])),sourceRoot:root};
    this.previousStats=graph.stats;
    if(cacheDir)try{
      await saveIndex(cacheDir,root,this.fileCache,{signature:filesSignature,graph});
      this.graphSnapshots.set(cacheKey,{signature:filesSignature,graph:structuredClone(graph)});
    }catch(e){graph.diagnostics.push({severity:'warning',file:'',message:`Persistent index could not be written: ${e.message}`});}
    return graph;
  }
}

module.exports={AnalysisService,parseSource,extractFormulaCandidates,extractLabelReferences,neighborhood,buildAdjacency};
