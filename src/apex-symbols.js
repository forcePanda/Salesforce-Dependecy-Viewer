'use strict';
/** Lexically scoped Apex class symbols for instance method invocation.
 * This is intentionally limited to declared repository classes and ordinary
 * method/field declarations. Reflection and inferred values stay unverified.
 */
function buildScopes(code){
  const root={start:0,end:code.length,depth:0,parent:null};
  const scopes=[root],stack=[root];
  for(let i=0;i<code.length;i++){
    if(code[i]==='{'){
      const parent=stack[stack.length-1];const item={start:i,end:code.length,depth:parent.depth+1,parent};
      scopes.push(item);stack.push(item);
    }else if(code[i]==='}'&&stack.length>1)stack.pop().end=i;
  }
  const at=index=>{let scope=root;for(const s of scopes)if(s.start<=index&&index<s.end&&s.depth>scope.depth)scope=s;return scope;};
  return {scopes,at};
}
function scanApexInstanceCalls({code,nodes,emit}){
  const classNames=new Map([...nodes.values()].filter(n=>n.type==='ApexClass').map(n=>[n.name.toLowerCase(),n.name]));
  const {scopes,at}=buildScopes(code);
  const declarations=[];
  const pattern=/\b([A-Za-z_]\w*)\s+([A-Za-z_]\w*)\s*(?=[=;,)\[:])/g;
  let match;
  while((match=pattern.exec(code))){
    const name=classNames.get(match[1].toLowerCase());if(!name)continue;
    // A constructor name or a class declaration isn't a typed variable.
    const before=code.slice(Math.max(0,match.index-24),match.index);
    if(/\b(?:class|interface|enum|new)\s*$/.test(before))continue;
    let scope=at(match.index);
    // Method parameters are declared before their lexical body scope.
    const left=code.lastIndexOf('(',match.index),right=code.indexOf(')',match.index);
    if(left>=0&&right>match.index&&/^[\s\w.,<>\[\]]*$/.test(code.slice(left+1,match.index))){
      const tail=/^\s*\{/.exec(code.slice(right+1,right+32));
      if(tail){const brace=right+1+tail[0].lastIndexOf('{');
        const child=scopes.find(s=>s.start===brace&&s.parent===scope);if(child)scope=child;
      }
    }
    declarations.push({variable:match[2],className:name,at:match.index,scope});
    emit('ApexClass',name,'APEX_CLASS_SYMBOL','REFERENCES',match.index,'Apex declared class type');
  }
  const instance=/\b(?:this\s*\.\s*)?([A-Za-z_]\w*)\s*\.\s*([A-Za-z_]\w*)\s*\(/g;
  while((match=instance.exec(code))){
    const symbol=match[1],point=match.index;
    const declarationsInScope=declarations.filter(d=>d.variable===symbol&&d.at<point&&d.scope.start<=point&&point<d.scope.end);
    declarationsInScope.sort((a,b)=>b.scope.depth-a.scope.depth||b.at-a.at);
    if(declarationsInScope.length)emit('ApexClass',declarationsInScope[0].className,'APEX_INSTANCE_CALL','INVOKES',point,'Apex typed instance invocation');
  }
}
module.exports={buildScopes,scanApexInstanceCalls};
