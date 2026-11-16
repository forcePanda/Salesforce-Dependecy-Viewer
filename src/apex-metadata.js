'use strict';
/**
 * Resolve Apex references to *indexed* sObjects and fields.
 *
 * Never interpret an unqualified field globally: common field names such as
 * Status__c occur on many objects. A field must be tied to a known sObject
 * through its SOQL FROM clause, a typed Apex variable, an sObject constructor,
 * or a Schema/field token. This is a conservative static analyzer, not a full
 * Apex compiler; dynamically composed queries require a separate diagnostic.
 *
 * raw: source text; code: same-length source with comments and strings masked;
 * commentsRemoved: same-length source with only comments masked.
 */
function scanApexMetadata({raw,code,commentsRemoved,nodes,lookupTargets=new Map(),childRelationships=new Map(),emit}){
  const objects=new Map(),fields=new Map();
  for(const n of nodes.values()){
    if(n.type==='CustomObject')objects.set(n.name.toLowerCase(),n.name);
    if(n.type==='CustomField'){
      const dot=n.name.indexOf('.');
      if(dot<0)continue;
      const owner=n.name.slice(0,dot),field=n.name.slice(dot+1);
      const key=owner.toLowerCase();
      if(!fields.has(key))fields.set(key,new Map());
      fields.get(key).set(field.toLowerCase(),n.name);
    }
  }
  // A code repository can contain references to a Salesforce object without
  // containing that object's CustomObject file. We may still recognize the
  // owner syntactically, but its fields MUST remain unresolved until indexed.
  // Standard-object fallback is intentionally bounded; no arbitrary Apex class
  // identifier is promoted into a Salesforce sObject.
  const commonStandardObjects=new Set([
    'account','contact','lead','opportunity','case','task','event','user','campaign',
    'campaignmember','contract','order','orderitem','quote','quotelineitem','asset',
    'product2','pricebook2','pricebookentry','opportunitylineitem','contentdocument',
    'contentversion','contentdocumentlink','attachment','note','recordtype',
    'collaborationgroup','knowledge__kav','emailmessage','feeditem','group',
    'businesshours','serviceresource','serviceappointment','workorder',
    'workorderlineitem','custommetadata','organization'
  ]);
  const customObjectPattern=/^[A-Za-z_][A-Za-z0-9_]*__(?:c|e|mdt|x|b|kav)$/i;
  const objectName=name=>{
    const candidate=String(name||'');
    return objects.get(candidate.toLowerCase())||
      (customObjectPattern.test(candidate)||commonStandardObjects.has(candidate.toLowerCase())?candidate:undefined);
  };
  const fieldName=(object,field)=>fields.get(String(object||'').toLowerCase())?.get(String(field||'').toLowerCase());
  function addObject(rawName,index,rule,property){
    const obj=objectName(rawName);
    if(obj)emit('CustomObject',obj,rule,'ACCESSES_OBJECT',index,property);
    return obj;
  }
  function addField(obj,field,index,rule,property,relation='REFERENCES'){
    const canonical=fieldName(obj,field);
    if(canonical){emit('CustomField',canonical,rule,relation,index,property);return;}
    // An explicitly referenced custom field can be missing from the local source tree
    // (unretrieved standard-object extension, package field, or deleted metadata).
    // Previously we silently dropped it here, making real references disappear.
    // Preserve only syntax-backed, object-qualified custom field references as
    // unresolved candidates; never infer a *resolved* field from its spelling.
    if(/^[A-Za-z_][A-Za-z0-9_]*__(?:c|x|e|b|pc|mdt)$/i.test(field))
      emit('CustomField',`${obj}.${field}`,rule,relation,index,property,true);
  }
  function addRelationship(owner,relation,field,index,rule){
    const lookup=lookupTargets.get(`${owner}.${relation}`.toLowerCase());
    if(!lookup){
      // A relationship traversal mentions the local lookup field even if the
      // relationship metadata was never checked in. Show that lookup as an
      // unresolved field; do not guess the target object's identity.
      if(/^[A-Za-z_]\w*__r$/i.test(relation))
        addField(owner,relation.replace(/__r$/i,'__c'),index,'APEX_RELATIONSHIP_LOOKUP',
          'Relationship lookup (target object unknown)');
      return;
    }
    addField(owner,lookup.lookupField.split('.').slice(1).join('.'),index,'APEX_RELATIONSHIP_LOOKUP','Apex relationship field');
    const target=addObject(lookup.targetObject,index,'APEX_RELATIONSHIP_TARGET','Apex relationship target');
    if(target)addField(target,field,index,rule,'Apex relationship target field','READS');
  }

  // Lexical curly brace scopes let identically named local variables in two
  // methods refer to different objects without cross-contaminating edges.
  const scopes=[{id:0,start:0,end:code.length,parent:null,depth:0}],stack=[scopes[0]];
  for(let i=0;i<code.length;i++){
    const c=code[i];
    if(c==='{'){
      const parent=stack[stack.length-1];
      const scope={id:scopes.length,start:i,end:code.length,parent,depth:parent.depth+1};
      scopes.push(scope);stack.push(scope);
    }else if(c==='}'&&stack.length>1){stack.pop().end=i;}
  }
  const scopeAt=index=>{
    let current=scopes[0];
    for(const s of scopes)if(s.start<=index&&index<s.end&&s.depth>current.depth)current=s;
    return current;
  };
  const variables=[];
  function recordVariable(variable,type,index,collection=false){
    const obj=addObject(type,index,'APEX_TYPED_SOBJECT','Apex sObject type');
    if(!obj)return;
    let scope=scopeAt(index);
    // A method's parameter list is outside its body. Bind parameter names to
    // the immediately following method body instead of the whole class.
    const before=code.lastIndexOf('(',index);
    const after=code.indexOf(')',index);
    if(before>=0&&after>=index&&/^[\s\w,.<>\[\]]*$/.test(code.slice(before+1,index))){
      const next=code.slice(after+1,after+55).match(/^\s*\{/);
      if(next){const brace=after+1+next[0].lastIndexOf('{');
        const child=scopes.find(s=>s.start===brace&&s.parent===scope);
        if(child)scope=child;
      }
    }
    variables.push({variable,object:obj,index,scope,collection});
  }
  // Plain typed variables, class fields, for-each loop variables and params.
  let m;
  const typed=/\b([A-Za-z_]\w*)\s+([A-Za-z_]\w*)\s*(?=[=;,)\[:])/g;
  while((m=typed.exec(code)))recordVariable(m[2],m[1],m.index);
  // List<Invoice__c>, Set<Invoice__c>, Map<Id,Invoice__c> declarations.
  const collection=/\b(?:List|Set|Map)\s*<\s*(?:[A-Za-z_]\w*\s*,\s*)?([A-Za-z_]\w*)\s*>\s+([A-Za-z_]\w*)\s*(?=[=;,)\[:])/g;
  while((m=collection.exec(code)))recordVariable(m[2],m[1],m.index,true);
  function variableObject(variable,index,requireCollection=false){
    const matching=variables.filter(v=>v.variable===variable&&v.index<index&&v.scope.start<=index&&index<v.scope.end&&(!requireCollection||v.collection));
    matching.sort((a,b)=>b.scope.depth-a.scope.depth||b.index-a.index);
    const match=matching[0];
    if(!match||(!requireCollection&&match.collection))return null;
    return match.object;
  }

  // Compile-time schema field tokens, including Schema.SObjectType.Obj.fields.Field
  // and Obj.Fields.Field. Also handles Obj.Field for indexed object types.
  const schemaToken=/\b(?:(?:Schema\.)?(?:(?:[sS]ObjectType)\.)?)?([A-Za-z_]\w*)\s*\.\s*(?:[fF]ields\s*\.\s*)?([A-Za-z_]\w*)\b/g;
  while((m=schemaToken.exec(code))){
    // Bare obj.field and schema token both require a unique indexed object.
    const obj=objectName(m[1]);
    if(obj){
      addObject(obj,m.index,'APEX_SCHEMA_OBJECT','Apex Schema/sObject token');
      addField(obj,m[2],m.index,'APEX_SCHEMA_FIELD','Apex field token');
    }
  }
  // Schema.SObjectType.Obj.fields.Field is not handled by the two-piece regex
  // because the prefix is interrupted by a dotted Schema identifier.
  const fullSchema=/\bSchema\s*\.\s*(?:[sS]ObjectType\s*\.\s*)?([A-Za-z_]\w*)\s*\.\s*(?:[fF]ields\s*\.\s*)?([A-Za-z_]\w*)\b/g;
  while((m=fullSchema.exec(code))){
    const obj=addObject(m[1],m.index,'APEX_SCHEMA_OBJECT','Schema object token');
    if(obj)addField(obj,m[2],m.index,'APEX_SCHEMA_FIELD','Schema field token');
  }
  const objectFields=/\b([A-Za-z_]\w*)\s*\.\s*[fF]ields\s*\.\s*([A-Za-z_]\w*)\b/g;
  while((m=objectFields.exec(code))){
    const obj=addObject(m[1],m.index,'APEX_SCHEMA_OBJECT','sObject field-token group');
    if(obj)addField(obj,m[2],m.index,'APEX_SCHEMA_FIELD','sObject fields token');
  }
  const schemaSObject=/\bSchema\s*\.\s*[sS]ObjectType\s*\.\s*([A-Za-z_]\w*)\b/g;
  while((m=schemaSObject.exec(code)))addObject(m[1],m.index,'APEX_SCHEMA_OBJECT','Schema.SObjectType');

  function fieldUseKind(end){
    const remainder=code.slice(end);
    if(/^\s*(?:(?:\+\+|--))/.test(remainder))return 'READ_WRITE';
    if(/^\s*(?:\+=|-=|\*=|\/=|%=|&=|\|=|\^=)/.test(remainder))return 'READ_WRITE';
    if(/^\s*=(?!=|>)/.test(remainder))return 'WRITES';
    return 'READS';
  }
  function typedField(obj,field,index,end,rule,property){
    const kind=fieldUseKind(end);
    if(kind==='READ_WRITE'){
      addField(obj,field,index,rule,property,'READS');
      addField(obj,field,index,rule,property,'WRITES');
    }else addField(obj,field,index,rule,property,kind);
  }
  // Typed sObject instance field access (and a known typed List element).
  const dotAccess=/\b([A-Za-z_]\w*)(\s*\[\s*(?:\d+|[A-Za-z_]\w*)\s*\])?\s*\.\s*([A-Za-z_]\w*)\b/g;
  while((m=dotAccess.exec(code))){
    const variable=m[1],obj=variableObject(variable,m.index,Boolean(m[2]));
    if(obj)typedField(obj,m[3],m.index,m.index+m[0].length,'APEX_SOBJECT_FIELD_ACCESS','Apex typed sObject field');
  }
  // Regex matches are non-overlapping, so `this.item.Status__c` needs an
  // explicit pass rather than assuming that `item.Status__c` will be visited.
  const memberAccess=/\bthis\s*\.\s*([A-Za-z_]\w*)\s*\.\s*([A-Za-z_]\w*)\b/g;
  while((m=memberAccess.exec(code))){
    const obj=variableObject(m[1],m.index);
    if(obj)typedField(obj,m[2],m.index,m.index+m[0].length,'APEX_SOBJECT_FIELD_ACCESS','Apex this.field sObject member');
  }
  // Parent relationship traversal through a documented lookup field.
  const relationshipDot=/\b(?:this\s*\.\s*)?([A-Za-z_]\w*)\s*\.\s*([A-Za-z_]\w*__r)\s*\.\s*([A-Za-z_]\w*)\b/g;
  while((m=relationshipDot.exec(code))){
    const owner=objectName(m[1])||variableObject(m[1],m.index);
    if(owner)addRelationship(owner,m[2],m[3],m.index,'APEX_RELATIONSHIP_FIELD');
  }
  // get('Field__c'), put('Field__c',...), when the receiver's sObject
  // type can be inferred. A string unrelated to a known receiver is ignored.
  const dynamicField=/\b([A-Za-z_]\w*)\s*\.\s*(get|put)\s*\(\s*(['"])([A-Za-z_]\w*)\3/g;
  while((m=dynamicField.exec(commentsRemoved))){
    if(code.slice(m.index,m.index+m[1].length)!==m[1])continue;
    const obj=variableObject(m[1],m.index);
    if(obj)addField(obj,m[4],m.index,'APEX_SOBJECT_GET_PUT','Typed sObject get/put',m[2]==='put'?'WRITES':'READS');
  }
  // new Obj(Field__c = x, Other__c = y): field assignment keys belong to Obj.
  const constructed=/\bnew\s+([A-Za-z_]\w*)\s*\(/g;
  while((m=constructed.exec(code))){
    const obj=addObject(m[1],m.index,'APEX_NEW_SOBJECT','new sObject');
    if(!obj)continue;
    const open=code.indexOf('(',m.index),close=matchingClose(code,open,'(',')');
    if(close<0)continue;
    const body=code.slice(open+1,close);
    const keys=/(?:^|,)\s*([A-Za-z_]\w*)\s*=/g;
    let key;while((key=keys.exec(body))){
      addField(obj,key[1],open+1+key.index,'APEX_SOBJECT_INITIALIZER','SObject constructor field assignment','WRITES');
    }
  }

  // DML operations operate on records, not on every field on the record.
  const dml=/\b(insert|update|upsert|delete|undelete)\s+([A-Za-z_]\w*)\s*(?=;|\[|\)|,)/gi;
  while((m=dml.exec(code))){
    const object=objectName(m[2])||variableObject(m[2],m.index);
    if(object)emit('CustomObject',object,'APEX_DML_OPERATION',{
      insert:'INSERTS_RECORD',update:'UPDATES_RECORD',upsert:'UPSERTS_RECORD',
      delete:'DELETES_RECORD',undelete:'UNDELETES_RECORD'
    }[m[1].toLowerCase()],m.index,`Apex ${m[1].toLowerCase()} DML`);
  }

  // SOQL: discover field owner from the query's FROM clause. Do not associate
  // a bare field with every object containing the same field API name.
  function analyzeQuery(query,offset,rule,parentObject='',depth=0){
    if(depth>12)return;
    const searchable=maskSoqlLiterals(query);
    const from=findTopLevelFrom(searchable);
    if(!from)return;
    let name=from.name;
    // A nested SOQL FROM can be a child relationship name rather than an
    // object API name. Resolve it through relationshipName metadata.
    const relation=parentObject?childRelationships.get(`${parentObject}.${name}`.toLowerCase()):null;
    if(relation){
      name=relation.childObject;
      emit('CustomField',relation.lookupField,'APEX_SOQL_CHILD_LOOKUP','REFERENCES',offset+from.index,'SOQL child relationship field');
    }
    const obj=addObject(name,offset+from.index,'APEX_SOQL_OBJECT','SOQL FROM');
    if(!obj)return;
    // Recursively process relationship SELECTs with the correct child owner.
    // A shallow global SELECT token scan would misattribute these fields.
    const childStart=/\(\s*SELECT\b/gi;let inner;
    while((inner=childStart.exec(searchable))){
      const open=inner.index,close=matchingClose(searchable,open,'(',')');
      if(close<0)continue;
      analyzeQuery(query.slice(open+1,close),offset+open+1,rule,obj,depth+1);
      childStart.lastIndex=close+1;
    }
    // The inner SELECT of a relationship subquery has a different FROM scope;
    // don't silently assign its fields to the outer object.
    const plain=removeNestedSelects(searchable);
    // The FROM target is an object/relationship identifier, never a field.
    // Without this guard a missing-field diagnostic such as
    // Invoice__c.Invoice__c would be fabricated for every SOQL query.
    const fromMatch=/^FROM\s+[A-Za-z_]\w*/i.exec(plain.slice(from.index));
    const fromEnd=from.index+(fromMatch?.[0].length||4);
    const candidates=/\b([A-Za-z_]\w*)(?:\s*\.\s*([A-Za-z_]\w*))?\b/g;
    let word;
    while((word=candidates.exec(plain))){
      const first=word[1],second=word[2];
      if(word.index>=from.index&&word.index<fromEnd)continue;
      if(word.index>0&&plain[word.index-1]===':')continue; // Apex bind variable
      if(second){
        // Explicitly qualified by object name, or by an sObject relation.
        const qualifier=objectName(first);
        if(qualifier)addField(qualifier,second,offset+word.index,rule,'SOQL qualified field','READS');
        else if(/__r$/i.test(first)){
          // Parent relationships point through a lookup field; the referenced
          // object's fields require relationship metadata to be resolved.
          addField(obj,first.replace(/__r$/i,'__c'),offset+word.index,'APEX_SOQL_RELATIONSHIP','SOQL relationship lookup','READS');
          addRelationship(obj,first,second,offset+word.index,'APEX_SOQL_RELATIONSHIP_FIELD');
        }
      }else{
        addField(obj,first,offset+word.index,rule,'SOQL field','READS');
      }
    }
  }
  const bracket=/\[\s*SELECT\b[\s\S]*?\]/gi;
  while((m=bracket.exec(code)))analyzeQuery(raw.slice(m.index+1,m.index+m[0].length-1),m.index+1,'APEX_SOQL_FIELD');

  // Only a complete, literal Database.query(...) / queryWithBinds(...)
  // argument is statically inspectable. Arbitrary SOQL-looking strings do NOT
  // establish a dependency. Concatenated strings are intentionally ignored.
  const dynamic=/\bDatabase\s*\.\s*(?:query|queryWithBinds|countQuery)\s*\(\s*(['"])((?:\\.|(?!\1)[\s\S])*?)\1/g;
  while((m=dynamic.exec(commentsRemoved))){
    if(!/\bDatabase\s*\./.test(code.slice(m.index,m.index+20)))continue;
    const end=m.index+m[0].length;
    if(!/^\s*[,)]/.test(commentsRemoved.slice(end)))continue;
    if(/^\s*SELECT\b/i.test(m[2]))analyzeQuery(m[2],m.index+m[0].indexOf(m[2]),'APEX_LITERAL_SOQL_FIELD');
  }
}
function matchingClose(code,open,left,right){
  if(open<0)return -1;
  let depth=0;
  for(let i=open;i<code.length;i++){
    if(code[i]===left)depth++;
    else if(code[i]===right&&--depth===0)return i;
  }
  return -1;
}
function maskSoqlLiterals(query){
  return query.replace(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"/g,s=>' '.repeat(s.length));
}
function findTopLevelFrom(source){
  let depth=0;
  for(let i=0;i<source.length;i++){
    const c=source[i];
    if(c==='('){depth++;continue;}
    if(c===')'){depth=Math.max(0,depth-1);continue;}
    if(depth||!/^FROM\b/i.test(source.slice(i,i+5)))continue;
    if(i>0&&/[A-Za-z0-9_]/.test(source[i-1]))continue;
    const m=/^FROM\s+([A-Za-z_]\w*)/i.exec(source.slice(i));
    if(m)return {name:m[1],index:i};
  }
  return null;
}
function removeNestedSelects(source){
  const out=source.split('');
  const stack=[];
  for(let i=0;i<source.length;i++){
    if(source[i]==='(')stack.push({start:i,query:/^\s*SELECT\b/i.test(source.slice(i+1))});
    if(source[i]===')'&&stack.length){
      const entry=stack.pop();
      if(entry.query)for(let j=entry.start;j<=i;j++)out[j]=source[j]==='\n'?'\n':' ';
    }
  }
  return out.join('');
}
module.exports={scanApexMetadata};
