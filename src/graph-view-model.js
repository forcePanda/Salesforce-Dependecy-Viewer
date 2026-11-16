'use strict';
const {withUnresolvedReferenceNodes}=require('./presentation');
const cached=new WeakMap();
/** Reuse graph presentation and catalog indexes for every scoped navigation. */
function graphViewModel(model){
  let view=cached.get(model);
  if(view)return view;
  const graph=withUnresolvedReferenceNodes(model);
  const catalog=graph.nodes.map(n=>({id:n.id,name:n.name,type:n.type,implicit:n.implicit,unresolved:n.unresolved}));
  const fileCatalog=Object.keys(graph.sourceToIds||{}).sort().map(file=>({file,count:graph.sourceToIds[file].length}));
  const byId=new Set(graph.nodes.map(n=>n.id));
  view={graph,catalog,fileCatalog,byId};
  cached.set(model,view);
  return view;
}
module.exports={graphViewModel};
