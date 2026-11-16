'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {AnalysisService,neighborhood}=require('../src/analyzer');

async function fixture(files,run){
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'sfdv-class-refs-'));
  const source=path.join(temp,'force-app');
  try{
    for(const [name,body] of Object.entries(files)){
      const dest=path.join(source,'main/default/classes',name+'.cls');
      await fs.mkdir(path.dirname(dest),{recursive:true});
      await fs.writeFile(dest,body);
    }
    return await run(source);
  }finally{await fs.rm(temp,{recursive:true,force:true});}
}

const target='ApexClass:ReferencedService';
const noCallCases={
  MemberReference:'public class MemberReference { private ReferencedService service; }',
  ParameterReference:'public class ParameterReference { public void handle(ReferencedService service) {} }',
  ReturnReference:'public class ReturnReference { public ReferencedService create() { return null; } }',
  GenericReference:'public class GenericReference { private Map<String, List<ReferencedService>> services; }',
  ArrayReference:'public class ArrayReference { private ReferencedService[] services; }',
  CastReference:'public class CastReference { public Object convert(Object arg) { return (ReferencedService) arg; } }',
  ConstantReference:'public class ConstantReference { public Integer count() { return ReferencedService.TIMEOUT; } }',
  MultipleInterfaces:'public class MultipleInterfaces implements FirstContract, ReferencedService { }',
  ConstructionReference:'public class ConstructionReference { void run() { Object value = new ReferencedService(); } }',
  StaticInvocation:'public class StaticInvocation { void run() { ReferencedService.execute(); } }'
};

test('Apex references are extracted from all common static type contexts, not just calls',async t=>{
  const files={...Object.fromEntries(Object.entries(noCallCases).map(([k,v])=>[k,v])),
    ReferencedService:'public interface ReferencedService { Integer TIMEOUT = 2; void execute(); }',
    FirstContract:'public interface FirstContract {}',
    Unrelated:'public class Unrelated {}'};
  await fixture(files,async source=>{
    const g=await new AnalysisService().analyze(source);
    for(const name of Object.keys(noCallCases)){
      await t.test(name,()=>{
        const edges=g.edges.filter(e=>e.source===`ApexClass:${name}`&&e.target===target);
        assert.ok(edges.length,`${name} should reference ${target}`);
        assert.ok(edges.some(e=>e.evidence.some(ev=>ev.file.endsWith(`${name}.cls`)&&ev.line>=1)),'missing source evidence');
        const backwards=neighborhood(g,[target],'in',1);
        assert.ok(backwards.nodes.some(n=>n.id===`ApexClass:${name}`),'class must appear in reverse-reference search');
      });
    }
    assert.equal(g.edges.filter(e=>e.source==='ApexClass:Unrelated'&&e.target===target).length,0);
  });
});

test('Apex scanner never infers a class reference from comments, strings or lookalike identifiers',async()=>{
  await fixture({
    ReferencedService:'public class ReferencedService {}',
    ReferencedServiceUtil:'public class ReferencedServiceUtil {}',
    Noise:`public class Noise {
       // ReferencedService service; ReferencedService.execute();
       /* List<ReferencedService> values; */
       String phrase = 'ReferencedService service; ReferencedService.execute();';
       String raw = 'https://example.com/ReferencedService.execute();';
       Integer ReferencedServiceCount = 1;
       void use() { System.debug('new ReferencedService()'); }
     }`
  },async source=>{
    const g=await new AnalysisService().analyze(source);
    assert.ok(!g.edges.some(e=>e.source==='ApexClass:Noise'&&/ReferencedService/.test(e.target)),JSON.stringify(g.edges));
  });
});
