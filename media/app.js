(() => {
'use strict';
const vscode=acquireVsCodeApi();
const {highlightedNodeIds,shouldDrawLabel,labelFontSize}=SFDVGraphHighlights;
const {createNavigationHistory,scopeLabel}=SFDVNavigation;
const state={history:createNavigationHistory(),fileCatalog:[],origin:null,selectedTypes:new Set(),showNames:true,data:null,selected:null,hovered:null,nodes:[],edges:[],catalog:[],visibleTypes:new Set(),hiddenTypes:new Set(),renderContainment:false,view:'graph',mode:'overview',camera:{x:0,y:0,k:1},drag:null,layoutTick:0,simulation:true,query:'',positions:new Map(),inspectorTab:'node'};
const palette=['#4285e5','#8562ca','#28a98a','#e4a145','#d96c82','#4f9daf','#9b87db','#ed7f59','#6a9c54','#bd70aa','#728dba','#a8a24c'];
function h(str){return String(str??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));}
const shell=document.getElementById('app');
shell.innerHTML=`<div class="app-shell">
<header class="topbar"><div class="brand"><div class="brand-symbol">S</div><div><div class="brand-name">SFDV<span style="color:#3c7bf0">.</span></div><div class="brand-sub">Dependency explorer</div></div></div><div class="history-controls"><button id="history-back" class="top-icon" title="Back (Alt+Left)" disabled>←</button><button id="history-forward" class="top-icon" title="Forward (Alt+Right)" disabled>→</button><button id="history-home" class="top-icon" title="Return to starting view">⌂</button></div><div class="top-title">Metadata dependency graph</div><span class="path-pill" id="source-path">force-app</span><div class="top-spacer"></div><button class="top-icon" id="diagnostics-button" title="Analysis diagnostics">⚑ <span id="issue-count">0</span></button><button class="top-icon refresh-btn" id="refresh">↻ &nbsp; Reanalyze</button></header>
<aside class="sidebar"><div class="sidebar-scroll">
<section class="side-section"><div class="section-title">Explore metadata <span id="search-total"></span></div><label class="search-box"><span>⌕</span><input id="search" type="search" autocomplete="off" placeholder="Search components…"><span class="shortcut">⌘K</span></label><div id="search-results" class="search-results"></div><div class="file-search-heading">Find a source file</div><label class="search-box"><span>▤</span><input id="file-search" type="search" autocomplete="off" placeholder="Search source files…"></label><div id="file-results" class="search-results"></div></section>
<section class="side-section"><div class="section-title">Graph scope</div><div class="segmented"><button id="scope-all" class="active">Overview</button><button id="scope-focus">Neighbors</button></div><div style="margin-top:9px" class="minor" id="scope-explainer">All component relationships</div></section>
<section class="side-section"><div class="section-title">Component types <button class="small-btn" id="clear-filters">Clear all</button></div><div class="type-list" id="type-filters"></div></section>
<section class="side-section"><div class="section-title">Relationship options</div><label class="filter-item"><input id="show-containment" type="checkbox"><span class="name">Include parent / child</span></label><label class="filter-item"><input id="show-labels" type="checkbox" checked><span class="name">Show node names</span></label></section><section class="side-section"><div class="section-title">Exploration history</div><div id="history-trail" class="history-trail"></div></section>
<section class="side-section"><div class="section-title">Analysis</div><div class="side-stat"><div><b id="stat-components">0</b><small>Components</small></div><div><b id="stat-edges">0</b><small>Relationships</small></div><div><b id="stat-unresolved">0</b><small>Unresolved refs</small></div><div><b id="stat-files">0</b><small>Source files</small></div></div></section>
</div><div class="footer-status"><span class="live-dot"></span><span id="scan-status">Source-only analysis</span></div></aside>
<main class="canvas-panel"><canvas id="graph-canvas" aria-label="Interactive dependency graph"></canvas><div class="stage-tabs"><button class="stage-tab active" id="view-graph">Dependency graph</button><button class="stage-tab" id="view-inbound">Incoming</button><button class="stage-tab" id="view-outbound">Outgoing</button></div><div class="top-stage-info" id="stage-stats">No graph loaded</div><div class="empty-canvas-hint" id="empty-canvas-hint">Select a component type, search for metadata, or choose a source file to explore.</div><div class="warning-banner" style="display:none" id="warning-banner"></div><div class="floating-tools"><button id="zoom-in" title="Zoom in">＋</button><button id="zoom-out" title="Zoom out">−</button><button id="zoom-fit" title="Fit graph">⌖</button></div><div class="bottom-hint">Drag to pan · Scroll to zoom · Grey dotted lines: unresolved references · Double-click to expand</div></main>
<aside class="inspector" id="inspector"><div class="inspector-head"><span id="inspector-heading">INSPECTOR</span><button id="inspector-close" title="Close">✕</button></div><div class="inspector-scroll" id="inspector-scroll"><div class="inspector-empty">Select a node to inspect its dependencies and source evidence.</div></div></aside>
</div>`;
const byId=id=>document.getElementById(id);
const canvas=byId('graph-canvas'),ctx=canvas.getContext('2d',{alpha:false});
let width=0,height=0,dpr=1;let request=0;let nodeMap=new Map();let edgeList=[];let filteredNodes=[];let filteredEdges=[];let typeColor=new Map();let shownLegend=[];
function hash(s){let hsh=2166136261;for(let i=0;i<s.length;i++){hsh^=s.charCodeAt(i);hsh=Math.imul(hsh,16777619);}return hsh>>>0;}
function radius(n){return 5.2+Math.min(7.5,Math.sqrt((n.degree||0))*1.45);}
function assignColors(){const types=[...new Set(state.catalog.map(n=>n.type))].sort();typeColor=new Map(types.map((t,i)=>[t,palette[i%palette.length]]));}
function resize(){const r=canvas.getBoundingClientRect();width=Math.max(1,r.width);height=Math.max(1,r.height);dpr=Math.min(2,window.devicePixelRatio||1);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);scheduleFrame();}
function graphToScreen(x,y){return{x:(x+state.camera.x)*state.camera.k+width/2,y:(y+state.camera.y)*state.camera.k+height/2};}
function screenToGraph(x,y){return{x:(x-width/2)/state.camera.k-state.camera.x,y:(y-height/2)/state.camera.k-state.camera.y};}
function load(data){
  const oldSelected=state.selected;
  const firstLoad=!state.data;
  state.data=data;state.catalog=data.catalog||[];state.fileCatalog=data.fileCatalog||[];state.origin=data.origin||'org';
  if(firstLoad)state.history.reset(data.scope||{kind:'base'});
  if(data.scope?.kind==='types')state.selectedTypes=new Set(data.scope.types||[]);
  if(data.scope?.kind==='base'&&state.origin==='org')state.selectedTypes.clear();
  assignColors();
  const priorPositions=state.positions;
  nodeMap=new Map();
  const allEdges=data.edges||[];
  const degrees=new Map();for(const edge of allEdges){degrees.set(edge.source,(degrees.get(edge.source)||0)+1);degrees.set(edge.target,(degrees.get(edge.target)||0)+1);}
  const nodes=data.nodes||[];
  state.nodes=nodes.map((n,i)=>{
    const prev=priorPositions.get(n.id);
    const seed=hash(n.id),angle=((seed%10000)/10000)*Math.PI*2,r=60+Math.sqrt(i+1)*17;
    const val={...n,x:prev?.x??Math.cos(angle)*r,y:prev?.y??Math.sin(angle)*r,vx:0,vy:0,degree:degrees.get(n.id)||0};
    priorPositions.set(n.id,{x:val.x,y:val.y});nodeMap.set(val.id,val);return val;
  });
  state.edges=allEdges;state.layoutTick=0;state.simulation=true;state.mode=data.mode;
  const explicitlySelected=data.focusIds?.find(id=>nodeMap.has(id));
  state.selected=explicitlySelected || (data.mode==='focus'||data.mode==='file'||data.mode==='out'||data.mode==='in'?(oldSelected&&nodeMap.has(oldSelected)?oldSelected:null):null);
  if(!state.selected&&data.mode!=='org'&&data.mode!=='types'&&nodes.length===1)state.selected=nodes[0].id;
  state.positions=priorPositions;
  byId('source-path').textContent=data.sourceFolder||'force-app';
  const title={org:'Org dependency graph',out:'Metadata referenced in file',in:'Metadata referencing file',focus:'Component neighborhood',types:'Selected metadata types',file:'Source file dependencies'};
  document.querySelector('.top-title').textContent=title[data.mode]||'Metadata dependency graph';
  byId('stat-components').textContent=format(data.stats.nodes);byId('stat-edges').textContent=format(data.stats.edges);byId('stat-unresolved').textContent=format(data.stats.unresolved);byId('stat-files').textContent=format(data.stats.files);
  const problems=(data.diagnostics||[]).filter(d=>d.severity==='error').length;
  byId('issue-count').textContent=problems+((data.unresolved||[]).length?1:0)+((data.coverage?.status==='partial'||data.ambiguous?.length)?1:0);
  byId('scan-status').textContent=`${data.stats.filesParsed} reparsed · ${data.stats.filesReused} cached · ${data.coverage?.status||'unknown'} analysis`;
  const warning=byId('warning-banner');
  if(data.limited){warning.textContent=`View capped at ${format(nodes.length)} components. Narrow by type, search for a file, or explore one component to see more relationships.`;warning.style.display='block';}
  else if(data.stats.errors){warning.textContent=`${data.stats.errors} files failed analysis. See diagnostics for incomplete coverage.`;warning.style.display='block';}
  else warning.style.display='none';
  // Focused neighborhoods bypass org-overview type selection so neighbors stay visible.
  if(data.mode==='focus'&&state.origin!=='org')for(const n of nodes)state.hiddenTypes.delete(n.type);
  updateTypeFilters();updateSearch();updateFileSearch();updateHistory();updateScopeControls();rebuildVisible();drawInspector();fitCamera();setTab('graph');
}
function format(v){return Number(v||0).toLocaleString();}
function updateTypeFilters(){
  const map=new Map();for(const n of state.catalog)map.set(n.type,(map.get(n.type)||0)+1);
  byId('type-filters').innerHTML=[...map.entries()].sort((a,b)=>b[1]-a[1]).map(([t,c])=>`<label class="filter-item" title="${h(t)}"><input type="checkbox" data-filter="${h(t)}" ${(state.origin==='org'?state.selectedTypes.has(t):!state.hiddenTypes.has(t))?'checked':''}><span class="swatch" style="background:${typeColor.get(t)}"></span><span class="name">${h(t)}</span><span class="count">${format(c)}</span></label>`).join('');
}
function updateFileSearch(){
  const q=byId('file-search').value.trim().toLowerCase();
  const matches=q?state.fileCatalog.filter(entry=>entry.file.toLowerCase().includes(q)).slice(0,20):[];
  byId('file-results').innerHTML=q?(matches.map(entry=>`<button class="search-result file-result" data-file="${h(entry.file)}" title="${h(entry.file)}"><span class="name">${h(entry.file)}</span><small>${format(entry.count)}</small></button>`).join('')||'<div class="empty-search">No matching files inside the source folder</div>'):'';
}
function navigate(scope,record=true){
  if(record)state.history.push(scope);
  updateHistory();
  vscode.postMessage({type:'navigate',scope});
}
function updateHistory(){
  byId('history-back').disabled=!state.history.canBack();
  byId('history-forward').disabled=!state.history.canForward();
  const entries=state.history.entries(),current=state.history.index();
  byId('history-trail').innerHTML=entries.map((entry,i)=>`<button class="trail-item ${i===current?'active':''}" data-history-index="${i}" title="${h(scopeLabel(entry))}"><span class="trail-number">${i+1}</span><span class="name">${h(entry.kind==='base'&&state.data?.startingFile?state.data.startingFile.split('/').pop():scopeLabel(entry))}</span></button>`).join('');
}
function updateScopeControls(){
  const kind=state.data?.scope?.kind||'base';
  const focused=kind==='focus'||kind==='file';
  byId('scope-all').classList.toggle('active',!focused);
  byId('scope-focus').classList.toggle('active',focused);
  const message=kind==='types'?'Selected types and their direct neighbors. Other types are shown only as context.'
    :kind==='file'?'Showing the chosen source file and its direct neighbors.'
    :kind==='focus'?'Showing the selected component and its dependency neighborhood.'
    :state.origin==='org'?'Empty overview: select component types or a source file to begin.'
    :'Showing dependencies for the file where you started.';
  byId('scope-explainer').textContent=message;
}
function walkHistory(action){
  const scope=action==='back'?state.history.back():action==='forward'?state.history.forward():state.history.home();
  if(scope)navigate(scope,false);
}
function updateSearch(){
  const q=state.query.toLowerCase().trim();const filtered=q?state.catalog.filter(n=>(n.name+' '+n.type).toLowerCase().includes(q)).slice(0,15):[];
  byId('search-total').textContent=state.catalog.length?`${format(state.catalog.length)}`:'';
  byId('search-results').innerHTML=q?(filtered.map(n=>`<button class="search-result" data-id="${h(n.id)}" title="${h(n.id)}"><span class="swatch" style="background:${typeColor.get(n.type)||'#888'}"></span><span class="name">${h(n.name)}</span><small>${h(n.type)}</small></button>`).join('')||'<div class="empty-search">No matching metadata components</div>'):'';
}
function rebuildVisible(){
  filteredNodes=state.nodes.filter(n=>state.origin==='org'||!state.hiddenTypes.has(n.type));
  const ids=new Set(filteredNodes.map(n=>n.id));
  filteredEdges=state.edges.filter(e=>ids.has(e.source)&&ids.has(e.target)&&(state.renderContainment||e.relation!=='CONTAINS'));
  if(state.view==='incoming'&&state.selected)filteredEdges=filteredEdges.filter(e=>e.target===state.selected||e.source===state.selected&&e.relation==='CONTAINS');
  if(state.view==='outgoing'&&state.selected)filteredEdges=filteredEdges.filter(e=>e.source===state.selected||e.target===state.selected&&e.relation==='CONTAINS');
  byId('empty-canvas-hint').style.display=filteredNodes.length?'none':'block';
  byId('stage-stats').textContent=`${format(filteredNodes.length)} nodes · ${format(filteredEdges.length)} edges`;
  state.layoutTick=0;state.simulation=true;scheduleFrame();
}
function stepPhysics(){
  const list=filteredNodes;if(!list.length)return;
  const alpha=0.2*Math.max(.13,1-state.layoutTick/180);
  const grid=new Map(),size=70;
  const gridKey=(x,y)=>`${x},${y}`;
  for(const n of list){const ix=Math.floor(n.x/size),iy=Math.floor(n.y/size),key=gridKey(ix,iy);if(!grid.has(key))grid.set(key,[]);grid.get(key).push(n);}
  for(const n of list){
    n.vx+=-n.x*.00006;n.vy+=-n.y*.00006;
    const ix=Math.floor(n.x/size),iy=Math.floor(n.y/size);
    for(let a=-2;a<=2;a++)for(let b=-2;b<=2;b++){
      const near=grid.get(gridKey(ix+a,iy+b));if(!near)continue;
      for(const other of near){if(other===n)continue;
        const dx=n.x-other.x,dy=n.y-other.y,dist2=Math.max(15,dx*dx+dy*dy);
        const strength=80/(dist2+20);n.vx+=dx*strength*alpha;n.vy+=dy*strength*alpha;
      }
    }
  }
  for(const e of filteredEdges){
    const a=nodeMap.get(e.source),b=nodeMap.get(e.target);if(!a||!b)continue;
    const dx=b.x-a.x,dy=b.y-a.y,dist=Math.sqrt(dx*dx+dy*dy)||1;
    const desired=e.relation==='CONTAINS'?60:95;const f=(dist-desired)*.008*alpha;
    const fx=dx/dist*f,fy=dy/dist*f;a.vx+=fx;a.vy+=fy;b.vx-=fx;b.vy-=fy;
  }
  for(const n of list){if(state.drag?.node===n.id)continue;n.vx=Math.max(-8,Math.min(8,n.vx*.78));n.vy=Math.max(-8,Math.min(8,n.vy*.78));n.x+=n.vx;n.y+=n.vy;state.positions.set(n.id,{x:n.x,y:n.y});}
  state.layoutTick++;if(state.layoutTick>230)state.simulation=false;
}
function draw(){
  if(!width||!height)return;
  const bg=getComputedStyle(document.body).getPropertyValue('--bg').trim()||'#f8fafc';
  ctx.fillStyle=bg;ctx.fillRect(0,0,width,height);
  // Fine dot grid to provide Emerge-style spatial orientation.
  const gridColor=getComputedStyle(document.body).getPropertyValue('--line').trim()||'#dbe2e9';
  const step=32*state.camera.k;
  if(step>13){ctx.fillStyle=gridColor;const ox=((state.camera.x*state.camera.k+width/2)%step+step)%step,oy=((state.camera.y*state.camera.k+height/2)%step+step)%step;
    for(let x=ox;x<width;x+=step)for(let y=oy;y<height;y+=step){ctx.globalAlpha=.45;ctx.beginPath();ctx.arc(x,y,.85,0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1;
  }
  if(!filteredNodes.length)return;
  const selected=state.selected,hovered=state.hovered;
  const neighbors=highlightedNodeIds(selected,hovered,filteredEdges);
  const k=state.camera.k;
  ctx.lineCap='round';
  for(const e of filteredEdges){
    const a=nodeMap.get(e.source),b=nodeMap.get(e.target);if(!a||!b)continue;
    const from=graphToScreen(a.x,a.y),to=graphToScreen(b.x,b.y);
    if(from.x<-80&&to.x<-80||from.x>width+80&&to.x>width+80||from.y<-80&&to.y<-80||from.y>height+80&&to.y>height+80)continue;
    const emph=e.source===selected||e.target===selected||e.source===hovered||e.target===hovered;
    ctx.strokeStyle=e.unresolved?(document.documentElement.dataset.scheme==='dark'?'#9ca3af':'#89939e'):emph?'#4a8be7':(document.documentElement.dataset.scheme==='dark'?'#526074':'#a9b9ce');
    ctx.globalAlpha=e.unresolved?(emph?.90:Math.max(.55,Math.min(.80,k*.45))):(emph?.82:Math.min(.38,k*.23));
    ctx.lineWidth=e.unresolved?(emph?2.0:1.4):(emph?1.9:1.0);
    ctx.setLineDash(e.unresolved?[1.5,5]:[]);
    ctx.beginPath();ctx.moveTo(from.x,from.y);ctx.lineTo(to.x,to.y);ctx.stroke();
    ctx.setLineDash([]);
    if(emph&&!e.unresolved&&k>.4){
      const dx=to.x-from.x,dy=to.y-from.y,d=Math.hypot(dx,dy)||1;
      const r=radius(b)*k+3,px=to.x-dx/d*r,py=to.y-dy/d*r;
      const head=5;ctx.beginPath();ctx.moveTo(px,py);ctx.lineTo(px-dx/d*head-dy/d*head*.6,py-dy/d*head+dx/d*head*.6);ctx.lineTo(px-dx/d*head+dy/d*head*.6,py-dy/d*head-dx/d*head*.6);ctx.closePath();ctx.fillStyle='#4a8be7';ctx.fill();
    }
  }
  ctx.globalAlpha=1;
  for(const n of filteredNodes){
    const pt=graphToScreen(n.x,n.y),r=radius(n)*Math.max(.4,k);
    if(pt.x<-50||pt.x>width+50||pt.y<-50||pt.y>height+50)continue;
    const on=n.id===selected||n.id===hovered;
    const highlighted=neighbors.has(n.id);
    const faded=(selected||hovered)&&!highlighted;
    ctx.globalAlpha=faded?.30:1;
    if(highlighted){ctx.fillStyle='#3d84e71d';ctx.beginPath();ctx.arc(pt.x,pt.y,r+(on?9:6),0,Math.PI*2);ctx.fill();}
    ctx.fillStyle=n.unresolved?(document.documentElement.dataset.scheme==='dark'?'#9ca3af':'#a2aab5'):(typeColor.get(n.type)||'#6b7d99');ctx.beginPath();ctx.arc(pt.x,pt.y,r,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle=n.unresolved?'#6b7280':highlighted?'#ffffff':(document.documentElement.dataset.scheme==='dark'?'#131924':'#ffffff');ctx.lineWidth=on?2.4:highlighted?1.9:1.1;
    ctx.setLineDash(n.unresolved?[3,2]:[]);ctx.stroke();ctx.setLineDash([]);
    if(n.implicit){ctx.strokeStyle='#64748b';ctx.setLineDash([2,3]);ctx.beginPath();ctx.arc(pt.x,pt.y,r+2,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);}
    ctx.globalAlpha=1;
  }
  // Labels are rendered after all nodes, so an adjacent node cannot paint over a label.
  // The selected/hovered component AND every highlighted neighbor remain named at any zoom.
  const labelCandidates=state.showNames?filteredNodes.filter(n=>shouldDrawLabel(n,neighbors,k,filteredNodes.length)):[];
  labelCandidates.sort((a,b)=>Number(neighbors.has(a.id))-Number(neighbors.has(b.id))||Number(a.id===selected||a.id===hovered)-Number(b.id===selected||b.id===hovered));
  const foreground=getComputedStyle(document.body).getPropertyValue('--foreground').trim()||'#1f2937';
  const surface=getComputedStyle(document.body).getPropertyValue('--surface').trim()||'#fff';
  for(const n of labelCandidates){
    const pt=graphToScreen(n.x,n.y),r=radius(n)*Math.max(.4,k);
    if(pt.x<-50||pt.x>width+50||pt.y<-50||pt.y>height+50)continue;
    const active=neighbors.has(n.id),on=n.id===selected||n.id===hovered;
    const displayName=n.unresolved?n.name+' (unresolved)':n.name;
    const name=active?displayName:(displayName.length>35?displayName.slice(0,32)+'…':displayName);
    const fontSize=labelFontSize(k,{selected:on,highlighted:active});
    ctx.font=`${active?'600 ':''}${fontSize}px ${getComputedStyle(document.body).fontFamily}`;
    ctx.textBaseline='middle';ctx.textAlign='center';
    const boxW=ctx.measureText(name).width+12,boxH=fontSize+9;
    const labelX=Math.max(boxW/2+3,Math.min(width-boxW/2-3,pt.x));
    const labelY=pt.y+r+fontSize/2+4;
    ctx.globalAlpha=active?0.97:0.83;
    ctx.fillStyle=surface;ctx.fillRect(labelX-boxW/2,labelY-boxH/2,boxW,boxH);
    ctx.fillStyle=foreground;ctx.fillText(name,labelX,labelY);
    ctx.globalAlpha=1;
  }
  ctx.textBaseline='alphabetic';
}
function scheduleFrame(){if(request)return;request=requestAnimationFrame(frame);}
function frame(){request=0;if(state.simulation)stepPhysics();draw();if(state.simulation)scheduleFrame();}
function fitCamera(){
  if(!state.nodes.length)return;
  const ns=filteredNodes.length?filteredNodes:state.nodes;
  const xs=ns.map(n=>n.x),ys=ns.map(n=>n.y);const minx=Math.min(...xs),maxx=Math.max(...xs),miny=Math.min(...ys),maxy=Math.max(...ys);
  const extentW=Math.max(180,maxx-minx+130),extentH=Math.max(160,maxy-miny+130);
  state.camera.k=Math.max(.12,Math.min(1.9,Math.min(width*.86/extentW,height*.82/extentH)));
  state.camera.x=-(minx+maxx)/2;state.camera.y=-(miny+maxy)/2;
  scheduleFrame();
}
function zoomAt(factor,x=width/2,y=height/2){const prev=screenToGraph(x,y);state.camera.k=Math.min(4,Math.max(.08,state.camera.k*factor));const after=screenToGraph(x,y);state.camera.x+=after.x-prev.x;state.camera.y+=after.y-prev.y;scheduleFrame();}
function hitTest(x,y){let hit=null,dist=Infinity;for(const n of filteredNodes){const p=graphToScreen(n.x,n.y),d=(p.x-x)**2+(p.y-y)**2;const r=Math.max(10,radius(n)*state.camera.k+6);if(d<r*r&&d<dist){hit=n;dist=d;}}return hit;}
function setSelected(id){
  state.selected=id;
  if(window.innerWidth<=750)byId('inspector').classList.add('visible');
  drawInspector();scheduleFrame();
  // The org overview is intentionally node-capped. A selected component must
  // never look dependency-free simply because one of its neighbors was pruned
  // from the overview. Request its complete 1-hop graph when first selected.
  if(state.data?.limited)jump(id,'both',1);
}
function jump(id,direction='both',depth=1){navigate({kind:'focus',id,direction,depth});}
function setTab(view){state.view=view;for(const x of ['graph','inbound','outbound'])byId('view-'+x).classList.toggle('active',x===view);rebuildVisible();}
function relationshipMarkup(e,node,isOutgoing){
  const other=nodeMap.get(isOutgoing?e.target:e.source)||state.catalog.find(n=>n.id===(isOutgoing?e.target:e.source));
  const name=other?.name||(isOutgoing?e.target:e.source);
  const line=e.evidence?.[0];
  return `<div class="relation"><div class="relation-header"><span class="swatch" style="background:${typeColor.get(other?.type)||'#64748b'};margin-top:4px"></span><div class="relation-body"><div class="relation-name">${h(name)}</div><div class="relation-type">${h(other?.type||'')} · ${e.unresolved?'UNRESOLVED · metadata definition not indexed':h(e.relation.replace(/_/g,' ').toLowerCase())} ${isOutgoing?'→':'←'}</div></div><button class="tiny-icon" title="Explore component" data-navigate="${h(other?.id)}">↗</button></div>${line?`<div class="evidence"><span>${h(line.rule)} · </span><button data-open="${h(line.file)}" data-line="${line.line}">${h(line.file.split('/').pop())}:${line.line}</button><div>${h(line.property)}</div></div>`:''}</div>`;
}
function drawInspector(){
  const scroll=byId('inspector-scroll');
  if(state.inspectorTab==='diagnostics'){drawDiagnostics();return;}
  const id=state.selected;
  if(!id){scroll.innerHTML='<div class="inspector-empty">Click a node, or search for a metadata component, to inspect its dependencies.</div>';return;}
  const n=nodeMap.get(id)||state.catalog.find(x=>x.id===id);
  if(!n){scroll.innerHTML='<div class="inspector-empty">Select a component to inspect.</div>';return;}
  const outgoing=(state.data?.edges||[]).filter(e=>e.source===id&&e.relation!=='CONTAINS');
  const incoming=(state.data?.edges||[]).filter(e=>e.target===id&&e.relation!=='CONTAINS');
  const allUnresolved=(state.data?.unresolved||[]).filter(u=>u.source===id);
  const unresolved=allUnresolved.slice(0,70);
  const possible=(state.data?.unverifiedCandidates||[]).filter(u=>u.source===id).slice(0,12);
  const incomplete=(state.data?.dynamicConstructs||[]).filter(u=>u.source===id).slice(0,12);
  const sources=n.sources||[];
  byId('inspector-heading').textContent='COMPONENT INSPECTOR';
  scroll.innerHTML=`<div class="node-icon" style="background:${typeColor.get(n.type)||'#64748b'}">${h(n.type.slice(0,1))}</div><div class="node-title">${h(n.name)}</div><div class="node-type">${h(n.type)}${n.implicit?' · derived parent node':''}${n.unresolved?' · UNRESOLVED IN SCOPE: the referenced metadata definition was not found in the configured source folder':''}</div>
    <div class="inspector-metrics"><div class="metric"><b>${outgoing.filter(e=>!e.unresolved).length}</b><span>References</span></div><div class="metric"><b>${incoming.length}</b><span>Referenced by</span></div><div class="metric metric-unresolved"><b>${allUnresolved.length}</b><span>Unresolved in scope</span></div></div>
    <div class="inspect-actions"><button data-action="focus" data-id="${h(n.id)}">◉ Explore</button><button data-action="out" data-id="${h(n.id)}">→ References</button><button data-action="in" data-id="${h(n.id)}">← Referenced by</button></div>
    ${sources.length?`<div style="margin-top:15px"><div class="section-title">Source</div>${sources.slice(0,4).map(f=>`<button class="mini-button monospace" style="text-align:left;display:block;word-break:break-all" data-open="${h(f)}" data-line="1">↗ ${h(f)}</button>`).join('')}</div>`:''}
    <hr class="separator"><div class="section-title">References (${outgoing.length}; ${outgoing.filter(e=>e.unresolved).length} unresolved)</div>${outgoing.length?outgoing.slice(0,70).map(e=>relationshipMarkup(e,n,true)).join(''):'<p class="inspector-empty">No outgoing references in this view.</p>'}
    <hr class="separator"><div class="section-title">Referenced by (${incoming.length})</div>${incoming.length?incoming.slice(0,70).map(e=>relationshipMarkup(e,n,false)).join(''):'<p class="inspector-empty">No incoming references in this view.</p>'}
    ${unresolved.length?`<hr class="separator"><div class="section-title">Unresolved in scope (${allUnresolved.length})</div>${unresolved.map(u=>`<div class="diagnostic-item"><b>${h(u.targetType)}: ${h(u.targetName)}</b><div class="diagnostic-file">${h(u.rule)} · ${h(u.file)}:${u.line}</div></div>`).join('')}${allUnresolved.length>unresolved.length?`<p class="tips">Showing ${unresolved.length} of ${allUnresolved.length} unresolved references.</p>`:''}`:''}
    ${possible.length?`<hr class="separator"><div class="section-title">Unverified candidates (${possible.length})</div><p class="tips">These are lexical matches, not proven dependencies.</p>${possible.map(u=>`<div class="diagnostic-item"><b>${h(u.target)}</b><div class="diagnostic-file">${h(u.file)}:${u.line}</div></div>`).join('')}`:''}
    ${incomplete.length?`<hr class="separator"><div class="section-title">Dynamic / incomplete (${incomplete.length})</div>${incomplete.map(u=>`<div class="diagnostic-item"><b>${h(u.kind)}</b><div class="diagnostic-file">${h(u.file)}:${u.line}</div></div>`).join('')}`:''}`;
}
function drawDiagnostics(){
  byId('inspector-heading').textContent='ANALYSIS DIAGNOSTICS';
  const d=state.data||{};
  const diagnostics=d.diagnostics||[],unresolved=d.unresolved||[],uncovered=d.uncoveredTypes||[];
  const candidates=d.unverifiedCandidates||[],dynamic=d.dynamicConstructs||[],ambiguous=d.ambiguous||[];
  const coverage=d.coverage||{};
  byId('inspector-scroll').innerHTML=`<div class="node-title">Analysis health</div><div class="node-type">${h(coverage.status||'best_effort')} static analysis · ${coverage.filesPartial||0} partial files · ${coverage.filesFailed||0} failed files</div><div class="inspector-metrics diagnostics-metrics"><div class="metric"><b>${diagnostics.filter(x=>x.severity==='error').length}</b><span>Parse failures</span></div><div class="metric"><b>${unresolved.length}</b><span>Unresolved refs</span></div></div><p class="tips">Only the configured source folder was analyzed. An unresolved reference may point to a standard component, an excluded file, or missing metadata. No result is proof of complete dependency coverage.</p><hr class="separator"><div class="section-title">Diagnostics (${diagnostics.length})</div>${diagnostics.length?diagnostics.slice(0,75).map(x=>`<div class="diagnostic-item"><span class="badge">${h(x.severity)}</span> ${h(x.message)}<div class="diagnostic-file">${h(x.file)}</div></div>`).join(''):'<p class="inspector-empty">No parse failures or warnings.</p>'}<hr class="separator"><div class="section-title">Unresolved references (${unresolved.length})</div>${unresolved.slice(0,100).map(x=>`<div class="diagnostic-item"><b>${h(x.targetType)}: ${h(x.targetName)}</b><div class="diagnostic-file">${h(x.rule)} · ${h(x.file)}:${x.line}</div></div>`).join('')||'<p class="inspector-empty">None reported.</p>'}<hr class="separator"><div class="section-title">Unverified reference candidates (${candidates.length})</div><p class="tips">Search matches are suggestions, not dependency edges.</p>${candidates.slice(0,60).map(x=>`<div class="diagnostic-item"><b>${h(x.source)} → ${h(x.target)}</b><div class="diagnostic-file">${h(x.file)}:${x.line}</div></div>`).join('')||'<p class="inspector-empty">None</p>'}<hr class="separator"><div class="section-title">Dynamic constructs (${dynamic.length})</div>${dynamic.slice(0,40).map(x=>`<div class="diagnostic-item"><b>${h(x.kind)}</b><div class="diagnostic-file">${h(x.file)}:${x.line}</div></div>`).join('')||'<p class="inspector-empty">None</p>'}<hr class="separator"><div class="section-title">Ambiguous references (${ambiguous.length})</div>${ambiguous.slice(0,40).map(x=>`<div class="diagnostic-item"><b>${h(x.targetName)}</b><div class="diagnostic-file">${h(x.matches?.join(', ')||'')}</div></div>`).join('')||'<p class="inspector-empty">None</p>'}<hr class="separator"><div class="section-title">Types without declarative rules (${uncovered.length})</div><p class="tips">These types can still appear as referenced nodes; missing rule coverage is not evidence of having no dependencies.</p><div class="tips">${uncovered.map(h).join(' · ')||'None'}</div>`;
}
canvas.addEventListener('pointerdown',e=>{const p=canvas.getBoundingClientRect(),x=e.clientX-p.left,y=e.clientY-p.top,node=hitTest(x,y);state.drag={startX:x,startY:y,x,y,node:node?.id||null,moved:false};canvas.setPointerCapture(e.pointerId);canvas.classList.add('dragging');});
canvas.addEventListener('pointermove',e=>{
  const r=canvas.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;
  if(state.drag){const d=state.drag;if(Math.hypot(x-d.startX,y-d.startY)>4)d.moved=true;
    const dx=x-d.x,dy=y-d.y;if(d.node){const node=nodeMap.get(d.node);if(node){node.x+=dx/state.camera.k;node.y+=dy/state.camera.k;node.vx=0;node.vy=0;}}
    else{state.camera.x+=dx/state.camera.k;state.camera.y+=dy/state.camera.k;}d.x=x;d.y=y;state.simulation=!!d.node;state.layoutTick=Math.min(state.layoutTick,160);scheduleFrame();
  }else{const hit=hitTest(x,y);if(hit?.id!==state.hovered){state.hovered=hit?.id||null;scheduleFrame();}canvas.style.cursor=hit?'pointer':'grab';}
});
canvas.addEventListener('pointerup',e=>{const d=state.drag;if(!d)return;canvas.classList.remove('dragging');if(!d.moved&&d.node){state.inspectorTab='node';setSelected(d.node);}state.drag=null;scheduleFrame();});
canvas.addEventListener('dblclick',e=>{const r=canvas.getBoundingClientRect(),n=hitTest(e.clientX-r.left,e.clientY-r.top);if(n)jump(n.id,'both',1);});
canvas.addEventListener('wheel',e=>{e.preventDefault();const r=canvas.getBoundingClientRect();zoomAt(e.deltaY<0?1.12:.89,e.clientX-r.left,e.clientY-r.top);},{passive:false});
byId('search').addEventListener('input',e=>{state.query=e.target.value;updateSearch();});
byId('file-search').addEventListener('input',updateFileSearch);
byId('file-results').addEventListener('click',e=>{const btn=e.target.closest('button[data-file]');if(!btn)return;navigate({kind:'file',file:btn.dataset.file});byId('file-search').value='';updateFileSearch();});
byId('search-results').addEventListener('click',e=>{const btn=e.target.closest('button[data-id]');if(!btn)return;state.selected=btn.dataset.id;jump(btn.dataset.id,'both',1);state.query='';byId('search').value='';updateSearch();});
byId('type-filters').addEventListener('change',e=>{const el=e.target;if(!el.dataset.filter)return;if(state.origin==='org'){if(el.checked)state.selectedTypes.add(el.dataset.filter);else state.selectedTypes.delete(el.dataset.filter);const types=[...state.selectedTypes].sort();navigate(types.length?{kind:'types',types}:{kind:'base'});}else{if(el.checked)state.hiddenTypes.delete(el.dataset.filter);else state.hiddenTypes.add(el.dataset.filter);rebuildVisible();drawInspector();}});
byId('clear-filters').addEventListener('click',()=>{if(state.origin==='org'){state.selectedTypes.clear();navigate({kind:'base'});}else{state.hiddenTypes.clear();updateTypeFilters();rebuildVisible();}});
byId('show-containment').addEventListener('change',e=>{state.renderContainment=e.target.checked;rebuildVisible();});
byId('show-labels').addEventListener('change',e=>{state.showNames=e.target.checked;scheduleFrame();});
byId('history-back').addEventListener('click',()=>walkHistory('back'));
byId('history-forward').addEventListener('click',()=>walkHistory('forward'));
byId('history-home').addEventListener('click',()=>walkHistory('home'));
byId('history-trail').addEventListener('click',e=>{const item=e.target.closest('button[data-history-index]');if(!item)return;const scope=state.history.go(Number(item.dataset.historyIndex));if(scope)navigate(scope,false);});
byId('inspector-scroll').addEventListener('click',e=>{
  const a=e.target.closest('button');if(!a)return;
  if(a.dataset.open){vscode.postMessage({type:'openSource',file:a.dataset.open,line:Number(a.dataset.line)||1});return;}
  if(a.dataset.navigate){jump(a.dataset.navigate,'both',1);return;}
  if(a.dataset.action){const id=a.dataset.id;if(a.dataset.action==='focus')jump(id,'both',1);else jump(id,a.dataset.action,1);}
});
byId('diagnostics-button').addEventListener('click',()=>{state.inspectorTab='diagnostics';drawInspector();byId('inspector').classList.add('visible');});
byId('inspector-close').addEventListener('click',()=>{state.inspectorTab='node';if(window.innerWidth<=750)byId('inspector').classList.remove('visible');drawInspector();});
byId('refresh').addEventListener('click',()=>vscode.postMessage({type:'refresh'}));
byId('zoom-in').addEventListener('click',()=>zoomAt(1.25));byId('zoom-out').addEventListener('click',()=>zoomAt(.8));byId('zoom-fit').addEventListener('click',fitCamera);
byId('view-graph').addEventListener('click',()=>setTab('graph'));byId('view-inbound').addEventListener('click',()=>setTab('incoming'));byId('view-outbound').addEventListener('click',()=>setTab('outgoing'));
byId('scope-all').addEventListener('click',()=>{byId('scope-all').classList.add('active');byId('scope-focus').classList.remove('active');if(state.origin==='org'){const types=[...state.selectedTypes].sort();navigate(types.length?{kind:'types',types}:{kind:'base'});}else navigate({kind:'base'});});
byId('scope-focus').addEventListener('click',()=>{if(state.selected)jump(state.selected,'both',1);byId('scope-focus').classList.add('active');byId('scope-all').classList.remove('active');});
window.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();byId('search').focus();}if(e.altKey&&e.key==='ArrowLeft'){e.preventDefault();walkHistory('back');}if(e.altKey&&e.key==='ArrowRight'){e.preventDefault();walkHistory('forward');}if(e.key==='Escape'){byId('search').blur();byId('file-search').blur();}});
window.addEventListener('resize',resize);
const obs=new ResizeObserver(resize);obs.observe(canvas);resize();
window.addEventListener('message',event=>{if(event.data?.type==='graph'){state.inspectorTab='node';load(event.data.data);}});
vscode.postMessage({type:'ready'});
})();
