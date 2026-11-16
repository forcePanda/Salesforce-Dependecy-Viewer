'use strict';
const path=require('node:path');
const DIR_TYPES={
  objects:'CustomObject',fields:'CustomField',recordTypes:'RecordType',validationRules:'ValidationRule',fieldSets:'FieldSet',listViews:'ListView',compactLayouts:'CompactLayout',businessProcesses:'BusinessProcess',webLinks:'WebLink',sharingReasons:'SharingReason',
  classes:'ApexClass',triggers:'ApexTrigger',pages:'ApexPage',components:'ApexComponent',flows:'Flow',flowDefinitions:'FlowDefinition',layouts:'Layout',flexipages:'FlexiPage',
  permissionsets:'PermissionSet',profiles:'Profile',permissionsetgroups:'PermissionSetGroup',reports:'Report',reportTypes:'ReportType',dashboards:'Dashboard',
  globalValueSets:'GlobalValueSet',standardValueSets:'StandardValueSet',globalValueSetTranslations:'GlobalValueSetTranslation',
  customMetadata:'CustomMetadata',labels:'CustomLabels',workflows:'Workflow',quickActions:'QuickAction',
  applications:'CustomApplication',tabs:'CustomTab',staticresources:'StaticResource',email:'EmailTemplate',emailTemplates:'EmailTemplate',
  lwc:'LightningComponentBundle',aura:'AuraDefinitionBundle',messageChannels:'LightningMessageChannel',
  namedCredentials:'NamedCredential',externalCredentials:'ExternalCredential',remoteSiteSettings:'RemoteSiteSetting',
  connectedApps:'ConnectedApp',authproviders:'AuthProvider',networks:'Network',experiences:'ExperienceBundle',
  digitalExperiences:'DigitalExperienceBundle',sites:'CustomSite',queues:'Queue',groups:'Group',roles:'Role',
  assignmentRules:'AssignmentRules',approvalProcesses:'ApprovalProcess',escalationRules:'EscalationRules',
  matchingRules:'MatchingRule',duplicateRules:'DuplicateRule',sharingRules:'SharingRules',
  settings:'Settings',customPermissions:'CustomPermission',topicsForObjects:'TopicsForObjects',
  translations:'Translations',wave:'WaveDashboard',waveDashboards:'WaveDashboard',
  platformEventChannels:'PlatformEventChannel',platformEventChannelMembers:'PlatformEventChannelMember',
  genAiPromptTemplates:'GenAiPromptTemplate',genAiPlugins:'GenAiPlugin',genAiPlanners:'GenAiPlanner',
  genAiFunctions:'GenAiFunction',aiAgentDefinitions:'AiAgentDefinition',
  dataStreams:'DataStreamDefinition',dataConnectors:'DataConnector',externalDataSources:'ExternalDataSource'
};
const OBJECT_SUBDIRS=new Set(['fields','recordTypes','validationRules','fieldSets','listViews','compactLayouts','businessProcesses','webLinks','sharingReasons']);
const CODE_EXTENSIONS=new Set(['.cls','.trigger','.js','.html','.cmp','.app','.evt','.design','.css','.page','.component','.svg','.email']);
const IGNORED_DIRS=new Set(['.git','.svn','.hg','node_modules','dist','build','.sfdx','.sf','.vscode','coverage']);
function basenameWithoutSuffix(name){return name.replace(/-meta\.xml$/i,'').replace(/\.(?:object|field|recordType|validationRule|fieldSet|listView|compactLayout|businessProcess|webLink|sharingReason|flow|flowDefinition|cls|trigger|layout|flexipage|permissionset|profile|permissionsetgroup|report|reportType|dashboard|globalValueSet|standardValueSet|globalValueSetTranslation|md|labels|workflow|quickAction|app|tab|resource|email|messageChannel|namedCredential|externalCredential|remoteSite|connectedApp|authProvider|network|site|queue|group|role|assignmentRules|approvalProcess|escalationRules|matchingRule|duplicateRule|sharingRules|settings|customPermission|translation|waveDashboard|js|html|cmp|evt|design|css|page|component)$/i,'');}
function identifyFile(rel){
  const bits=rel.split('/').filter(Boolean);
  const name=bits[bits.length-1];
  if(name==='package.xml'||name==='sfdx-project.json'||name==='.forceignore')return null;
  let start=bits.findIndex(b=>Object.prototype.hasOwnProperty.call(DIR_TYPES,b));
  if(start<0)return null;
  let dir=bits[start];
  if(dir==='lwc'||dir==='aura'){
    if(bits.length<start+3)return null;
    const comp=bits[start+1];
    return {type:DIR_TYPES[dir],name:comp,kind:'bundle',isCode:CODE_EXTENSIONS.has(path.extname(name).toLowerCase()),metadata: name.endsWith('-meta.xml')};
  }
  if(dir==='objects'&&bits.length>start+3&&OBJECT_SUBDIRS.has(bits[start+2])){
    dir=bits[start+2];const obj=bits[start+1];
    return {type:DIR_TYPES[dir],name:`${obj}.${basenameWithoutSuffix(name)}`,kind:'xml',parentType:'CustomObject',parentName:obj};
  }
  const type=DIR_TYPES[dir];
  if(!type)return null;
  const base=basenameWithoutSuffix(name);
  const foldered=new Set(['reports','dashboards','email','emailTemplates','documents']);
  const namePart=foldered.has(dir)&&bits.length>start+2?bits.slice(start+1,-1).concat(base).join('/'):base;
  const isCode=CODE_EXTENSIONS.has(path.extname(name).toLowerCase());
  return {type,name:namePart,kind:isCode?'code':'xml',isCode};
}
function idOf(type,name){return `${type}:${name}`;}
function qualifiesField(name){return /(?:^|\.)[\w]+(?:__c|__r|__mdt|__x|__e|__b)$/.test(name);}
module.exports={DIR_TYPES,OBJECT_SUBDIRS,CODE_EXTENSIONS,IGNORED_DIRS,identifyFile,idOf,basenameWithoutSuffix,qualifiesField};
