'use strict';
/* Shared, pure graph-presentation logic: testable without launching a VS Code webview. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.SFDVGraphHighlights=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  function highlightedNodeIds(selected,hovered,edges){
    const highlighted=new Set([selected,hovered].filter(Boolean));
    if(!highlighted.size)return highlighted;
    const active=new Set(highlighted);
    for(const edge of edges){
      if(active.has(edge.source)||active.has(edge.target)){
        highlighted.add(edge.source);
        highlighted.add(edge.target);
      }
    }
    return highlighted;
  }
  function shouldDrawLabel(node,highlighted,zoom,visibleCount){
    return highlighted.has(node.id)||(zoom>0.72&&node.degree>1&&visibleCount<360);
  }
  function labelFontSize(zoom,{selected=false,highlighted=false}={}){
    // Text scales with graph zoom instead of overwhelming tiny nodes.
    const base=selected?12:highlighted?11:10;
    return Math.max(5,Math.min(17,Math.round(base*Math.sqrt(Math.max(0.08,zoom))*10)/10));
  }
  return {highlightedNodeIds,shouldDrawLabel,labelFontSize};
});
