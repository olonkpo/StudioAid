const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const Data=require('../studio-data'),Model=require('../studio-model');
const html=fs.readFileSync(require('node:path').join(__dirname,'..','index.html'),'utf8');
const source=html.match(/<script>([\s\S]*?)<\/script>/)[1];
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve}};
function harness(native){
 const nodes={settingsSaved:{},saveStatus:{hidden:true},saveStatusText:{},retrySave:{},studio:{hidden:true}};
 const context={Promise,JSON,Error,StudioData:Data,StudioModel:Model,NAT:native,S:Data.parseBackup({projects:[]}),document:{getElementById:id=>nodes[id]},localStorage:{setItem(){}},startupError:'',render(){},renderSet(){},renderStudio(){},freezeExistingInvoices(){},cId:null,docId:null,CL:{msg:''},$:id=>nodes[id]};
 vm.createContext(context);
 vm.runInContext(source.slice(source.indexOf('let saveQueue='),source.indexOf('const $=id=>'))+source.slice(source.indexOf('async function applyRestoredState('),source.indexOf('function cloudClick('))+`;globalThis.api={save,applyRestoredState,applyCloud,revision:()=>savedRevision,pending:()=>pendingSaves};`,context);
 return{context,nodes,api:context.api};
}
test('renderer waits for acknowledgement and serializes saves in edit order',async()=>{
 const gates=[deferred(),deferred()],calls=[];const h=harness({revision:()=>0,save:json=>{calls.push(JSON.parse(json));return gates[calls.length-1].promise}});
 h.context.S.cfg.me='First';const one=h.api.save();h.context.S.cfg.me='Second';const two=h.api.save();
 assert.equal(h.nodes.settingsSaved.textContent,'Saving…');await Promise.resolve();assert.equal(calls.length,1);
 gates[0].resolve({ok:true,revision:1});await one;assert.equal(h.nodes.settingsSaved.textContent,'Saving…');await Promise.resolve();assert.equal(calls.length,2);
 gates[1].resolve({ok:true,revision:2});await two;assert.equal(calls[0].cfg.me,'First');assert.equal(calls[1].cfg.me,'Second');assert.equal(h.api.revision(),2);assert.equal(h.nodes.settingsSaved.textContent,'Saved on this computer');
});
test('renderer exposes a failed save and permits a successful retry',async()=>{
 let fail=true;const h=harness({revision:()=>0,save:async()=>fail?{ok:false,error:'disk full'}:{ok:true,revision:1}});
 await h.api.save();assert.equal(h.nodes.settingsSaved.textContent,'Could not save');assert.equal(h.nodes.saveStatus.hidden,false);assert.match(h.nodes.saveStatusText.textContent,/disk full/);assert.equal(h.api.revision(),0);
 fail=false;await h.api.save();assert.equal(h.nodes.saveStatus.hidden,true);assert.equal(h.api.revision(),1);
});
test('renderer rejects malformed restore before persistence or state mutation',async()=>{
 let restores=0;const h=harness({revision:()=>0,save:async()=>({ok:true,revision:1}),restore:async()=>{restores++}});
 h.context.S.projects.push({id:'keep',name:'Keep',cells:{}});
 await assert.rejects(h.api.applyRestoredState('{"projects":[null]}'),/Invalid StudioAid backup/);
 assert.equal(restores,0);assert.equal(h.context.S.projects[0].name,'Keep');
});
test('cloud candidates cannot replace renderer changes waiting to be saved',async()=>{
 const gate=deferred();let conflicts=0,restores=0;const h=harness({revision:()=>0,save:()=>gate.promise,cloudConflict:async()=>{conflicts++},restore:async()=>{restores++}});
 const saving=h.api.save();await Promise.resolve();assert.equal(await h.api.applyCloud({json:'{"projects":[]}',revision:0},true),false);assert.equal(conflicts,1);assert.equal(restores,0);gate.resolve({ok:true,revision:1});await saving;
});
test('money summaries keep issued and new invoice currencies separate',()=>{
 const p={id:'one',name:'GHS job',amount:1000},q={id:'two',name:'USD job',amount:2000};Model.issueInvoice(p,{tax:10},'GHS');
 const context={StudioModel:Model,S:{cfg:{cur:'USD'}},INV:()=>({tax:10})};vm.createContext(context);
 vm.runInContext(source.slice(source.indexOf('const formatMoney='),source.indexOf('function calc('))+`globalThis.summary=currencySummary;globalThis.calculate=p=>StudioModel.calculate(p,INV()).total;`,context);
 const result=context.summary([p,q],context.calculate);assert.match(result,/GHS 1,100\.00/);assert.match(result,/USD 2,200\.00/);assert.doesNotMatch(result,/3,300/);
});
test('deleting a linked contact preserves project history without recreating the contact',()=>{
 const state={projects:[{id:'p',name:'Job',client:'Client',email:'client@example.com',cid:'c',cells:{}}],contacts:[{id:'c',name:'Client'}]};
 const context={S:state,cId:'c',docId:null,curP:()=>null,save(){},renderStudio(){},uid:()=> 'generated'};vm.createContext(context);
 vm.runInContext(source.slice(source.indexOf('function ensureContacts()'),source.indexOf('const contactSel='))+source.slice(source.indexOf('function wsClick('),source.indexOf('function wsField('))+`;globalThis.removeContact=()=>wsClick({target:{closest:()=>({dataset:{w:'cdel'}})}});globalThis.regenerate=ensureContacts;`,context);
 context.removeContact();context.regenerate();assert.equal(state.contacts.length,0);assert.equal(state.projects[0].client,'Client');assert.equal(state.projects[0].email,'client@example.com');assert.equal(state.projects[0].cid,undefined);
});
test('floating workload badge excludes archived projects',()=>{
 const nodes={bar:{style:{setProperty(){}}},bubble:{style:{setProperty(){}}}};
 const context={S:{projects:[{cells:{},arch:true},{cells:{one:'done'}}]},APP_LOGO:'logo',cols:()=>['one','two'],$:id=>nodes[id]};vm.createContext(context);
 vm.runInContext(source.slice(source.indexOf('function renderBar(){'),source.indexOf('function render(){')),context);context.renderBar();assert.match(nodes.bubble.innerHTML,/<small>1<\/small>/);
});
