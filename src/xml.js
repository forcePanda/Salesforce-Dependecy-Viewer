'use strict';

/** Minimal, dependency-free XML element parser for Salesforce metadata.
 * Only stores element names, direct text and source offsets; no DTD resolution.
 * Malformed XML is explicitly rejected so partially parsed trees never masquerade as complete.
 */
function parseXml(xml) {
  if (/<!DOCTYPE\b|<!ENTITY\b/i.test(xml)) throw new Error('DTD / entity declarations are not accepted');
  const root = {name:'$document', children:[], text:'', offset:0, parent:null};
  const stack = [root];
  const len = xml.length;
  let i = 0;
  while (i < len) {
    if (xml[i] !== '<') {
      let j = xml.indexOf('<', i);
      if (j < 0) j = len;
      stack[stack.length - 1].text += decodeEntities(xml.slice(i,j));
      i = j;
      continue;
    }
    if (xml.startsWith('<!--',i)) {
      const end = xml.indexOf('-->',i+4); if (end < 0) throw new Error('Unterminated XML comment');
      i=end+3; continue;
    }
    if (xml.startsWith('<![CDATA[',i)) {
      const end=xml.indexOf(']]>',i+9); if(end<0)throw new Error('Unterminated CDATA');
      stack[stack.length-1].text+=xml.slice(i+9,end);i=end+3;continue;
    }
    if (xml.startsWith('<?',i)) {
      const end=xml.indexOf('?>',i+2); if(end<0)throw new Error('Unterminated processing instruction');
      i=end+2; continue;
    }
    const start = i;
    let quote = ''; i++;
    for (; i<len; i++) {
      const c=xml[i];
      if (quote) {if(c===quote)quote='';}
      else if(c==='"'||c==="'") quote=c;
      else if(c==='>') break;
    }
    if(i===len)throw new Error('Unterminated XML tag');
    const inside=xml.slice(start+1,i).trim(); i++;
    if(inside.startsWith('!'))throw new Error('Unsupported XML declaration');
    if(inside.startsWith('/')) {
      const close=stripPrefix(inside.slice(1).trim());
      if(stack.length===1 || stack[stack.length-1].name!==close)throw new Error(`Mismatched closing tag ${close}`);
      stack.pop();continue;
    }
    const selfClose=/\/\s*$/.test(inside);
    const m=/^([\w.:-]+)/.exec(inside);
    if(!m)throw new Error('Invalid XML element');
    const el={name:stripPrefix(m[1]), text:'',children:[],offset:start,parent:stack[stack.length-1]};
    stack[stack.length-1].children.push(el);
    if(!selfClose)stack.push(el);
  }
  if(stack.length!==1)throw new Error('Unclosed XML element '+stack[stack.length-1].name);
  if(root.children.length!==1)throw new Error('Expected exactly one XML document element');
  return root.children[0];
}
function stripPrefix(name){return name.includes(':')?name.slice(name.lastIndexOf(':')+1):name;}
function decodeEntities(s){return s.replace(/&(amp|lt|gt|quot|apos|#x[0-9A-Fa-f]+|#\d+);/g,(_,v)=>{
  const named={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"};
  if(Object.prototype.hasOwnProperty.call(named,v))return named[v];
  const n=v[1]==='x'?parseInt(v.slice(2),16):parseInt(v.slice(1),10);
  return Number.isInteger(n)&&n>=0&&n<=0x10ffff?String.fromCodePoint(n):'';
});}
function children(node,name){return node.children.filter(c=>c.name===name);}
function one(node,name){return node?.children.find(c=>c.name===name);}
function value(node,name){return one(node,name)?.text.trim()||'';}
function walk(node,visit,path=[]){for(const c of node.children){const p=[...path,c.name];visit(c,p);walk(c,visit,p);}}
function pathMatches(pattern,parts){
  const p=pattern.split('.');
  const recur=(i,j)=>{
    if(i===p.length)return j===parts.length;
    if(p[i]==='**')return recur(i+1,j)||(j<parts.length&&recur(i,j+1));
    return j<parts.length&&(p[i]==='*'||p[i]===parts[j])&&recur(i+1,j+1);
  }; return recur(0,0);
}
function makeLineLocator(raw){
  const starts=[0];for(let i=0;i<raw.length;i++)if(raw.charCodeAt(i)===10)starts.push(i+1);
  return offset=>{let l=0,r=starts.length;while(l+1<r){const m=(l+r)>>1;if(starts[m]<=offset)l=m;else r=m;}return l+1;};
}
module.exports={parseXml,children,one,value,walk,pathMatches,makeLineLocator};
