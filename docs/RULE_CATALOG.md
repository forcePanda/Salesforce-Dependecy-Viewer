# SFDV v0.3.0 — Declarative XML Dependency Rule Catalog

**Scope:** Rules in `src/rules.js` (not the additional code-based detectors). Paths are relative to the XML root of each type. `**` is any nested sequence; `*` one element. These rules are implemented, **not certified exhaustive**.

Rules: **123**. Rules with at least one independent golden positive assertion: **98**. Unexercised by the golden oracle: **25**.

| ID | Source → Target | XML path | Relationship | Transform | Positive oracle? |
| --- | --- | --- | --- | --- | --- |
| `FIELD_LOOKUP_FILTER_VALUE_FIELD` | CustomField → CustomField | `lookupFilter.filterItems.valueField` | REFERENCES | `localField` | Not yet |
| `FIELD_FORMULA_LABEL` | CustomField → CustomLabel | `formula` | REFERENCES | `formulaLabel` | Yes |
| `FIELD_DEFAULT_LABEL` | CustomField → CustomLabel | `defaultValue` | REFERENCES | `formulaLabel` | Not yet |
| `VALIDATION_FORMULA_LABEL` | ValidationRule → CustomLabel | `errorConditionFormula` | REFERENCES | `formulaLabel` | Not yet |
| `FLOW_FORMULA_LABEL` | Flow → CustomLabel | `formulas.expression` | REFERENCES | `formulaLabel` | Yes |
| `FLOW_FORMULA_ELEMENT_REFERENCE` | Flow → CustomField | `**.elementReference` | REFERENCES | `flowExpression` | Yes |
| `FLOW_VARIABLE_OBJECT` | Flow → CustomObject | `variables.objectType` | REFERENCES | `identity` | Yes |
| `FLOW_DYNAMIC_CHOICE_OBJECT` | Flow → CustomObject | `dynamicChoiceSets.object` | READS | `identity` | Not yet |
| `FLOW_CHOICE_OBJECT` | Flow → CustomObject | `**.objectType` | REFERENCES | `identity` | Not yet |
| `FLOW_RECORD_FIELD_REFERENCE` | Flow → CustomField | `**.fieldReference` | REFERENCES | `flowExpression` | Not yet |
| `FLOW_INPUT_VALUE_REFERENCE` | Flow → CustomField | `**.inputReference` | REFERENCES | `flowExpression` | Not yet |
| `FLOW_ASSIGNMENT_REFERENCE` | Flow → CustomField | `**.assignToReference` | WRITES | `flowExpression` | Yes |
| `FLOW_DECISION_LEFT_REFERENCE` | Flow → CustomField | `**.leftValueReference` | READS | `flowExpression` | Yes |
| `FLOW_DECISION_RIGHT_REFERENCE` | Flow → CustomField | `**.rightValueReference` | READS | `flowExpression` | Not yet |
| `FLOW_SCREEN_LABEL` | Flow → CustomLabel | `**.label` | REFERENCES | `formulaLabel` | Not yet |
| `WORKFLOW_RULE_FORMULA` | WorkflowRule → CustomField | `formula` | FORMULA_REFERENCES | `formula` | Yes |
| `WORKFLOW_RULE_FORMULA_LABEL` | WorkflowRule → CustomLabel | `formula` | REFERENCES | `formulaLabel` | Not yet |
| `WORKFLOW_RULE_CRITERIA_FIELD` | WorkflowRule → CustomField | `criteriaItems.field` | READS | `localField` | Yes |
| `WORKFLOW_RULE_ALERT` | WorkflowRule → WorkflowAlert | `actions.name` | INVOKES | `localChild` | Yes |
| `WORKFLOW_RULE_FIELD_UPDATE` | WorkflowRule → WorkflowFieldUpdate | `actions.name` | INVOKES | `localChild` | Yes |
| `WORKFLOW_RULE_TASK` | WorkflowRule → WorkflowTask | `actions.name` | INVOKES | `localChild` | Not yet |
| `WORKFLOW_ALERT_TEMPLATE` | WorkflowAlert → EmailTemplate | `template` | USES | `identity` | Yes |
| `WORKFLOW_FIELD_UPDATE_TARGET` | WorkflowFieldUpdate → CustomField | `field` | WRITES | `localField` | Yes |
| `WORKFLOW_FIELD_UPDATE_FORMULA` | WorkflowFieldUpdate → CustomField | `formula` | FORMULA_REFERENCES | `formula` | Not yet |
| `APPROVAL_ENTRY_FORMULA` | ApprovalProcess → CustomField | `**.formula` | FORMULA_REFERENCES | `formula` | Yes |
| `APPROVAL_CRITERIA_FIELD` | ApprovalProcess → CustomField | `**.criteriaItems.field` | READS | `localField` | Yes |
| `APPROVAL_FORMULA_LABEL` | ApprovalProcess → CustomLabel | `**.formula` | REFERENCES | `formulaLabel` | Not yet |
| `APPROVAL_DISPLAY_FIELD` | ApprovalProcess → CustomField | `approvalPageFields.fields` | DISPLAYS | `localField` | Yes |
| `REPORT_COLUMN_FIELD` | Report → CustomField | `columns` | READS | `qualifiedField` | Yes |
| `REPORT_FILTER_COLUMN` | Report → CustomField | `filter.criteriaItems.column` | READS | `qualifiedField` | Yes |
| `REPORT_FILTER_COLUMN_ALT` | Report → CustomField | `**.filterItems.column` | READS | `qualifiedField` | Not yet |
| `PERM_CUSTOM_METADATA_ACCESS` | PermissionSet → CustomObject | `customMetadataTypeAccesses.name` | GRANTS_ACCESS | `identity` | Yes |
| `PROFILE_CUSTOM_METADATA_ACCESS` | Profile → CustomObject | `customMetadataTypeAccesses.name` | GRANTS_ACCESS | `identity` | Not yet |
| `WEBLINK_PAGE` | WebLink → ApexPage | `page` | REFERENCES | `identity` | Yes |
| `WEBLINK_URL_MERGE_FIELD` | WebLink → CustomField | `url` | REFERENCES | `mergeFormula` | Yes |
| `WEBLINK_URL_MERGE_LABEL` | WebLink → CustomLabel | `url` | REFERENCES | `mergeLabel` | Yes |
| `CUSTOM_METADATA_RECORD_FIELD` | CustomMetadata → CustomField | `values.field` | CONFIGURES | `customMetadataField` | Yes |
| `FIELD_LOOKUP_OBJECT` | CustomField → CustomObject | `referenceTo` | REFERENCES_OBJECT | `identity` | Yes |
| `FIELD_SUMMARY_FIELD` | CustomField → CustomField | `summarizedField` | SUMMARIZES | `objectField` | Yes |
| `FIELD_SUMMARY_FOREIGN_KEY` | CustomField → CustomField | `summaryForeignKey` | REFERENCES | `objectField` | Yes |
| `FIELD_REFERENCE_TARGET_FIELD` | CustomField → CustomField | `referenceTargetField` | REFERENCES | `objectField` | Yes |
| `FIELD_GLOBAL_VALUE_SET` | CustomField → GlobalValueSet | `valueSet.valueSetName` | USES_VALUE_SET | `identity` | Yes |
| `FIELD_GLOBAL_VALUE_NAME` | CustomField → GlobalValueSet | `valueSet.valueName` | USES_VALUE_SET | `identity` | Yes |
| `FIELD_CONTROLLING_FIELD` | CustomField → CustomField | `controllingField` | REFERENCES | `localField` | Yes |
| `CUSTOM_OBJECT_COMPACT_LAYOUT` | CustomObject → CompactLayout | `compactLayoutAssignment` | ASSIGNS | `localChild` | Yes |
| `RECORD_TYPE_BUSINESS_PROCESS` | RecordType → BusinessProcess | `businessProcess` | REFERENCES | `localChild` | Yes |
| `RECORD_TYPE_PICKLIST_FIELD` | RecordType → CustomField | `picklistValues.picklist` | CONFIGURES | `localField` | Yes |
| `RECORD_TYPE_COMPACT_LAYOUT` | RecordType → CompactLayout | `compactLayoutAssignment` | ASSIGNS | `localChild` | Yes |
| `FIELD_SET_MEMBER` | FieldSet → CustomField | `availableFields.field` | REFERENCES | `localField` | Yes |
| `FIELD_SET_DISPLAY` | FieldSet → CustomField | `displayedFields.field` | REFERENCES | `localField` | Yes |
| `LIST_VIEW_COLUMNS` | ListView → CustomField | `columns` | REFERENCES | `localField` | Yes |
| `LIST_VIEW_FILTER_FIELDS` | ListView → CustomField | `filters.field` | REFERENCES | `localField` | Yes |
| `COMPACT_LAYOUT_FIELDS` | CompactLayout → CustomField | `fields` | REFERENCES | `localField` | Yes |
| `VALIDATION_RULE_FORMULA` | ValidationRule → CustomField | `errorConditionFormula` | FORMULA_REFERENCES | `formula` | Yes |
| `FIELD_FORMULA` | CustomField → CustomField | `formula` | FORMULA_REFERENCES | `formula` | Yes |
| `FIELD_DEFAULT_FORMULA` | CustomField → CustomField | `defaultValue` | FORMULA_REFERENCES | `formula` | Yes |
| `FLOW_FORMULA_EXPRESSION` | Flow → CustomField | `formulas.expression` | FORMULA_REFERENCES | `formula` | Yes |
| `FIELD_LOOKUP_FILTER_FIELD` | CustomField → CustomField | `lookupFilter.filterItems.field` | REFERENCES | `localField` | Yes |
| `LAYOUT_FIELD` | Layout → CustomField | `**.layoutItems.field` | DISPLAYS | `layoutField` | Yes |
| `LAYOUT_RELATED_LIST` | Layout → CustomObject | `**.relatedLists.relatedList` | DISPLAYS | `relatedListObject` | Yes |
| `LAYOUT_QUICK_ACTION` | Layout → QuickAction | `**.quickActionListItems.quickActionName` | DISPLAYS | `identity` | Yes |
| `FLEXIPAGE_OBJECT` | FlexiPage → CustomObject | `sobjectType` | CONFIGURES | `identity` | Yes |
| `FLEXIPAGE_LWC_COMPONENT` | FlexiPage → LightningComponentBundle | `**.componentName` | EMBEDS | `componentName` | Yes |
| `FLEXIPAGE_TEMPLATE` | FlexiPage → LightningComponentBundle | `template.name` | USES_TEMPLATE | `componentName` | Not yet |
| `FLEXIPAGE_APP` | FlexiPage → CustomApplication | `**.appName` | REFERENCES | `identity` | Not yet |
| `CUSTOM_TAB_OBJECT` | CustomTab → CustomObject | `customObject` | DISPLAYS | `tabObject` | Yes |
| `CUSTOM_TAB_PAGE` | CustomTab → ApexPage | `page` | DISPLAYS | `identity` | Yes |
| `CUSTOM_APPLICATION_TABS` | CustomApplication → CustomTab | `tabs` | CONTAINS | `identity` | Yes |
| `CUSTOM_APPLICATION_LANDING_TAB` | CustomApplication → CustomTab | `defaultLandingTab` | REFERENCES | `identity` | Yes |
| `QUICK_ACTION_TARGET_OBJECT` | QuickAction → CustomObject | `targetObject` | REFERENCES | `identity` | Yes |
| `QUICK_ACTION_FLOW` | QuickAction → Flow | `flowDefinition` | INVOKES | `identity` | Yes |
| `QUICK_ACTION_VISUALFORCE` | QuickAction → ApexPage | `page` | EMBEDS | `identity` | Yes |
| `PERM_FIELD_ACCESS` | PermissionSet → CustomField | `fieldPermissions.field` | GRANTS_ACCESS | `identity` | Yes |
| `PERM_OBJECT_ACCESS` | PermissionSet → CustomObject | `objectPermissions.object` | GRANTS_ACCESS | `identity` | Yes |
| `PERM_CLASS_ACCESS` | PermissionSet → ApexClass | `classAccesses.apexClass` | GRANTS_ACCESS | `identity` | Yes |
| `PERM_PAGE_ACCESS` | PermissionSet → ApexPage | `pageAccesses.apexPage` | GRANTS_ACCESS | `identity` | Yes |
| `PERM_FLOW_ACCESS` | PermissionSet → Flow | `flowAccesses.flow` | GRANTS_ACCESS | `identity` | Yes |
| `PERM_RECORD_TYPE` | PermissionSet → RecordType | `recordTypeVisibilities.recordType` | GRANTS_ACCESS | `identity` | Yes |
| `PERM_CUSTOM_PERMISSION` | PermissionSet → CustomPermission | `customPermissions.name` | GRANTS_ACCESS | `identity` | Yes |
| `PERM_APP_VISIBILITY` | PermissionSet → CustomApplication | `applicationVisibilities.application` | GRANTS_ACCESS | `identity` | Yes |
| `PERM_TAB_VISIBILITY` | PermissionSet → CustomTab | `tabSettings.tab` | GRANTS_ACCESS | `identity` | Yes |
| `PERM_GROUP_MEMBER` | PermissionSetGroup → PermissionSet | `permissionSets` | CONTAINS | `identity` | Yes |
| `PROFILE_FIELD_ACCESS` | Profile → CustomField | `fieldPermissions.field` | GRANTS_ACCESS | `identity` | Yes |
| `PROFILE_OBJECT_ACCESS` | Profile → CustomObject | `objectPermissions.object` | GRANTS_ACCESS | `identity` | Yes |
| `PROFILE_CLASS_ACCESS` | Profile → ApexClass | `classAccesses.apexClass` | GRANTS_ACCESS | `identity` | Yes |
| `PROFILE_PAGE_ACCESS` | Profile → ApexPage | `pageAccesses.apexPage` | GRANTS_ACCESS | `identity` | Yes |
| `PROFILE_FLOW_ACCESS` | Profile → Flow | `flowAccesses.flow` | GRANTS_ACCESS | `identity` | Yes |
| `PROFILE_RECORD_TYPE` | Profile → RecordType | `recordTypeVisibilities.recordType` | GRANTS_ACCESS | `identity` | Yes |
| `PROFILE_LAYOUT` | Profile → Layout | `layoutAssignments.layout` | ASSIGNS | `identity` | Yes |
| `PROFILE_APPLICATION` | Profile → CustomApplication | `applicationVisibilities.application` | GRANTS_ACCESS | `identity` | Yes |
| `PROFILE_CUSTOM_PERMISSION` | Profile → CustomPermission | `customPermissions.name` | GRANTS_ACCESS | `identity` | Yes |
| `FLOW_SUBFLOW` | Flow → Flow | `subflows.flowName` | INVOKES | `identity` | Yes |
| `FLOW_APEX_PLUGIN` | Flow → ApexClass | `apexPluginCalls.apexClass` | INVOKES | `identity` | Yes |
| `FLOW_APEX_ACTION` | Flow → ApexClass | `actionCalls.actionName` | INVOKES | `identity` | Yes |
| `FLOW_SCREEN_LWC` | Flow → LightningComponentBundle | `**.extensionName` | EMBEDS | `componentName` | Yes |
| `FLOW_OBJECT_OPERATIONS` | Flow → CustomObject | `**.object` | ACCESSES_OBJECT | `identity` | Yes |
| `FLOW_START_OBJECT` | Flow → CustomObject | `start.object` | TRIGGERS_ON | `identity` | Yes |
| `FLOW_RECORD_TYPE` | Flow → RecordType | `**.recordTypeId` | REFERENCES | `maybeName` | Not yet |
| `FLOW_FIELD_ASSIGNMENT` | Flow → CustomField | `**.inputAssignments.field` | WRITES | `flowField` | Yes |
| `FLOW_FIELD_FILTER` | Flow → CustomField | `**.filters.field` | READS | `flowField` | Yes |
| `FLOW_FIELD_OUTPUT` | Flow → CustomField | `**.outputAssignments.field` | WRITES | `flowField` | Yes |
| `DASHBOARD_REPORT` | Dashboard → Report | `**.report` | DISPLAYS | `identity` | Yes |
| `DASHBOARD_REPORT_NAME` | Dashboard → Report | `**.reportName` | DISPLAYS | `identity` | Yes |
| `REPORT_REPORT_TYPE` | Report → ReportType | `reportType` | USES_REPORT_TYPE | `identity` | Yes |
| `REPORT_TYPE_BASE_OBJECT` | ReportType → CustomObject | `baseObject` | REPORTS_ON | `identity` | Yes |
| `REPORT_TYPE_JOIN_OBJECT` | ReportType → CustomObject | `**.object` | REPORTS_ON | `identity` | Not yet |
| `REPORT_TYPE_COLUMN_FIELD` | ReportType → CustomField | `**.field` | REFERENCES | `reportField` | Not yet |
| `EMAIL_RELATED_ENTITY` | EmailTemplate → CustomObject | `relatedEntityType` | REFERENCES | `identity` | Yes |
| `EMAIL_APEX_CLASS` | EmailTemplate → ApexClass | `apexClass` | INVOKES | `identity` | Yes |
| `NAMED_CREDENTIAL_EXTERNAL` | NamedCredential → ExternalCredential | `externalCredential` | USES_CREDENTIAL | `identity` | Yes |
| `EXTERNAL_CREDENTIAL_AUTH_PROVIDER` | ExternalCredential → AuthProvider | `**.authProvider` | REFERENCES | `identity` | Yes |
| `INTEGRATION_APEX_CLASS` | IntegrationProviderDef → ApexClass | `apexClass` | INVOKES | `identity` | Not yet |
| `INTEGRATION_EXTERNAL_SERVICE` | IntegrationProviderDef → ExternalServiceRegistration | `externalServiceRegistration` | INVOKES | `identity` | Not yet |
| `PLATFORM_CHANNEL_MEMBER` | PlatformEventChannelMember → CustomObject | `selectedEntity` | REFERENCES | `identity` | Not yet |
| `SHARING_RULE_SOURCE_OBJECT` | SharingRules → CustomObject | `object` | CONFIGURES | `identity` | Yes |
| `MATCHING_RULE_OBJECT` | MatchingRule → CustomObject | `**.object` | CONFIGURES | `identity` | Yes |
| `DUPLICATE_RULE_MATCHING` | DuplicateRule → MatchingRule | `**.matchingRule` | USES | `identity` | Yes |
| `APPROVAL_OBJECT` | ApprovalProcess → CustomObject | `**.object` | CONFIGURES | `identity` | Yes |
| `APPROVAL_EMAIL` | ApprovalProcess → EmailTemplate | `**.emailTemplate` | USES | `identity` | Yes |
| `WORKFLOW_EMAIL` | Workflow → EmailTemplate | `**.template` | USES | `identity` | Yes |
| `WORKFLOW_FIELD_UPDATE` | Workflow → CustomField | `**.field` | WRITES | `localField` | Yes |
| `GENAI_PROMPT_FLOW` | GenAiPromptTemplate → Flow | `**.flowName` | INVOKES | `identity` | Not yet |
| `GENAI_FUNCTION_APEX` | GenAiFunction → ApexClass | `**.apexClass` | INVOKES | `identity` | Not yet |

**Important:** Apex, LWC, Aura, Visualforce and email-template source-code detectors are in `src/analyzer.js` and `src/apex-metadata.js`. Their rule IDs occur in the golden oracle but do not count toward the XML table. Code detectors require syntax and owner context, not merely word matching.
