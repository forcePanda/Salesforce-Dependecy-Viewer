'use strict';
/* Pure navigation trail used by the webview and regression tests. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.SFDVNavigation=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  function same(a,b){return JSON.stringify(a)===JSON.stringify(b);}
  function createNavigationHistory(initial={kind:'base'}){
    let entries=[{...initial}],index=0;
    return {
      current:()=>({...entries[index]}),
      entries:()=>entries.map(s=>({...s})),
      index:()=>index,
      canBack:()=>index>0,
      canForward:()=>index<entries.length-1,
      reset:scope=>{entries=[{...scope}];index=0;},
      push:scope=>{
        if(same(entries[index],scope))return false;
        entries=entries.slice(0,index+1);entries.push({...scope});
        if(entries.length>80)entries.shift();
        index=entries.length-1;return true;
      },
      back:()=>index>0?{...entries[--index]}:null,
      forward:()=>index<entries.length-1?{...entries[++index]}:null,
      home:()=>{index=0;return {...entries[0]};},
      go:i=>Number.isInteger(i)&&i>=0&&i<entries.length?(index=i,{...entries[index]}):null
    };
  }
  function scopeLabel(scope){
    switch(scope?.kind){
      case 'file':return (scope.file||'File').split('/').pop();
      case 'focus':return (scope.id||'Component').split(':').slice(1).join(':')||'Component';
      case 'types':return scope.types?.length?scope.types.join(' + '):'Blank overview';
      default:return 'Starting view';
    }
  }
  return {createNavigationHistory,scopeLabel};
});
