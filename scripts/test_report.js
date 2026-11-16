'use strict';
/** Audit the independent golden oracle against the actual tested fixture.
 * Intentionally report untested rules instead of treating a green suite as full coverage.
 */
const fs=require('node:fs/promises');
const path=require('node:path');
const {AnalysisService}=require('../src/analyzer');
const {DEFAULT_RULES}=require('../src/rules');
const packageJson=require('../package.json');
async function main(){
  const repo=path.resolve(__dirname,'../fixtures/enterprise');
  const oracle=JSON.parse(await fs.readFile(path.join(repo,'expected-dependencies.json'),'utf8'));
  const graph=await new AnalysisService().analyze(path.join(repo,'force-app'));
  const covered=new Set(oracle.positive.map(row=>row[3]));
  const ruleNames=new Set(DEFAULT_RULES.map(rule=>rule.id));
  const exercised=DEFAULT_RULES.filter(rule=>covered.has(rule.id)).map(r=>r.id).sort();
  const notExercised=DEFAULT_RULES.filter(rule=>!covered.has(rule.id)).map(r=>r.id).sort();
  const categoryCounts=Object.fromEntries([...new Set(graph.nodes.map(n=>n.type))].sort().map(type=>[type,graph.nodes.filter(n=>n.type===type).length]));
  const actualEvidence=new Set(graph.edges.flatMap(e=>e.evidence.map(x=>x.rule)));
  const oracleAbsent=[...covered].filter(x=>!actualEvidence.has(x));
  const report={
    generatedFrom:'fixtures/enterprise/expected-dependencies.json + live analysis of fixtures/enterprise/force-app',
    classification:'Synthetic repository tests; NOT a certification of all Salesforce orgs or API metadata types',
    fixture:{...graph.stats,metadataTypes:new Set(graph.nodes.map(n=>n.type)).size},
    goldenAssertions:{expectedPositive:oracle.positive.length,expectedNegative:oracle.negative.length,expectedUnresolved:oracle.unresolvedTargets.length},
    ruleCatalog:{total:ruleNames.size,exercised:exercised.length,unexercised:notExercised.length,exercisedRules:exercised,unexercisedRules:notExercised},
    types:categoryCounts,
    oracleRuleIdsNotInEvidence:oracleAbsent,
    outstandingLimits:[
      'Static Apex analysis is heuristic and does not resolve arbitrary dynamic SOQL, reflection, or every namespace/type expression.',
      'Complex formula, Flow expression, namespace and source bundle reference constructs remain only partially supported.',
      'Metadata API v68 type coverage is much broader than the supported rule catalog; Experience and Digital Experience JSON are not parsed for dependencies.',
      'The canvas received a standalone Chromium smoke test, but a full VS Code extension-host UI and real-org repository corpus have not been tested.'
    ]
  };
  const out=process.argv[2]?path.resolve(process.argv[2]):path.resolve(__dirname,`../../SFDV-v${packageJson.version}-test-report.json`);
  await fs.writeFile(out,JSON.stringify(report,null,2)+'\n');
  process.stdout.write(`Wrote ${out}\n${graph.stats.files} files, ${graph.stats.nodes} nodes, ${graph.stats.edges} edges, ${graph.stats.unresolved} unresolved; ${exercised.length}/${ruleNames.size} built-in rule IDs exercised by golden assertions.\n`);
  if(oracleAbsent.length){process.stderr.write(`Oracle rules absent from evidence: ${oracleAbsent.join(', ')}\n`);process.exitCode=1;}
}
main().catch(e=>{process.stderr.write(String(e)+'\n');process.exitCode=1;});
