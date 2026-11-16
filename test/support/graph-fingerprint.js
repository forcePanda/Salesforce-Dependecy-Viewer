'use strict';
const crypto=require('node:crypto');
/** Stable semantic fingerprint excluding timing, cache hits, and temporary paths. */
function canonicalGraph(g){
  const stableSort=(a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b));
  return {
    nodes:g.nodes.map(n=>({id:n.id,type:n.type,name:n.name,sources:[...n.sources].sort(),file:n.file,implicit:n.implicit})).sort((a,b)=>a.id.localeCompare(b.id)),
    edges:g.edges.map(e=>({source:e.source,target:e.target,relation:e.relation,
      evidence:e.evidence.map(v=>({rule:v.rule,file:v.file,line:v.line,property:v.property,confidence:v.confidence,raw:v.raw})).sort(stableSort)})).sort(stableSort),
    unresolved:g.unresolved.map(x=>({source:x.source,targetType:x.targetType,targetName:x.targetName,rule:x.rule,file:x.file,line:x.line})).sort(stableSort),
    ambiguous:g.ambiguous,
    sourceToIds:Object.fromEntries(Object.entries(g.sourceToIds).sort().map(([f,ids])=>[f,[...ids].sort()])),
    coverage:g.coverage,
    uncoveredTypes:g.uncoveredTypes
  };
}
const fingerprint=g=>crypto.createHash('sha256').update(JSON.stringify(canonicalGraph(g))).digest('hex');
module.exports={canonicalGraph,fingerprint};
