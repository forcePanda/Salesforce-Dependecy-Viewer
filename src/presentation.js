'use strict';
const {buildAdjacency}=require('./graph-queries');
const projectionCache=new WeakMap();

/**
 * Project explicit but unresolved references as *presentation-only* nodes and
 * edges. This is not a semantic dependency: the destination is not verified to
 * exist within the configured source folder. The original analyzer graph is
 * deliberately untouched, and lexical/unverified/ambiguous candidates are not
 * promoted into dependency edges.
 */
function withUnresolvedReferenceNodes(graph){
  const prior=projectionCache.get(graph);
  if(prior)return prior;
  const nodes=[...graph.nodes],edges=[...graph.edges];
  const known=new Set(nodes.map(n=>n.id));
  const edgesByPair=new Map();
  const seenEvidenceByPair=new Map();
  for(const ref of graph.unresolved||[]){
    if(typeof ref.source!=='string'||!known.has(ref.source))continue;
    if(typeof ref.targetType!=='string'||!/^[A-Za-z][A-Za-z0-9_]*$/.test(ref.targetType))continue;
    if(typeof ref.targetName!=='string')continue;
    if(/[\u0000-\u001f\u007f]/.test(ref.targetName))continue;
    const name=ref.targetName.trim();
    if(!name||name.length>512)continue;
    // Preserve the v0.4.1 field node ID so existing focused views and links work.
    // Other types use the same deterministic identity scheme.
    if(ref.targetType==='CustomField'&&!/^[A-Za-z_][A-Za-z0-9_]*\.[A-Za-z_][A-Za-z0-9_]*$/.test(name))continue;
    const id=`Unresolved${ref.targetType}:${name}`;
    if(!known.has(id)){
      nodes.push({id,type:ref.targetType,name,label:name,
        unresolved:true,implicit:false,file:'',sources:[]});
      known.add(id);
    }
    const key=JSON.stringify([ref.source,id]);
    if(!edgesByPair.has(key))edgesByPair.set(key,{
      id:`unresolved:${key}`,source:ref.source,target:id,
      relation:'UNRESOLVED_REFERENCE',unresolved:true,evidence:[]
    });
    const edge=edgesByPair.get(key);
    if(!seenEvidenceByPair.has(key))seenEvidenceByPair.set(key,new Set());
    const evidence={rule:ref.rule,file:ref.file,line:ref.line,
      property:'unresolved metadata reference',confidence:'unresolved',raw:name};
    const evidenceKey=JSON.stringify([evidence.rule,evidence.file,evidence.line]);
    if(!seenEvidenceByPair.get(key).has(evidenceKey)){
      seenEvidenceByPair.get(key).add(evidenceKey);
      edge.evidence.push(evidence);
    }
  }
  edges.push(...edgesByPair.values());
  const projected={...graph,nodes,edges,adjacency:buildAdjacency(edges)};
  projectionCache.set(graph,projected);
  return projected;
}

// Backward-compatible export used by v0.4.1 regression tests.
const withUnresolvedFieldNodes=withUnresolvedReferenceNodes;
module.exports={withUnresolvedReferenceNodes,withUnresolvedFieldNodes};
