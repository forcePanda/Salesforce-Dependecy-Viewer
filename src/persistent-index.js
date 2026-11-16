'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const zlib=require('node:zlib');
const {promisify}=require('node:util');
const {makeLineLocator}=require('./xml');
const gzip=promisify(zlib.gzip),gunzip=promisify(zlib.gunzip);
const FORMAT_VERSION=4;
const safeTree=node=>node?{name:node.name,text:node.text,offset:node.offset,children:node.children.map(safeTree)}:null;
function hydrateTree(data,parent=null){
  if(!data)return null;
  const result={name:data.name,text:data.text,offset:data.offset,parent,children:[]};
  result.children=(data.children||[]).map(c=>hydrateTree(c,result));
  return result;
}
function serializeFragment(fragment){
  return {raw:fragment.raw,diagnostics:fragment.diagnostics,components:fragment.components.map(c=>({
    type:c.type,name:c.name,file:c.file,sources:c.sources,flowObject:c.flowObject,emailObject:c.emailObject,xml:safeTree(c.xml)
  })),code:fragment.code.map(c=>({id:c.id,rel:c.rel,text:c.text}))};
}
function deserializeFragment(stored){
  const locate=makeLineLocator(stored.raw||'');
  return {raw:stored.raw,diagnostics:stored.diagnostics,components:stored.components.map(c=>({
    ...c,xml:hydrateTree(c.xml),locate:c.xml?locate:undefined
  })),code:stored.code.map(c=>({...c,locate}))};
}
function cacheFile(cacheDir,root){
  const key=crypto.createHash('sha256').update(root).digest('hex');
  return path.join(cacheDir,`sfdv-index-v${FORMAT_VERSION}-${key}.json.gz`);
}
async function loadIndex(cacheDir,root){
  if(!cacheDir)return {records:new Map(),signature:null,graph:null};
  try{
    const decoded=JSON.parse((await gunzip(await fs.readFile(cacheFile(cacheDir,root)))).toString('utf8'));
    if(decoded.formatVersion!==FORMAT_VERSION||decoded.root!==root)return {records:new Map(),signature:null,graph:null};
    return {records:new Map(decoded.files.map(([file,c])=>[file,{...c,fragment:deserializeFragment(c.fragment)}])),signature:decoded.signature||null,graph:decoded.graph||null};
  }catch(e){if(e.code!=='ENOENT')throw e;return {records:new Map(),signature:null,graph:null};}
}
async function saveIndex(cacheDir,root,records,snapshot={}){
  if(!cacheDir)return;
  await fs.mkdir(cacheDir,{recursive:true,mode:0o700});
  const file=cacheFile(cacheDir,root);
  const files=[...records].filter(([filename])=>filename.startsWith(root+path.sep)).map(([filename,c])=>[
    filename,{mtime:c.mtime,ctime:c.ctime,size:c.size,sha256:c.sha256,fragment:serializeFragment(c.fragment)}
  ]);
  const bytes=await gzip(Buffer.from(JSON.stringify({formatVersion:FORMAT_VERSION,root,files,signature:snapshot.signature||null,graph:snapshot.graph||null})));
  const temp=`${file}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  try{await fs.writeFile(temp,bytes,{mode:0o600});await fs.rename(temp,file);}finally{await fs.rm(temp,{force:true}).catch(()=>{});}
}
module.exports={loadIndex,saveIndex,cacheFile,serializeFragment,deserializeFragment};
