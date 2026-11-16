'use strict';
const {idOf}=require('./identity');

/** Resolve only uniquely identified metadata inside the configured source tree.
 * No suffix-only matching: unqualified names must not accidentally resolve to
 * namespaced components with the same suffix.
 */
class ReferenceResolver{
  constructor(nodes){
    this.nodes=nodes;
    this.folded=new Map();
    for(const node of nodes.values()){
      const key=node.id.toLowerCase();
      if(!this.folded.has(key))this.folded.set(key,new Set());
      this.folded.get(key).add(node.id);
    }
  }
  alternatives(type,name){
    const names=[name];
    if(type==='CustomLabel'&&/^c\./i.test(name))names.push(name.slice(2));
    if(type==='LightningMessageChannel'&&/__c$/i.test(name))names.push(name.slice(0,-3));
    if(type==='LightningComponentBundle'&&name.includes(':'))names.push(name.split(':').pop());
    if(type==='CustomObject'&&name.includes('.'))names.push(name.split('.')[0]);
    if(type==='Flow'&&/-\d+$/.test(name))names.push(name.replace(/-\d+$/,''));
    if(type==='CustomMetadata'&&name.includes('.')){
      const [owner,...record]=name.split('.');
      if(!owner.endsWith('__mdt'))names.push(`${owner}__mdt.${record.join('.')}`);
    }
    // API namespaces are sometimes expressed as ns.MyClass in source.
    // Convert only the explicitly namespace-qualified spelling.
    if(type==='ApexClass'&&/^[A-Za-z_]\w*\.[A-Za-z_]\w*$/.test(name)){
      const [ns,local]=name.split('.');names.push(`${ns}__${local}`);
    }
    return [...new Set(names)];
  }
  resolve(type,name){
    const variants=this.alternatives(type,String(name||'').trim());
    for(const variant of variants){const id=idOf(type,variant);if(this.nodes.has(id))return {status:'resolved',id};}
    const matches=new Set();
    for(const variant of variants)for(const id of this.folded.get(idOf(type,variant).toLowerCase())||[])matches.add(id);
    if(matches.size===1)return {status:'resolved',id:[...matches][0]};
    if(matches.size>1)return {status:'ambiguous',matches:[...matches].sort()};
    return {status:'unresolved',matches:[]};
  }
}
module.exports={ReferenceResolver};
