'use strict';
/** Build per-direction neighbor indexes once. Both views exclude containment by
 * default so impact queries are not inflated with ownership-only edges. */
function buildAdjacency(edges){
  const create=()=>({out:{},in:{}});
  const all=create(),functional=create();
  for(const edge of edges){
    for(const target of [all,...(edge.relation==='CONTAINS'?[]:[functional])]){
      (target.out[edge.source]??=[]).push(edge.target);
      (target.in[edge.target]??=[]).push(edge.source);
    }
  }
  for(const x of [all,functional])for(const side of ['out','in'])for(const key of Object.keys(x[side]))x[side][key]=[...new Set(x[side][key])];
  return {all,functional};
}
function neighborhood(graph,ids,direction='out',depth=1,includeContainment=false){
  const wanted=new Set(ids),seen=new Set(ids);
  const links=graph.edges.filter(e=>includeContainment||e.relation!=='CONTAINS');
  const indexed=graph.adjacency?.[includeContainment?'all':'functional'];
  let outgoing=indexed?.out,incoming=indexed?.in;
  if(!indexed){const built=buildAdjacency(links).all;outgoing=built.out;incoming=built.in;}
  let frontier=[...ids];
  for(let d=0;d<depth&&frontier.length;d++){
    const next=[];
    for(const node of frontier){
      const neighbors=direction==='out'?[outgoing[node]]:direction==='in'?[incoming[node]]:[outgoing[node],incoming[node]];
      for(const group of neighbors)for(const id of group||[])if(!seen.has(id)){seen.add(id);next.push(id);}
    }
    frontier=next;
  }
  return {nodes:graph.nodes.filter(n=>seen.has(n.id)),edges:links.filter(e=>seen.has(e.source)&&seen.has(e.target)),selected:[...wanted]};
}

module.exports={buildAdjacency,neighborhood};
