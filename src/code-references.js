'use strict';
const {idOf}=require('./identity');
const {scanApexMetadata}=require('./apex-metadata');
const {scanApexInstanceCalls}=require('./apex-symbols');
const {maskSource}=require('./source-parsing');
const kebabToCamel=v=>v.replace(/-([a-z0-9])/g,(_,c)=>c.toUpperCase());
/** Identify class references in Apex type positions.
 * This is deliberately bounded to classes indexed in the repository. Raw word matches
 * would incorrectly turn string literals, comments and unrelated identifiers into edges.
 * Tokens preserve offsets so source evidence is navigable from the graph.
 */
function apexTypeUsages(source,nodes){
  const tokens=[];
  const pattern=/[A-Za-z_][A-Za-z0-9_]*|[^\s]/g;
  let match;while((match=pattern.exec(source)))tokens.push({value:match[0],index:match.index});
  const known=new Set([...nodes.values()].filter(n=>n.type==='ApexClass').map(n=>n.name));
  const result=[];
  const v=i=>tokens[i]?.value||'';
  const identifier=x=>/^[A-Za-z_][A-Za-z0-9_]*$/.test(x);
  const control=new Set(['class','interface','enum','extends','implements','return','if','else','while','for','new','throw','throws','catch','public','private','protected','static','final','virtual','override','abstract','global','with','without','sharing']);
  for(let i=0;i<tokens.length;i++){
    const name=v(i);
    if(!known.has(name))continue;
    const prev=v(i-1),next=v(i+1),after=v(i+2);
    let context='';
    if(prev==='new'||prev==='extends'||prev==='instanceof'||prev==='implements'||prev==='throws'){
      // These contexts are already captured by the existing type-reference rule.
      continue;
    }
    if(next==='.'&&identifier(after)){
      // Static invocation is captured with INVOKES. Handle static constants and nested types.
      if(v(i+3)!=='(')context='qualified class member';
    }else if(identifier(next)&&!control.has(next)){
      // ClassType variable, method(ClassType param), or ClassType returnType(...).
      // Require plausible declaration punctuation after the declared symbol.
      if([';',',',')','(', '=','[','{',':'].includes(after))context='Apex class declaration type';
    }else if(next==='['&&after===']')context='Apex array type';
    else if((prev==='<'||prev===',')&&['>',',','['].includes(next))context='Apex generic type';
    else if(prev==='('&&next===')'&&identifier(v(i+2))&&['return','=','(', ','].includes(v(i-2)))context='Apex cast type';
    // Implements lists can include multiple types, not only the first after "implements".
    else if(prev===','&&(next==='{'||next===',')){
      const before=source.slice(Math.max(0,tokens[i].index-250),tokens[i].index);
      if(/\bimplements\s+[A-Za-z_]\w*(?:\s*,\s*[A-Za-z_]\w*)*\s*,\s*$/.test(before))context='Apex implemented interface';
    }
    if(context)result.push({name,index:tokens[i].index,context});
  }
  return result;
}
function codeCandidatesFor(type,name,rule,relation,matchIndex,ref,node,text){return {source:node.id,targetType:type,targetName:name,rule,relation,file:text.rel,line:text.locate(matchIndex),property:ref,confidence:'inferred'};}
function extractCodeReferences(text,node,nodes,lookupTargets,childRelationships){
  const result=[];
  const raw=text.text,cleaned=maskSource(raw,false);
  const push=(type,name,rule,relation,index,ref,explicit=false)=>{if(!name||(!explicit&&!nodes.has(idOf(type,name)))||node.id===idOf(type,name))return;result.push(codeCandidatesFor(type,name,rule,relation,index,ref,node,text));};
  if(node.type==='ApexClass'||node.type==='ApexTrigger'){
    // Record-triggered object is an explicit syntactic reference.
    if(node.type==='ApexTrigger'){
      const m=/\btrigger\s+[A-Za-z_]\w*\s+on\s+([\w]+)\s*\(/i.exec(cleaned);
      if(m)push('CustomObject',m[1],'APEX_TRIGGER_OBJECT','TRIGGERS_ON',m.index,'trigger on',true);
    }
    // Only known component names count. Unknown identifiers and string literals are not dependencies.
    const withoutStrings=maskSource(raw,true);
    for(const usage of apexTypeUsages(withoutStrings,nodes)){
      push('ApexClass',usage.name,'APEX_CLASS_TYPE_USAGE','REFERENCES',usage.index,usage.context);
    }
    const typeRefs=/\b(?:new\s+|extends\s+|implements\s+|instanceof\s+)([A-Za-z_]\w*)/g;
    let found;while((found=typeRefs.exec(withoutStrings))){
      push('ApexClass',found[1],'APEX_CLASS_TYPE','REFERENCES',found.index,'Apex type reference');
    }
    const staticCalls=/\b([A-Za-z_]\w*)\s*\.\s*[A-Za-z_]\w*\s*\(/g;
    while((found=staticCalls.exec(withoutStrings))){
      push('ApexClass',found[1],'APEX_STATIC_CALL','INVOKES',found.index,'Apex static call');
    }
    // Labels, Visualforce pages, and permission checks: these are actual
    // syntax-specific references, not free-text searches for known names.
    const customLabel=/\b(?:System\s*\.\s*)?Label\s*\.\s*(?:c\s*\.\s*)?([A-Za-z_]\w*)/g;
    while((found=customLabel.exec(withoutStrings))){
      // Avoid interpreting a method declaration or class member named Label as a label.
      if(/\b(?:class|interface)\s+$/.test(withoutStrings.slice(Math.max(0,found.index-15),found.index)))continue;
      push('CustomLabel',found[1],'APEX_CUSTOM_LABEL','REFERENCES',found.index,'System.Label');
    }
    const apexPage=/\bPage\s*\.\s*([A-Za-z_]\w*)/g;
    while((found=apexPage.exec(withoutStrings)))push('ApexPage',found[1],'APEX_VISUALFORCE_PAGE','REFERENCES',found.index,'Page token');
    const permCheck=/\bFeatureManagement\s*\.\s*checkPermission\s*\(\s*(['"])([A-Za-z_]\w*)\1\s*\)/g;
    while((found=permCheck.exec(cleaned))){
      if(!/^FeatureManagement/.test(withoutStrings.slice(found.index,found.index+17)))continue;
      push('CustomPermission',found[2],'APEX_PERMISSION_CHECK','CHECKS_PERMISSION',found.index,'FeatureManagement.checkPermission',true);
    }
    const literalClass=/\bType\s*\.\s*forName\s*\(\s*(['"])([A-Za-z_]\w*)\1\s*\)/g;
    while((found=literalClass.exec(cleaned))){
      if(!/^Type/.test(withoutStrings.slice(found.index,found.index+4)))continue;
      push('ApexClass',found[2],'APEX_LITERAL_CLASS_REF','REFERENCES',found.index,'Type.forName',true);
    }
    // Known object API names; require a syntactic object context for standard objects.
    const objRe=/\b(?:from|update|insert|upsert|delete|on|Schema\.SObjectType\.)\s*([A-Za-z_]\w*(?:__(?:c|mdt|e|x))?)\b/gi;
    let m;while((m=objRe.exec(withoutStrings)))push('CustomObject',m[1],'APEX_OBJECT_REFERENCE','ACCESSES_OBJECT',m.index,'Apex statement');
    const objToken=/\b([A-Za-z_]\w*__(?:c|mdt|e|x))\b/g;
    while((m=objToken.exec(withoutStrings)))push('CustomObject',m[1],'APEX_CUSTOM_OBJECT_TOKEN','ACCESSES_OBJECT',m.index,'Apex type token');
    // Resolve sObject fields by their real owner, not by the literal name of
    // the receiver (which is often an Apex variable such as `invoice`).
    // SOQL SELECT, Schema tokens, typed variables and constructor fields all
    // need a different ownership context.
    scanApexMetadata({raw,code:withoutStrings,commentsRemoved:cleaned,nodes,lookupTargets,childRelationships,emit:push});
    scanApexInstanceCalls({code:withoutStrings,nodes,emit:push});
    return deduplicateCandidates(result);
  }
  if(node.type==='LightningComponentBundle'||node.type==='AuraDefinitionBundle'||node.type==='ApexPage'||node.type==='ApexComponent'){
    let m;
    const lexicalCode=maskSource(raw,true);
    const importRe=/(?:\bfrom\s*['"]|\bimport\s*['"]|\bimport\s*\(\s*['"])@salesforce\/(apex|schema|label|resourceUrl|messageChannel|customPermission)\/([\w.$-]+)/g;
    while((m=importRe.exec(cleaned))){
      // An import-looking phrase inside a JavaScript string is not an import.
      const keyword=m[0].startsWith('from')?'from':'import';
      if(lexicalCode.slice(m.index,m.index+keyword.length)!==keyword)continue;
      const [kind,arg]=[m[1],m[2]];
      if(kind==='apex'){
        const segments=arg.split('.');
        const className=segments.length>=3?`${segments[0]}__${segments[1]}`:segments[0];
        push('ApexClass',className,'LWC_APEX_IMPORT','INVOKES',m.index,'@salesforce/apex',true);
      }
      if(kind==='schema'){
        const parts=arg.split('.');
        if(parts.length>1){
          push('CustomObject',parts[0],'LWC_SCHEMA_OBJECT','REFERENCES',m.index,'@salesforce/schema');
          if(parts.length===2)push('CustomField',parts.join('.'),'LWC_SCHEMA_FIELD','REFERENCES',m.index,'@salesforce/schema',true);
          else {
            // Relationship fields must be resolved against a declared lookup.
            // Do not guess a target field based on its unqualified name.
            let owner=parts[0];
            for(const rel of parts.slice(1,-1)){
              const lookup=lookupTargets.get(`${owner}.${rel}`.toLowerCase());
              if(!lookup){owner='';break;}
              push('CustomField',lookup.lookupField,'LWC_SCHEMA_LOOKUP','REFERENCES',m.index,'@salesforce/schema relationship');
              owner=lookup.targetObject;
              push('CustomObject',owner,'LWC_SCHEMA_PARENT','REFERENCES',m.index,'@salesforce/schema relationship');
            }
            if(owner)push('CustomField',`${owner}.${parts[parts.length-1]}`,'LWC_SCHEMA_RELATED_FIELD','REFERENCES',m.index,'@salesforce/schema relationship',true);
          }
        } else push('CustomObject',arg,'LWC_SCHEMA_OBJECT','REFERENCES',m.index,'@salesforce/schema',true);
      }
      if(kind==='customPermission')push('CustomPermission',arg,'LWC_CUSTOM_PERMISSION','CHECKS_PERMISSION',m.index,'@salesforce/customPermission',true);
      if(kind==='label')push('CustomLabel',arg.replace(/^c\./,''),'LWC_LABEL_IMPORT','REFERENCES',m.index,'@salesforce/label',true);
      if(kind==='resourceUrl')push('StaticResource',arg,'LWC_RESOURCE_IMPORT','REFERENCES',m.index,'@salesforce/resourceUrl',true);
      if(kind==='messageChannel')push('LightningMessageChannel',arg.replace(/__c$/,''),'LWC_MESSAGE_CHANNEL','REFERENCES',m.index,'@salesforce/messageChannel',true);
    }
    const childModule=/(?:from\s*['"]|import\s*\(['"])(?:c\/)([\w]+)(?:['"])/g;
    while((m=childModule.exec(cleaned)))push('LightningComponentBundle',m[1],'LWC_COMPONENT_IMPORT','IMPORTS',m.index,'c/',true);
    const tagRe=/<c-([a-z][\w-]*)\b/g;
    while((m=tagRe.exec(cleaned)))push('LightningComponentBundle',kebabToCamel(m[1]),'LWC_CHILD_TAG','EMBEDS',m.index,'HTML tag',true);
    const auraRe=/<c:([A-Za-z]\w*)\b/g;
    while((m=auraRe.exec(cleaned)))push('AuraDefinitionBundle',m[1],'AURA_COMPONENT_TAG','EMBEDS',m.index,'Aura tag',true);
    // Visualforce extension lists contain comma-separated Apex class names.
    // standardController denotes an object, not an Apex class.
    const extensions=/\bextensions\s*=\s*(['"])([A-Za-z_]\w*(?:\s*,\s*[A-Za-z_]\w*)*)\1/g;
    while((m=extensions.exec(cleaned))){
      for(const name of m[2].split(',').map(x=>x.trim())){
        push('ApexClass',name,'VISUALFORCE_EXTENSIONS','REFERENCES',m.index,'extensions attribute',true);
      }
    }
    const apexController=/\bcontroller\s*=\s*['"]([A-Za-z_]\w*)['"]/g;
    while((m=apexController.exec(cleaned)))push('ApexClass',m[1],'VISUALFORCE_CONTROLLER','REFERENCES',m.index,'controller attribute',true);
    const standardController=/\bstandardController\s*=\s*['"]([A-Za-z_]\w*)['"]/g;
    while((m=standardController.exec(cleaned)))push('CustomObject',m[1],'VISUALFORCE_STANDARD_CONTROLLER','REFERENCES',m.index,'standardController attribute',true);
    const markupLabels=/\$Label\.(?:(?:c|[A-Za-z_]\w*)\.)?([A-Za-z_]\w*)/g;
    while((m=markupLabels.exec(cleaned)))push('CustomLabel',m[1],'MARKUP_CUSTOM_LABEL','REFERENCES',m.index,'$Label');
    // Only fully qualified {Object.Field} expressions are unambiguous.
    const vfFields=/\{!\s*([A-Za-z_]\w*)\.([A-Za-z_]\w*)(?:\s*[}\s]|\s*[+\-*/])?/g;
    while((m=vfFields.exec(cleaned))){
      if(nodes.has(idOf('CustomObject',m[1])))push('CustomField',`${m[1]}.${m[2]}`,'VISUALFORCE_FIELD_EXPRESSION','REFERENCES',m.index,'Visualforce expression',true);
    }
  }
  if(node.type==='EmailTemplate'){
    // Classic template bodies are stored in .email files, not -meta.xml.
    // Merge expressions are only resolved if the owner is explicit or
    // 'relatedTo' has a corresponding relatedEntityType in the XML metadata.
    let m;
    const merge=/\{!\s*([A-Za-z_]\w*)\.([A-Za-z_]\w*)\s*\}/g;
    while((m=merge.exec(cleaned))){
      const obj=m[1]==='relatedTo'?node.emailObject:m[1];
      if(obj&&nodes.has(idOf('CustomObject',obj)))push('CustomField',`${obj}.${m[2]}`,'EMAIL_TEMPLATE_FIELD','REFERENCES',m.index,'Email merge field',true);
    }
    const label=/\$Label\.(?:(?:c|[A-Za-z_]\w*)\.)?([A-Za-z_]\w*)/g;
    while((m=label.exec(cleaned)))push('CustomLabel',m[1],'EMAIL_TEMPLATE_LABEL','REFERENCES',m.index,'Email label');
  }
  return deduplicateCandidates(result);
}
function deduplicateCandidates(candidates){const seen=new Set();return candidates.filter(c=>{const k=[c.source,c.targetType,c.targetName,c.relation,c.rule,c.file,c.line].join('|');if(seen.has(k))return false;seen.add(k);return true;});}

module.exports={extractCodeReferences};
