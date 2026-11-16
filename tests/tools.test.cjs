const test=require('node:test'),assert=require('node:assert/strict'),Tools=require('../studio-tools'),Data=require('../studio-data'),Model=require('../studio-model');
const state=()=>Data.parseBackup({projects:[],contacts:[]});
test('CSV round-trips quoted commas, newlines, BOM, unicode and spreadsheet formula escaping',()=>{
 const s=state();s.contacts=[{id:'c',name:'=HYPERLINK("bad")',email:'ama@example.com',phone:'+2331234',notes:'Accra, Ghana\n"Hello"'}];
 const csv=Tools.exportCSV(s,'contacts');assert(csv.includes("'=HYPERLINK"));const plan=Tools.previewCSV(csv,'contacts',state(),()=> 'new');assert.equal(plan.errors.length,0);assert.deepEqual(plan.contacts[0],{...s.contacts[0],id:'new'});
 assert.throws(()=>Tools.parseCSV('name\n"unclosed'),/unclosed/);assert.throws(()=>Tools.parseCSV('name\n"closed"bad'),/Unexpected/);
});
test('CSV previews validate all rows, skip duplicates and never change the studio',()=>{
 const s=state();s.projects=[{id:'old',name:'Existing',client:'Ama',date:'2026-12-01',cells:{}}];const before=JSON.stringify(s);let n=0;
 const plan=Tools.previewCSV('project_name,client_name,shoot_date,price\nExisting,Ama,2026-12-01,200\nNew,Kojo,2026-12-02,300\nNew,Kojo,2026-12-02,300\nBad,,2026-02-30,20\nBad amount,,,oops','projects',s,()=> 'p'+(++n));
 assert.equal(plan.skipped,2);assert.equal(plan.projects.length,1);assert.equal(plan.projects[0].amount,300);assert.equal(plan.errors.length,2);assert.equal(JSON.stringify(s),before);
 assert.throws(()=>Tools.previewCSV('name,name\nA,B','contacts',s,()=> 'x'),/unique/);
});
test('project exports use frozen invoice pricing and currency while JSON retains full history',()=>{
 const s=state(),p={id:'p',name:'Shoot',amount:1000,cells:{},invDisc:100,pay:[{amt:100,date:'2026-11-16'}]};Model.issueInvoice(p,{tax:10},'USD');p.amount=5000;s.projects.push(p);const plan=Tools.previewCSV(Tools.exportCSV(s,'projects'),'projects',state(),()=> 'copy');
 assert.equal(plan.errors.length,0);assert.equal(plan.projects[0].amount,1000);assert.equal(plan.projects[0].invDisc,100);assert.equal(plan.projects[0].invTax,10);assert.equal(plan.projects[0].invCurrency,'USD');
 assert.deepEqual(Data.parseBackup(Data.createBackup(s)).projects[0],p);
 for(const type of ['payments','expenses','time'])assert(Tools.exportCSV(s,type).startsWith('\uFEFF'));
});
test('reminders respect due dates, settings, completion, cancellation and sample projects',()=>{
 const s=state();s.phases=[{n:'Work',c:'#123456',s:['Edit','Delivery']}];s.projects=[{id:'p',name:'Soon',date:'2026-11-18',amount:100,cells:{Edit:'done'},due:{Edit:'2026-11-15',Delivery:'2026-11-16'},booking:{stage:'booked',depositType:'fixed',depositValue:20,depositDue:'2026-11-16',balanceDue:''}}];
 const rows=Tools.reminders(s,'2026-11-16');assert.deepEqual(rows.map(x=>x.kind),['shoot','payment','delivery']);
 for(const patch of [{arch:true},{sample:true},{booking:{...s.projects[0].booking,stage:'canceled'}}])assert.equal(Tools.reminders({...s,projects:[{...s.projects[0],...patch}]},'2026-11-16').length,0);
 s.cfg.reminders={tasks:false,payments:false,shoots:false,delivery:false,leadDays:0};assert.equal(Tools.reminders(s,'2026-11-16').length,0);assert.throws(()=>Tools.reminderSettings({leadDays:31}));
});
test('merge field aliases preserve old templates and unknown placeholders',()=>{
 assert.equal(Tools.merge('{client_name} {shoot_date} {balance_due} {client} {unknown}',{client:'Ama',date:'Dec 1',balance:'USD 100'}),'Ama Dec 1 USD 100 Ama {unknown}');
});
test('sample projects are valid and get an independent portrait timeline with no initial revenue',()=>{
 const p=Tools.sampleProject('2026-12-01','sample');assert.equal(p.amount,0);assert(p.workflow);assert.equal(p.booking.stage,'quote');assert.doesNotThrow(()=>Data.parseBackup({projects:[p]}));
 const s=state();s.cfg.onboarded=true;s.cfg.reminders={tasks:false,leadDays:3};assert.deepEqual(Data.parseBackup(Data.createBackup(s)).cfg.reminders,s.cfg.reminders);assert.throws(()=>Data.parseBackup({projects:[],cfg:{reminders:{leadDays:31}}}));
});
test('signed builds reject absent signing credentials before loading the build system',()=>{
 const {requiredCredentials}=require('../scripts/build-signed.cjs');assert.throws(()=>requiredCredentials('darwin',{}),/CSC_LINK/);assert.throws(()=>requiredCredentials('win32',{CSC_LINK:'certificate'}),/CSC_KEY_PASSWORD/);assert.doesNotThrow(()=>requiredCredentials('darwin',{CSC_LINK:'certificate',CSC_KEY_PASSWORD:'password',APPLE_ID:'account',APPLE_APP_SPECIFIC_PASSWORD:'password',APPLE_TEAM_ID:'team'}));
});
