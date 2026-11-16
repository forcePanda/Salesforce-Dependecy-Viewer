'use strict';
/**
 * Salesforce Metadata API v68 declarative reference rules.
 * A rule is deliberately explicit: arbitrary strings that happen to match
 * component names MUST NOT be turned into dependencies.
 * Rule paths are relative to the XML root of the named source metadata type.
 * `**` matches zero or more element names; `*` matches one.
 */
const rule=(id,sourceType,path,targetType,relation='REFERENCES',transform='identity',when)=>({id,sourceType,path,targetType,relation,transform,...(when?{when}:{})});
const DEFAULT_RULES=[
  // Additional schema-grounded reference paths, reviewed for v68. Source paths
  // are intentionally exact: arbitrary metadata strings are NOT dependency edges.
  rule('FIELD_LOOKUP_FILTER_VALUE_FIELD','CustomField','lookupFilter.filterItems.valueField','CustomField','REFERENCES','localField'),
  rule('FIELD_FORMULA_LABEL','CustomField','formula','CustomLabel','REFERENCES','formulaLabel'),
  rule('FIELD_DEFAULT_LABEL','CustomField','defaultValue','CustomLabel','REFERENCES','formulaLabel'),
  rule('VALIDATION_FORMULA_LABEL','ValidationRule','errorConditionFormula','CustomLabel','REFERENCES','formulaLabel'),
  rule('FLOW_FORMULA_LABEL','Flow','formulas.expression','CustomLabel','REFERENCES','formulaLabel'),
  rule('FLOW_FORMULA_ELEMENT_REFERENCE','Flow','**.elementReference','CustomField','REFERENCES','flowExpression'),
  rule('FLOW_VARIABLE_OBJECT','Flow','variables.objectType','CustomObject','REFERENCES'),
  rule('FLOW_DYNAMIC_CHOICE_OBJECT','Flow','dynamicChoiceSets.object','CustomObject','READS'),
  rule('FLOW_CHOICE_OBJECT','Flow','**.objectType','CustomObject','REFERENCES'),
  rule('FLOW_RECORD_FIELD_REFERENCE','Flow','**.fieldReference','CustomField','REFERENCES','flowExpression'),
  rule('FLOW_INPUT_VALUE_REFERENCE','Flow','**.inputReference','CustomField','REFERENCES','flowExpression'),
  rule('FLOW_ASSIGNMENT_REFERENCE','Flow','**.assignToReference','CustomField','WRITES','flowExpression'),
  rule('FLOW_DECISION_LEFT_REFERENCE','Flow','**.leftValueReference','CustomField','READS','flowExpression'),
  rule('FLOW_DECISION_RIGHT_REFERENCE','Flow','**.rightValueReference','CustomField','READS','flowExpression'),
  rule('FLOW_SCREEN_LABEL','Flow','**.label','CustomLabel','REFERENCES','formulaLabel'),
  rule('WORKFLOW_RULE_FORMULA','WorkflowRule','formula','CustomField','FORMULA_REFERENCES','formula'),
  rule('WORKFLOW_RULE_FORMULA_LABEL','WorkflowRule','formula','CustomLabel','REFERENCES','formulaLabel'),
  rule('WORKFLOW_RULE_CRITERIA_FIELD','WorkflowRule','criteriaItems.field','CustomField','READS','localField'),
  rule('WORKFLOW_RULE_ALERT','WorkflowRule','actions.name','WorkflowAlert','INVOKES','localChild',{sibling:'type',equals:'Alert'}),
  rule('WORKFLOW_RULE_FIELD_UPDATE','WorkflowRule','actions.name','WorkflowFieldUpdate','INVOKES','localChild',{sibling:'type',equals:'FieldUpdate'}),
  rule('WORKFLOW_RULE_TASK','WorkflowRule','actions.name','WorkflowTask','INVOKES','localChild',{sibling:'type',equals:'Task'}),
  rule('WORKFLOW_ALERT_TEMPLATE','WorkflowAlert','template','EmailTemplate','USES'),
  rule('WORKFLOW_FIELD_UPDATE_TARGET','WorkflowFieldUpdate','field','CustomField','WRITES','localField'),
  rule('WORKFLOW_FIELD_UPDATE_FORMULA','WorkflowFieldUpdate','formula','CustomField','FORMULA_REFERENCES','formula'),
  rule('APPROVAL_ENTRY_FORMULA','ApprovalProcess','**.formula','CustomField','FORMULA_REFERENCES','formula'),
  rule('APPROVAL_CRITERIA_FIELD','ApprovalProcess','**.criteriaItems.field','CustomField','READS','localField'),
  rule('APPROVAL_FORMULA_LABEL','ApprovalProcess','**.formula','CustomLabel','REFERENCES','formulaLabel'),
  rule('APPROVAL_DISPLAY_FIELD','ApprovalProcess','approvalPageFields.fields','CustomField','DISPLAYS','localField'),
  rule('REPORT_COLUMN_FIELD','Report','columns','CustomField','READS','qualifiedField'),
  rule('REPORT_FILTER_COLUMN','Report','filter.criteriaItems.column','CustomField','READS','qualifiedField'),
  rule('REPORT_FILTER_COLUMN_ALT','Report','**.filterItems.column','CustomField','READS','qualifiedField'),
  rule('PERM_CUSTOM_METADATA_ACCESS','PermissionSet','customMetadataTypeAccesses.name','CustomObject','GRANTS_ACCESS','identity',{sibling:'enabled',equals:'true'}),
  rule('PROFILE_CUSTOM_METADATA_ACCESS','Profile','customMetadataTypeAccesses.name','CustomObject','GRANTS_ACCESS','identity',{sibling:'enabled',equals:'true'}),
  rule('WEBLINK_PAGE','WebLink','page','ApexPage','REFERENCES','identity',{sibling:'linkType',equals:'page'}),
  rule('WEBLINK_URL_MERGE_FIELD','WebLink','url','CustomField','REFERENCES','mergeFormula'),
  rule('WEBLINK_URL_MERGE_LABEL','WebLink','url','CustomLabel','REFERENCES','mergeLabel'),
  rule('CUSTOM_METADATA_RECORD_FIELD','CustomMetadata','values.field','CustomField','CONFIGURES','customMetadataField'),
  // Data model
  rule('FIELD_LOOKUP_OBJECT','CustomField','referenceTo','CustomObject','REFERENCES_OBJECT','identity',{sibling:'type',oneOf:['Lookup','MasterDetail','ExternalLookup','IndirectLookup']}),
  rule('FIELD_SUMMARY_FIELD','CustomField','summarizedField','CustomField','SUMMARIZES','objectField'),
  rule('FIELD_SUMMARY_FOREIGN_KEY','CustomField','summaryForeignKey','CustomField','REFERENCES','objectField'),
  rule('FIELD_REFERENCE_TARGET_FIELD','CustomField','referenceTargetField','CustomField','REFERENCES','objectField'),
  rule('FIELD_GLOBAL_VALUE_SET','CustomField','valueSet.valueSetName','GlobalValueSet','USES_VALUE_SET'),
  rule('FIELD_GLOBAL_VALUE_NAME','CustomField','valueSet.valueName','GlobalValueSet','USES_VALUE_SET'),
  rule('FIELD_CONTROLLING_FIELD','CustomField','controllingField','CustomField','REFERENCES','localField'),
  rule('CUSTOM_OBJECT_COMPACT_LAYOUT','CustomObject','compactLayoutAssignment','CompactLayout','ASSIGNS','localChild'),
  rule('RECORD_TYPE_BUSINESS_PROCESS','RecordType','businessProcess','BusinessProcess','REFERENCES','localChild'),
  rule('RECORD_TYPE_PICKLIST_FIELD','RecordType','picklistValues.picklist','CustomField','CONFIGURES','localField'),
  rule('RECORD_TYPE_COMPACT_LAYOUT','RecordType','compactLayoutAssignment','CompactLayout','ASSIGNS','localChild'),
  rule('FIELD_SET_MEMBER','FieldSet','availableFields.field','CustomField','REFERENCES','localField'),
  rule('FIELD_SET_DISPLAY','FieldSet','displayedFields.field','CustomField','REFERENCES','localField'),
  rule('LIST_VIEW_COLUMNS','ListView','columns','CustomField','REFERENCES','localField'),
  rule('LIST_VIEW_FILTER_FIELDS','ListView','filters.field','CustomField','REFERENCES','localField'),
  rule('COMPACT_LAYOUT_FIELDS','CompactLayout','fields','CustomField','REFERENCES','localField'),
  rule('VALIDATION_RULE_FORMULA','ValidationRule','errorConditionFormula','CustomField','FORMULA_REFERENCES','formula'),
  rule('FIELD_FORMULA','CustomField','formula','CustomField','FORMULA_REFERENCES','formula'),
  rule('FIELD_DEFAULT_FORMULA','CustomField','defaultValue','CustomField','FORMULA_REFERENCES','formula'),
  rule('FLOW_FORMULA_EXPRESSION','Flow','formulas.expression','CustomField','FORMULA_REFERENCES','formula'),
  rule('FIELD_LOOKUP_FILTER_FIELD','CustomField','lookupFilter.filterItems.field','CustomField','REFERENCES','localField'),
  // Layouts and Lightning pages
  rule('LAYOUT_FIELD','Layout','**.layoutItems.field','CustomField','DISPLAYS','layoutField'),
  rule('LAYOUT_RELATED_LIST','Layout','**.relatedLists.relatedList','CustomObject','DISPLAYS','relatedListObject'),
  rule('LAYOUT_QUICK_ACTION','Layout','**.quickActionListItems.quickActionName','QuickAction','DISPLAYS'),
  rule('FLEXIPAGE_OBJECT','FlexiPage','sobjectType','CustomObject','CONFIGURES'),
  rule('FLEXIPAGE_LWC_COMPONENT','FlexiPage','**.componentName','LightningComponentBundle','EMBEDS','componentName'),
  rule('FLEXIPAGE_TEMPLATE','FlexiPage','template.name','LightningComponentBundle','USES_TEMPLATE','componentName'),
  rule('FLEXIPAGE_APP','FlexiPage','**.appName','CustomApplication','REFERENCES'),
  rule('CUSTOM_TAB_OBJECT','CustomTab','customObject','CustomObject','DISPLAYS','tabObject'),
  rule('CUSTOM_TAB_PAGE','CustomTab','page','ApexPage','DISPLAYS'),
  rule('CUSTOM_APPLICATION_TABS','CustomApplication','tabs','CustomTab','CONTAINS'),
  rule('CUSTOM_APPLICATION_LANDING_TAB','CustomApplication','defaultLandingTab','CustomTab','REFERENCES'),
  rule('QUICK_ACTION_TARGET_OBJECT','QuickAction','targetObject','CustomObject','REFERENCES'),
  rule('QUICK_ACTION_FLOW','QuickAction','flowDefinition','Flow','INVOKES'),
  rule('QUICK_ACTION_VISUALFORCE','QuickAction','page','ApexPage','EMBEDS'),
  // Security/authorization relationships: separate from functional calls.
  rule('PERM_FIELD_ACCESS','PermissionSet','fieldPermissions.field','CustomField','GRANTS_ACCESS','identity',{anyTrue:['readable','editable']}),
  rule('PERM_OBJECT_ACCESS','PermissionSet','objectPermissions.object','CustomObject','GRANTS_ACCESS','identity',{anyTrue:['allowRead','allowCreate','allowEdit','allowDelete','viewAllRecords','modifyAllRecords']}),
  rule('PERM_CLASS_ACCESS','PermissionSet','classAccesses.apexClass','ApexClass','GRANTS_ACCESS','identity',{sibling:'enabled',equals:'true'}),
  rule('PERM_PAGE_ACCESS','PermissionSet','pageAccesses.apexPage','ApexPage','GRANTS_ACCESS','identity',{sibling:'enabled',equals:'true'}),
  rule('PERM_FLOW_ACCESS','PermissionSet','flowAccesses.flow','Flow','GRANTS_ACCESS','identity',{sibling:'enabled',equals:'true'}),
  rule('PERM_RECORD_TYPE','PermissionSet','recordTypeVisibilities.recordType','RecordType','GRANTS_ACCESS','identity',{sibling:'visible',equals:'true'}),
  rule('PERM_CUSTOM_PERMISSION','PermissionSet','customPermissions.name','CustomPermission','GRANTS_ACCESS','identity',{sibling:'enabled',equals:'true'}),
  rule('PERM_APP_VISIBILITY','PermissionSet','applicationVisibilities.application','CustomApplication','GRANTS_ACCESS','identity',{sibling:'visible',equals:'true'}),
  rule('PERM_TAB_VISIBILITY','PermissionSet','tabSettings.tab','CustomTab','GRANTS_ACCESS'),
  rule('PERM_GROUP_MEMBER','PermissionSetGroup','permissionSets','PermissionSet','CONTAINS'),
  rule('PROFILE_FIELD_ACCESS','Profile','fieldPermissions.field','CustomField','GRANTS_ACCESS','identity',{anyTrue:['readable','editable']}),
  rule('PROFILE_OBJECT_ACCESS','Profile','objectPermissions.object','CustomObject','GRANTS_ACCESS','identity',{anyTrue:['allowRead','allowCreate','allowEdit','allowDelete','viewAllRecords','modifyAllRecords']}),
  rule('PROFILE_CLASS_ACCESS','Profile','classAccesses.apexClass','ApexClass','GRANTS_ACCESS','identity',{sibling:'enabled',equals:'true'}),
  rule('PROFILE_PAGE_ACCESS','Profile','pageAccesses.apexPage','ApexPage','GRANTS_ACCESS','identity',{sibling:'enabled',equals:'true'}),
  rule('PROFILE_FLOW_ACCESS','Profile','flowAccesses.flow','Flow','GRANTS_ACCESS','identity',{sibling:'enabled',equals:'true'}),
  rule('PROFILE_RECORD_TYPE','Profile','recordTypeVisibilities.recordType','RecordType','GRANTS_ACCESS','identity',{sibling:'visible',equals:'true'}),
  rule('PROFILE_LAYOUT','Profile','layoutAssignments.layout','Layout','ASSIGNS'),
  rule('PROFILE_APPLICATION','Profile','applicationVisibilities.application','CustomApplication','GRANTS_ACCESS','identity',{sibling:'visible',equals:'true'}),
  rule('PROFILE_CUSTOM_PERMISSION','Profile','customPermissions.name','CustomPermission','GRANTS_ACCESS','identity',{sibling:'enabled',equals:'true'}),
  // Flow schema, actions, subflows, record operations
  rule('FLOW_SUBFLOW','Flow','subflows.flowName','Flow','INVOKES'),
  rule('FLOW_APEX_PLUGIN','Flow','apexPluginCalls.apexClass','ApexClass','INVOKES'),
  rule('FLOW_APEX_ACTION','Flow','actionCalls.actionName','ApexClass','INVOKES','identity',{sibling:'actionType',oneOf:['apex','Apex']}),
  rule('FLOW_SCREEN_LWC','Flow','**.extensionName','LightningComponentBundle','EMBEDS','componentName'),
  rule('FLOW_OBJECT_OPERATIONS','Flow','**.object','CustomObject','ACCESSES_OBJECT'),
  rule('FLOW_START_OBJECT','Flow','start.object','CustomObject','TRIGGERS_ON'),
  rule('FLOW_RECORD_TYPE','Flow','**.recordTypeId','RecordType','REFERENCES','maybeName'),
  rule('FLOW_FIELD_ASSIGNMENT','Flow','**.inputAssignments.field','CustomField','WRITES','flowField'),
  rule('FLOW_FIELD_FILTER','Flow','**.filters.field','CustomField','READS','flowField'),
  rule('FLOW_FIELD_OUTPUT','Flow','**.outputAssignments.field','CustomField','WRITES','flowField'),
  // Reports and dashboards
  rule('DASHBOARD_REPORT','Dashboard','**.report','Report','DISPLAYS'),
  rule('DASHBOARD_REPORT_NAME','Dashboard','**.reportName','Report','DISPLAYS'),
  rule('REPORT_REPORT_TYPE','Report','reportType','ReportType','USES_REPORT_TYPE'),
  rule('REPORT_TYPE_BASE_OBJECT','ReportType','baseObject','CustomObject','REPORTS_ON'),
  rule('REPORT_TYPE_JOIN_OBJECT','ReportType','**.object','CustomObject','REPORTS_ON'),
  rule('REPORT_TYPE_COLUMN_FIELD','ReportType','**.field','CustomField','REFERENCES','reportField'),
  // Other Metadata API reference fields
  rule('EMAIL_RELATED_ENTITY','EmailTemplate','relatedEntityType','CustomObject','REFERENCES'),
  rule('EMAIL_APEX_CLASS','EmailTemplate','apexClass','ApexClass','INVOKES'),
  rule('NAMED_CREDENTIAL_EXTERNAL','NamedCredential','externalCredential','ExternalCredential','USES_CREDENTIAL'),
  rule('EXTERNAL_CREDENTIAL_AUTH_PROVIDER','ExternalCredential','**.authProvider','AuthProvider','REFERENCES'),
  rule('INTEGRATION_APEX_CLASS','IntegrationProviderDef','apexClass','ApexClass','INVOKES'),
  rule('INTEGRATION_EXTERNAL_SERVICE','IntegrationProviderDef','externalServiceRegistration','ExternalServiceRegistration','INVOKES'),
  rule('PLATFORM_CHANNEL_MEMBER','PlatformEventChannelMember','selectedEntity','CustomObject','REFERENCES'),
  rule('SHARING_RULE_SOURCE_OBJECT','SharingRules','object','CustomObject','CONFIGURES'),
  rule('MATCHING_RULE_OBJECT','MatchingRule','**.object','CustomObject','CONFIGURES'),
  rule('DUPLICATE_RULE_MATCHING','DuplicateRule','**.matchingRule','MatchingRule','USES'),
  rule('APPROVAL_OBJECT','ApprovalProcess','**.object','CustomObject','CONFIGURES'),
  rule('APPROVAL_EMAIL','ApprovalProcess','**.emailTemplate','EmailTemplate','USES'),
  rule('WORKFLOW_EMAIL','Workflow','**.template','EmailTemplate','USES'),
  rule('WORKFLOW_FIELD_UPDATE','Workflow','**.field','CustomField','WRITES','localField'),
  rule('GENAI_PROMPT_FLOW','GenAiPromptTemplate','**.flowName','Flow','INVOKES'),
  rule('GENAI_FUNCTION_APEX','GenAiFunction','**.apexClass','ApexClass','INVOKES')
];
function customRuleSet(customRules){
  const byId=new Map(DEFAULT_RULES.map(r=>[r.id,r])); const warnings=[];
  for(const r of Array.isArray(customRules)?customRules:[]){
    if(!r||typeof r.id!=='string'||typeof r.sourceType!=='string'||typeof r.path!=='string'||typeof r.targetType!=='string'||!r.id||!r.path){warnings.push('Skipped invalid custom rule');continue;}
    if(!/^[\w*]+(?:\.[\w*]+)*$/.test(r.path)){warnings.push(`Invalid path in custom rule ${r.id}`);continue;}
    if(!['identity','objectField','localField','localChild','layoutField','relatedListObject','componentName','flowField','reportField','formula','formulaLabel','flowExpression','qualifiedField','mergeFormula','mergeLabel','customMetadataField','maybeName','tabObject'].includes(r.transform||'identity')){warnings.push(`Unknown transform for ${r.id}`);continue;}
    byId.set(r.id,{...r,relation:r.relation||'REFERENCES',transform:r.transform||'identity'});
  }
  return {rules:[...byId.values()],warnings};
}
module.exports={DEFAULT_RULES,customRuleSet};
