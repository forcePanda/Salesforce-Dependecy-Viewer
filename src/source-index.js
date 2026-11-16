'use strict';
const fs=require('node:fs/promises');
const crypto=require('node:crypto');
const path=require('node:path');
const {identifyFile,IGNORED_DIRS}=require('./identity');
const {SUPPORTED_CODE,parseSource}=require('./source-parsing');

/** Enumerate only recognized, in-scope files. Symlinks are never followed. */
async function collectSourceFiles(root,limit,diagnostics){
  const files=[];
  let truncated=false;
  const explore=async dir=>{
    const entries=await fs.readdir(dir,{withFileTypes:true});
    entries.sort((a,b)=>a.name.localeCompare(b.name));
    for(const e of entries){
      if(e.name.startsWith('.')&&e.isDirectory())continue;
      const absolute=path.join(dir,e.name);
      if(e.isSymbolicLink())continue;
      if(e.isDirectory()){if(!IGNORED_DIRS.has(e.name))await explore(absolute);continue;}
      if(!e.isFile())continue;
      const rel=path.relative(root,absolute).split(path.sep).join('/');
      if(!identifyFile(rel))continue;
      const isMetadata=/-meta\.xml$|\.xml$|\.json$/.test(rel)||SUPPORTED_CODE.has(path.extname(rel).toLowerCase());
      if(!isMetadata)continue;
      if(files.length>=limit){truncated=true;continue;}
      files.push({absolute,rel});
    }
  };
  await explore(root);
  if(truncated)diagnostics.push({severity:'warning',file:'',message:`Reached sfdv.maxFiles (${limit}); analysis may be incomplete`});
  return {files,truncated};
}
/**
 * Verify content hashes on every scan, including files whose timestamps and
 * length are unchanged. Reparse only when the actual bytes differ. By reading
 * the source before hashing, we retain parser inputs for changes detected here.
 */
async function loadFragments(files,root,sizeLimit,fileCache,diagnostics){
  const activeFiles=new Set(files.map(f=>f.absolute));
  for(const key of fileCache.keys())if(key.startsWith(root+path.sep)&&!activeFiles.has(key))fileCache.delete(key);
  const fragmentsByIndex=new Array(files.length);
  let changed=0,reused=0,nextFileIndex=0;
  const parseWorker=async()=>{
    while(true){
      const index=nextFileIndex++;
      if(index>=files.length)return;
      const file=files[index];
      try{
        const real=await fs.realpath(file.absolute);
        if(!within(root,real)){
          diagnostics.push({severity:'warning',file:file.rel,message:'File resolves outside source root; ignored'});continue;
        }
        const stat=await fs.stat(real);
        if(stat.size>sizeLimit){diagnostics.push({severity:'warning',file:file.rel,message:`File exceeds limit (${Math.round(stat.size/1024)} KiB); skipped`});fileCache.delete(file.absolute);continue;}
        const contents=await fs.readFile(real,'utf8');
        const hash=crypto.createHash('sha256').update(contents).digest('hex');
        const prev=fileCache.get(file.absolute);
        if(prev&&prev.sha256===hash){
          fragmentsByIndex[index]=prev.fragment;
          fileCache.set(file.absolute,{mtime:stat.mtimeMs,ctime:stat.ctimeMs,size:stat.size,sha256:hash,fragment:prev.fragment});
          reused++;continue;
        }
        const fragment=parseSource(file.rel,contents);
        fragmentsByIndex[index]=fragment;
        fileCache.set(file.absolute,{mtime:stat.mtimeMs,ctime:stat.ctimeMs,size:stat.size,sha256:hash,fragment});changed++;
      }catch(e){diagnostics.push({severity:'error',file:file.rel,message:`Unable to parse: ${e.message}`});fileCache.delete(file.absolute);}
    }
  };
  await Promise.all(Array.from({length:Math.min(8,Math.max(1,files.length))},()=>parseWorker()));
  return {fragments:fragmentsByIndex.filter(Boolean),changed,reused};
}
function within(root,target){const relative=path.relative(root,target);return relative===''||(!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative));}
module.exports={collectSourceFiles,loadFragments};
