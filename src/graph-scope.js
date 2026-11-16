'use strict';
const {neighborhood}=require('./graph-queries');

/** Pure projection of the complete indexed graph into a requested UI scope.
 * No edge is invented and unresolved/provisional nodes retain their identity.
 */
function projectScope(graph,context,scope={kind:'base'},maxNodes=1200){
  const limit=Math.max(1,Number(maxNodes)||1200);
  const kind=scope?.kind||'base';
  if(kind==='base'){
    if(context.kind==='org')return {nodes:[],edges:[],selected:[],mode:'org',limited:false};
    return {...neighborhood(graph,context.focus,context.kind==='out'?'out':'in',1,false),mode:context.kind,limited:false};
  }
  if(kind==='types'&&context.kind==='org'){
    const types=new Set((Array.isArray(scope.types)?scope.types:[]).filter(x=>typeof x==='string'));
    const anchors=graph.nodes.filter(n=>types.has(n.type)&&!n.unresolved);
    if(!anchors.length)return {nodes:[],edges:[],selected:[],mode:'types',limited:false};
    return {...projectAnchors(graph,anchors.map(n=>n.id),limit),mode:'types'};
  }
  if(kind==='file'){
    const file=String(scope.file||'');
    const seeds=Object.prototype.hasOwnProperty.call(graph.sourceToIds||{},file)?graph.sourceToIds[file]:[];
    if(!seeds.length)return {nodes:[],edges:[],selected:[],mode:'file',limited:false};
    return {...projectAnchors(graph,seeds,limit),mode:'file'};
  }
  if(kind==='focus'){
    const id=String(scope.id||'');
    if(!graph.nodes.some(n=>n.id===id))return {nodes:[],edges:[],selected:[],mode:'focus',limited:false};
    const direction=['in','out','both'].includes(scope.direction)?scope.direction:'both';
    const depth=Math.max(1,Math.min(3,Number(scope.depth)||1));
    const view=neighborhood(graph,[id],direction,depth,true);
    return {...limitNodes(view,graph,[id],limit),mode:'focus'};
  }
  return projectScope(graph,context,{kind:'base'},maxNodes);
}
function projectAnchors(graph,anchorIds,limit){
  const view=neighborhood(graph,anchorIds,'both',1,false);
  return limitNodes(view,graph,anchorIds,limit);
}
function limitNodes(view,graph,anchorIds,limit){
  if(view.nodes.length<=limit)return {...view,limited:false};
  // Prefer selected anchors, then their strongest direct neighbors; prevent
  // a dense org from exhausting the canvas on unrelated overview nodes.
  const anchorSet=new Set(anchorIds);
  const hits=new Map(),degree=new Map();
  for(const e of view.edges){
    degree.set(e.source,(degree.get(e.source)||0)+1);
    degree.set(e.target,(degree.get(e.target)||0)+1);
    if(anchorSet.has(e.source))hits.set(e.target,(hits.get(e.target)||0)+1);
    if(anchorSet.has(e.target))hits.set(e.source,(hits.get(e.source)||0)+1);
  }
  const sorted=view.nodes.slice().sort((a,b)=>Number(anchorSet.has(b.id))-Number(anchorSet.has(a.id))
    ||(hits.get(b.id)||0)-(hits.get(a.id)||0)
    ||(degree.get(b.id)||0)-(degree.get(a.id)||0)
    ||a.id.localeCompare(b.id));
  const ids=new Set(sorted.slice(0,limit).map(n=>n.id));
  return {nodes:sorted.filter(n=>ids.has(n.id)),edges:view.edges.filter(e=>ids.has(e.source)&&ids.has(e.target)),selected:view.selected.filter(id=>ids.has(id)),limited:true};
}
module.exports={projectScope,projectAnchors};
