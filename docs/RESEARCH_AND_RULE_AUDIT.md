# SFDV v0.3.0 — Research, dependency rule audit, and engine changes

Research date: 2026-11-15. Scope: Salesforce Metadata API files already checked into the user-configured source folder. **SFDV does not query a Salesforce org**; native tools are used as benchmarks and sources of ideas, not as runtime dependencies.

## Comparison of public Salesforce dependency tooling

| Project or product | Publicly documented capabilities | Applicable lesson or gap |
| --- | --- | --- |
| [Salesforce Where is this used?](https://help.salesforce.com/s/articleView?id=platform.fields_references.htm&language=en_US) | Finds references to supported fields in Apex, layouts, formulas, validation rules, Visualforce, email templates, field sets, Flow queries and more | Test detection of multiple languages and field-level owners; native coverage is not complete |
| [Salesforce MetadataComponentDependency](https://developer.salesforce.com/docs/platform/api-tooling/references/tooling-objects/tooling-metadatacomponentdependency.html) | Directional graph records (`MetadataComponent*` → `RefMetadataComponent*`); Beta; query and reporting limits | Directed identities, but do not depend on the API for repository-based discovery |
| [HappySoup](https://github.com/bmar/HappySoup.io) | Open-source impact analysis; documents native API plus Apex, CustomField, Workflow, Layout, EmailTemplate and other metadata inspection | Cross-check explicit metadata sources and evidence beyond Tooling API |
| [Elements.cloud dependency trees](https://support.elements.cloud/en/articles/3771943-dependency-trees) | Direct and transitive dependency explorer | Directed edge categories, traversals, source evidence |
| [Elements.cloud dependency grid](https://support.elements.cloud/en/articles/8016987-dependency-explorer-grid) | Filtered metadata reference analysis | Index nodes and edges independently from displayed overview |
| [Salto impact analysis](https://help.salto.io/en/articles/6926930-impact-analysis-for-all-salesforce-metadata-types) | Dependency relations and content search for diverse metadata, including email templates | Metadata types beyond custom fields and code |
| [Salto's native Where Used comparison](https://www.salto.io/blog-posts/salesforces-where-is-this-used-vs-saltos-impact-analysis) | Shows precise usage location in metadata and Apex source | Preserve XML property paths, file path and line in every edge's evidence |
| [Gearset dependency analysis](https://docs.gearset.com/en/articles/595095-running-your-first-deployment) | Separates subcomponents, dependency edges, permissions | Keep `CONTAINS`, `REFERENCES`, `INVOKES`, `GRANTS_ACCESS` distinct |
| [ImpactLens VS Code extension](https://github.com/bkareti/impact-lens) | Source-based VS Code metadata search and impact analysis across many types | Local-first UX and indexing of many directories |
| [Dependency Graph for Salesforce](https://github.com/fmendes/dependencygraphforsf) | Open-source code graph extension | Class references, local source-package recognition |
| [ruohomaa/dependency_viewer](https://github.com/ruohomaa/dependency_viewer) | Local SQLite graph of Tooling API dependency rows | Build graph indexes for repeated lookups; note this example uses a live org and SFDV does not |
| [sfdx-hardis metadata-deps](https://sfdx-hardis.cloudity.com/hardis/doc/metadata-deps/) | Normalizes Flow versions and copes with Tooling API result limits | Name/identity normalization matters; native API complements but does not replace local scanning |

The implementations and proprietary internal rule catalogs of commercial competitors are generally **not public**. This review does not claim access to them or exhaustive coverage of every product in the market.

## Salesforce reference documents used to justify additions

- [CustomMetadata](https://developer.salesforce.com/docs/platform/api-metadata/references/meta-types/metadata-custommetadata.html): `values` carry typed field values; `EntityDefinition` and `FieldDefinition` values may contain qualified API names. A plain text value is not automatically a metadata reference.
- [WebLink](https://developer.salesforce.com/docs/platform/api-metadata/references/meta-types/metadata-weblink.html): `page` references a Visualforce page when `linkType=page`; `url` can hold content, and merge tokens can be interpreted when present.
- [Workflow](https://developer.salesforce.com/docs/platform/api-metadata/references/meta-types/metadata-workflow.html): nested rules, workflow actions, field updates, alerts and formula/criteria fields.
- [ApprovalProcess](https://developer.salesforce.com/docs/platform/api-metadata/references/meta-types/metadata-approvalprocess.html): entry criteria, formulas, field references and related metadata.
- [Flow](https://developer.salesforce.com/docs/platform/api-metadata/references/meta-types/metadata-flow.html): subflows, action calls, record elements and typed flow resources.
- [LWC schema imports](https://developer.salesforce.com/docs/platform/lwc/guide/apex-schema.html): static `@salesforce/schema` references, including relationship paths.
- [LWC permission imports](https://developer.salesforce.com/docs/platform/lwc/guide/create-get-permissions.html): static `@salesforce/customPermission/...` references.
- [Custom labels](https://help.salesforce.com/s/articleView?id=sf.cl_about.htm&language=en_US&type=5): `$Label` in Flow/Visualforce/Aura, `System.Label.Name` in Apex, `@salesforce/label/...` in LWC.
- [Metadata API fullName and namespace syntax](https://developer.salesforce.com/docs/platform/api-metadata/references/meta-types/metadata-metadata.html): qualified component identity.
- Attached Metadata API v68 developer guide: local schema/source-format reference supplied for this SFDV project.

## Discovery algorithms used in v0.3.0

1. **Two-pass indexing:** discover all component identities from the configured folder before extracting references so scan order cannot change resolution.
2. **Schema-specific XML rules:** explicit `sourceType` + property path + semantic relationship + optional sibling conditions. `*` and `**` match subelements, not arbitrary text.
3. **Owner-aware resolution:** bind custom fields to their actual `CustomObject` parent; associate Flow variable references with `<variables><objectType>` and named record operations; associate classic email `relatedTo` with `<relatedEntityType>`.
4. **Source-code lexical masking:** suppress comments and quoted literals when evaluating Apex class symbols, and require syntactically valid contexts for labels, permissions and pages.
5. **Nested SOQL ownership:** recursively analyze child relationship SELECTs; resolve `FROM <childRelationship>` using indexed `CustomField.relationshipName` and `referenceTo`, not the outer object or an unqualified field name.
6. **Explicit custom metadata relationship semantics:** infer `CustomMetadata.values.value` → `CustomObject` or `CustomField` only when the corresponding custom metadata field is declared as `MetadataRelationship` to `EntityDefinition` or `FieldDefinition`.
7. **Provenance:** retain file, source line, metadata property, rule ID and a confidence tag for each matched edge; keep unresolved references separate from resolved graph edges.
8. **Performance:** index declarative rules by source type, cache Flow resource-object owner maps, and perform graph neighborhood traversals using adjacency indexes. Parsed-file cache now checks mtime + ctime + file size (not a cryptographic hash).

## Newly supported or improved relationships

- WorkflowRule → WorkflowAlert/WorkflowFieldUpdate/WorkflowTask; WorkflowAlert → EmailTemplate; WorkflowFieldUpdate → CustomField; Workflow criteria/formulas → field.
- ApprovalProcess formula/criteria/page fields → CustomField.
- Flow formula → CustomLabel, typed Flow variable → CustomObject, element and decision references → an object-scoped CustomField, dynamic choices → CustomObject.
- Report columns/filter criteria → qualified fields; ReportType base objects retained.
- Apex → CustomLabel, CustomPermission, ApexPage, and literal Type.forName references.
- LWC → CustomPermission and relationship-traversed `@salesforce/schema` fields.
- Visualforce → multiple Apex extensions, standard controller object, field expressions, custom labels.
- Classic `.email` template bodies → scoped field merge references and labels.
- WebLink → Visualforce page, merge-token fields and labels (but **not** arbitrary URL text).
- CustomMetadata → defining custom type/field and *declared metadata relationship* values (not ordinary text).

The complete catalog of implemented declarative rules with `sourceType`, exact XML path, transform, relation and golden-test status is in `RULE_CATALOG.md`. Code-detection patterns are documented in `src/analyzer.js` and `src/apex-metadata.js` and covered by regression tests; they are not misrepresented as declarative XML rules.

## Test evidence and limitations

`npm test` executes independent golden assertions for every expected edge, forbidden edge, and unresolved candidate, plus unit, traversal, cache, and graph-highlight tests. The test report names rule IDs with no positive golden fixture; a green build is not synonymous with complete v68 coverage.

Known gaps requiring future work:

1. **Full Apex/JavaScript AST and symbol resolution:** current Apex lexing and scoped sObject tracking remains heuristic. Dynamically built SOQL, reflection or dependencies from code outside the source folder cannot be resolved reliably.
2. **Full Salesforce formula language:** current logic is contextual token matching with literal masking, not a complete formula parser. Complex multi-hop relationships, custom functions and cross-object scope may be missed.
3. **Flow's full nested schema:** resource ownership is handled for common record variables and named record operations; not every subelement or action has a distinct parser.
4. **Experience/Digital Experience JSON:** currently intentionally reports unsupported JSON structures rather than inventing references.
5. **Standard fields not indexed in the repo:** no fabricated graph nodes are created; standard platform fields may be missing without a platform schema index.
6. **Namespaced/package references:** qualified names can be kept, but namespace aliasing and inaccessible managed package internals are not guaranteed to resolve.
7. **Reports, permissions, and niche Metadata API types:** many less common types remain without tested rules; review the unexercised list in the generated test report.
8. **Validation in a live VS Code host and Salesforce org:** this synthetic repository is not certified to deploy, and end-to-end VS Code host behavior is not tested in this environment.

**Recommendation:** To make false-negative risk measurable, expand the golden corpus with *real* metadata snapshots (anonymized where needed), add rule-coverage tracking per supported type, and optionally compare a separate authenticated-org dataset with Salesforce's native dependency endpoint. The latter must be opt-in and must never change SFDV's source-folder-only default.
