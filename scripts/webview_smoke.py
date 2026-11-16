from playwright.sync_api import sync_playwright
from pathlib import Path
import os
root=Path(__file__).resolve().parents[1]
style=(root/'media/style.css').read_text()
helper=(root/'media/graph-highlights.js').read_text()
history=(root/'media/navigation-history.js').read_text()
app=(root/'media/app.js').read_text()
# Separate script tags are equivalent to the extension webview's local resources.
html=f'''<!doctype html><html><head><meta charset="UTF-8"><style>{style}</style></head><body><div id="app"></div><script>window.__capturedLabels=[]; window.__strokes=[]; const oldStroke=CanvasRenderingContext2D.prototype.stroke; CanvasRenderingContext2D.prototype.stroke=function(...a){{const dash=this.getLineDash();if(dash.length)window.__strokes.push({{dash:dash,color:this.strokeStyle}});return oldStroke.apply(this,a);}}; window.__messages=[]; window.acquireVsCodeApi=()=>({{postMessage:m=>window.__messages.push(m)}}); const oldFill=CanvasRenderingContext2D.prototype.fillText;CanvasRenderingContext2D.prototype.fillText=function(t,...args){{window.__capturedLabels.push(t);return oldFill.call(this,t,...args);}};</script><script>{helper}</script><script>{history}</script><script>{app}</script></body></html>'''
nodes=[{'id':f'ApexClass:{name}','name':name,'type':'ApexClass','label':name,'sources':[f'main/default/classes/{name}.cls'],'file':f'main/default/classes/{name}.cls','degree':1} for name in ['Caller','ReferencedService','Unrelated']]
edge={'id':'e0','source':nodes[0]['id'],'target':nodes[1]['id'],'relation':'REFERENCES','evidence':[{'rule':'APEX_CLASS_TYPE_USAGE','file':'main/default/classes/Caller.cls','line':1,'property':'Apex class declaration type','confidence':'inferred'}]}
field={'id':'CustomField:Invoice__c.Amount__c','name':'Invoice__c.Amount__c','type':'CustomField','label':'Amount__c','sources':['main/default/objects/Invoice__c/fields/Amount__c.field-meta.xml'],'degree':1}
nodes.append(field)
field_edge={'id':'e1','source':nodes[0]['id'],'target':field['id'],'relation':'READS','evidence':[{'rule':'APEX_SOQL_FIELD','file':'main/default/classes/Caller.cls','line':4,'property':'SOQL field','confidence':'inferred'}]}
ghost={'id':'UnresolvedCustomField:Invoice__c.External__c','name':'Invoice__c.External__c','type':'CustomField','unresolved':True,'sources':[]}
nodes.append(ghost)
class_ghost={'id':'UnresolvedApexClass:MissingService','name':'MissingService','type':'ApexClass','unresolved':True,'sources':[]}
nodes.append(class_ghost)
class_ghost_edge={'id':'u1','source':nodes[0]['id'],'target':class_ghost['id'],'relation':'UNRESOLVED_REFERENCE','unresolved':True,'evidence':[{'rule':'APEX_CLASS_USAGE','file':'main/default/classes/Caller.cls','line':10,'property':'unresolved metadata reference','confidence':'unresolved'}]}
ghost_edge={'id':'u0','source':nodes[0]['id'],'target':ghost['id'],'relation':'UNRESOLVED_REFERENCE','unresolved':True,'evidence':[{'rule':'APEX_SOBJECT_FIELD_ACCESS','file':'main/default/classes/Caller.cls','line':8,'property':'unresolved field reference','confidence':'unresolved'}]}
data={'nodes':nodes,'edges':[edge,field_edge,ghost_edge,class_ghost_edge],'catalog':nodes,'focusIds':[nodes[0]['id']],'mode':'focus','sourceFolder':'force-app','stats':{'files':4,'filesParsed':4,'filesReused':0,'nodes':4,'edges':2,'unresolved':2,'errors':0},'diagnostics':[],'unresolved':[{'source':nodes[0]['id'],'targetType':'CustomField','targetName':'Invoice__c.External__c','rule':'APEX_SOBJECT_FIELD_ACCESS','file':'main/default/classes/Caller.cls','line':8},{'source':nodes[0]['id'],'targetType':'ApexClass','targetName':'MissingService','rule':'APEX_CLASS_USAGE','file':'main/default/classes/Caller.cls','line':10}],'uncoveredTypes':[],'limited':False}
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path=os.environ.get('CHROMIUM_PATH') or None,args=['--no-sandbox','--disable-dev-shm-usage'])
 page=browser.new_page(viewport={'width':1300,'height':850})
 errors=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.set_content(html,wait_until='load')
 page.evaluate('(d)=>window.dispatchEvent(new MessageEvent("message",{data:{type:"graph",data:d}}))',data)
 page.wait_for_timeout(200)
 labels=page.evaluate('window.__capturedLabels')
 assert 'Caller' in labels,labels
 assert 'ReferencedService' in labels,labels
 assert 'Invoice__c.Amount__c' in labels,labels
 assert 'Invoice__c.External__c (unresolved)' in labels,labels
 assert 'MissingService (unresolved)' in labels,labels
 metrics=page.locator('#inspector-scroll .inspector-metrics .metric')
 assert metrics.count()==3,metrics.count()
 assert metrics.nth(2).inner_text().split('\n')[0]=='2',metrics.nth(2).inner_text()
 assert 'Unresolved in scope' in metrics.nth(2).inner_text()
 strokes=page.evaluate('window.__strokes')
 assert any(s['dash']==[1.5,5] and s['color']=='#89939e' for s in strokes),strokes[:6]
 assert 'Invoice__c.Amount__c' in page.locator('#inspector-scroll').inner_text()
 assert 'UNRESOLVED' in page.locator('#inspector-scroll').inner_text()
 assert not errors,errors
 page.locator('#search').fill('ReferencedService')
 assert page.locator('#search-results button').count()==1
 page.locator('#search-results button').click()
 messages=page.evaluate('window.__messages')
 assert messages[-1]['type']=='navigate' and messages[-1]['scope']['kind']=='focus' and messages[-1]['scope']['id']=='ApexClass:ReferencedService',messages
 print('WEBVIEW SMOKE PASS: grey dotted unresolved field/class edges, three inspector metrics, graph labels, search, and focus; no page errors')
 browser.close()
