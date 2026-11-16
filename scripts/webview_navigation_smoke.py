"""Functional browser smoke test for org-first exploration and history."""
from pathlib import Path
import os
from playwright.sync_api import sync_playwright

root=Path(__file__).resolve().parents[1]
style=(root/'media/style.css').read_text()
helper=(root/'media/graph-highlights.js').read_text()
history=(root/'media/navigation-history.js').read_text()
app=(root/'media/app.js').read_text()
html=f'''<!doctype html><html><head><style>{style}</style></head><body>
<div id="app"></div><script>
window.__messages=[];window.__labels=[];
window.acquireVsCodeApi=()=>({{postMessage:m=>window.__messages.push(m)}});
const oldFill=CanvasRenderingContext2D.prototype.fillText;
CanvasRenderingContext2D.prototype.fillText=function(t,...args){{window.__labels.push({{text:t,font:this.font}});return oldFill.call(this,t,...args);}};
</script><script>{helper}</script><script>{history}</script><script>{app}</script></body></html>'''
nodeA={'id':'ApexClass:Billing','name':'Billing','type':'ApexClass','sources':['main/default/classes/Billing.cls'],'file':'main/default/classes/Billing.cls'}
nodeB={'id':'CustomField:Invoice__c.Amount__c','name':'Invoice__c.Amount__c','type':'CustomField','sources':['main/default/objects/Invoice__c/fields/Amount__c.field-meta.xml']}
nodeC={'id':'Flow:InvoiceFlow','name':'InvoiceFlow','type':'Flow','sources':['main/default/flows/InvoiceFlow.flow-meta.xml']}
edgeAB={'source':nodeA['id'],'target':nodeB['id'],'relation':'READS','evidence':[{'file':'main/default/classes/Billing.cls','line':2,'rule':'TEST'}]}
edgeCA={'source':nodeC['id'],'target':nodeA['id'],'relation':'INVOKES','evidence':[{'file':'main/default/flows/InvoiceFlow.flow-meta.xml','line':2,'rule':'TEST'}]}
file='main/default/classes/Billing.cls'
base={
 'nodes':[],'edges':[],'catalog':[nodeA,nodeB,nodeC],
 'fileCatalog':[{'file':file,'count':1},{'file':'main/default/flows/InvoiceFlow.flow-meta.xml','count':1}],
 'focusIds':[], 'mode':'org','origin':'org','scope':{'kind':'base'},'sourceFolder':'force-app',
 'stats':{'nodes':3,'edges':2,'unresolved':0,'files':2,'filesParsed':2,'filesReused':0,'errors':0},
 'diagnostics':[],'unresolved':[],'coverage':{'status':'complete'},'limited':False
}
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path=os.environ.get('CHROMIUM_PATH') or '/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
 page=browser.new_page(viewport={'width':1350,'height':850})
 errors=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.set_content(html,wait_until='load')
 def send(d):
  page.evaluate('(d)=>window.dispatchEvent(new MessageEvent("message",{data:{type:"graph",data:d}}))',d)
  page.wait_for_timeout(80)
 def message():return page.evaluate('window.__messages[window.__messages.length-1]')
 send(base)
 assert page.locator('#graph-canvas').count()==1
 assert page.locator('#type-filters input').count()==3
 assert page.locator('#type-filters input:checked').count()==0
 assert page.locator('#empty-canvas-hint').is_visible()
 assert '0 nodes' in page.locator('#stage-stats').inner_text()
 assert page.locator('#history-back').is_disabled()
 assert page.locator('#show-labels').is_checked()
 # Type selection comes from entire catalog; server returns it with its edges.
 page.locator('#type-filters input[data-filter="ApexClass"]').check()
 m=message();assert m=={'type':'navigate','scope':{'kind':'types','types':['ApexClass']}},m
 typed={**base,'nodes':[nodeA,nodeB,nodeC],'edges':[edgeAB,edgeCA],'mode':'types','scope':m['scope'],'focusIds':[nodeA['id']]}
 send(typed)
 assert '3 nodes' in page.locator('#stage-stats').inner_text()
 assert page.locator('#history-back').is_enabled()
 # Search for a specific file, not just a metadata API component.
 page.locator('#file-search').fill('Billing.cls')
 assert page.locator('#file-results button').count()==1
 page.locator('#file-results button').click()
 m=message();assert m=={'type':'navigate','scope':{'kind':'file','file':file}},m
 focused={**typed,'mode':'file','scope':m['scope'],'focusIds':[nodeA['id']]}
 send(focused)
 assert 'Billing.cls' in page.locator('#history-trail').inner_text()
 # Jump to a referenced node (also tests navigation history).
 page.locator('#inspector-scroll button[data-navigate="CustomField:Invoice__c.Amount__c"]').click()
 m=message();assert m['type']=='navigate' and m['scope']['kind']=='focus' and m['scope']['id']==nodeB['id'],m
 send({**focused,'mode':'focus','scope':m['scope'],'focusIds':[nodeB['id']]})
 assert page.locator('#history-trail .trail-item').count()==4
 page.locator('#history-back').click()
 assert message()=={'type':'navigate','scope':{'kind':'file','file':file}},message()
 send(focused)
 page.locator('#history-home').click()
 assert message()=={'type':'navigate','scope':{'kind':'base'}},message()
 send(base)
 assert page.locator('#type-filters input:checked').count()==0
 assert page.locator('#empty-canvas-hint').is_visible()
 # Names toggle removes text labels but does not remove nodes.
 send(focused)
 page.evaluate('window.__labels=[]')
 page.wait_for_timeout(100)
 page.locator('#show-labels').uncheck()
 page.evaluate('window.__labels=[]')
 page.locator('#zoom-in').click()
 page.wait_for_timeout(50)
 assert not [x for x in page.evaluate('window.__labels') if x['text'] in ('Billing','Invoice__c.Amount__c')]
 assert '3 nodes' in page.locator('#stage-stats').inner_text()
 page.locator('#show-labels').check()
 page.evaluate('window.__labels=[]')
 page.locator('#zoom-in').click()
 page.wait_for_timeout(50)
 labels=page.evaluate('window.__labels')
 assert any(x['text']=='Billing' for x in labels),labels
 assert not errors,errors
 # Command started from a file must return there, not to an arbitrary org overview.
 file_page=browser.new_page(viewport={'width':1350,'height':850})
 file_errors=[]
 file_page.on('pageerror',lambda e:file_errors.append(str(e)))
 file_page.set_content(html,wait_until='load')
 start_file={**base,'nodes':[nodeA,nodeB],'edges':[edgeAB],'mode':'out','origin':'out',
    'scope':{'kind':'base'},'focusIds':[nodeA['id']],'startingFile':file}
 file_page.evaluate('(d)=>window.dispatchEvent(new MessageEvent("message",{data:{type:"graph",data:d}}))',start_file)
 assert 'Billing.cls' in file_page.locator('#history-trail').inner_text()
 file_page.locator('#inspector-scroll button[data-navigate="CustomField:Invoice__c.Amount__c"]').click()
 assert file_page.evaluate('window.__messages.at(-1).scope.kind')=='focus'
 file_page.locator('#history-home').click()
 assert file_page.evaluate('window.__messages.at(-1).scope.kind')=='base'
 file_page.evaluate('(d)=>window.dispatchEvent(new MessageEvent("message",{data:{type:"graph",data:d}}))',start_file)
 assert file_page.locator('#inspector-scroll .node-title').inner_text()=='Billing'
 assert not file_errors,file_errors
 file_page.close()
 print('WEBVIEW NAVIGATION PASS: blank org canvas, type selection, source file search, trail/back/home, label toggle, and no JS errors')
 browser.close()
