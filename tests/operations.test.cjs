const test=require('node:test'),assert=require('node:assert/strict');
const Ops=require('../studio-operations'),Model=require('../studio-model'),Workflow=require('../studio-workflow');
const project=(id,date='2026-12-01',time='10:00')=>({id,name:'Job '+id,date,time,amount:1000,cells:{}});
test('schedule configuration is complete and atomic; intervals include setup/travel across midnight',()=>{
 const p=project('a','2026-12-31','23:30');Ops.configureSchedule(p,{durationMinutes:90,setupMinutes:30,travelMinutes:20});
 assert.deepEqual(Ops.interval(p),{start:'2026-12-31T23:00',end:'2027-01-01T01:20',startMinutes:Date.parse('2026-12-31T23:00Z')/60000,endMinutes:Date.parse('2027-01-01T01:20Z')/60000,durationMinutes:90});
 const original=structuredClone(p);for(const patch of [{durationMinutes:0},{setupMinutes:-1},{travelMinutes:0.5},{durationMinutes:10081},{foo:1}]){assert.throws(()=>Ops.configureSchedule(p,patch));assert.deepEqual(p,original);}
});
test('conflicts include buffers, exclude touching endpoints/self/archives/cancellations, and sort by start',()=>{
 const a=project('a');Ops.configureSchedule(a,{durationMinutes:60,setupMinutes:15,travelMinutes:30});
 const before=project('before','2026-12-01','08:00');Ops.configureSchedule(before,{durationMinutes:105});
 const overlap=project('overlap','2026-12-01','11:15');Ops.configureSchedule(overlap,{durationMinutes:30});
 const touching=project('touching','2026-12-01','11:30');Ops.configureSchedule(touching,{durationMinutes:30});
 const canceled={...project('canceled'),booking:{stage:'canceled'}},archived={...project('archived'),arch:true};
 const all=[a,before,overlap,touching,canceled,archived,project('no-time','2026-12-01','')];
 assert.deepEqual(Ops.conflicts(a,all).map(x=>x.projectId),['overlap']);
 assert.equal(Ops.conflicts(canceled,all).length,0);assert.equal(Ops.conflicts(archived,all).length,0);
});
test('cross-midnight conflicts compare calendar dates and malformed own dates are rejected',()=>{
 const a=project('night','2026-12-31','23:30'),b=project('morning','2027-01-01','00:30');Ops.configureSchedule(a,{durationMinutes:120});Ops.configureSchedule(b,{durationMinutes:30});assert.equal(Ops.conflicts(a,[a,b]).length,1);
 assert.equal(Ops.interval({...a,time:''}),null);assert.throws(()=>Ops.interval({...a,date:'2026-02-30'}));assert.throws(()=>Ops.interval({...a,time:'25:00'}));
});
test('delivery stages track client waiting/overdue and reject invalid patches without mutation',()=>{
 const p=project('a');Ops.configureDelivery(p,{stage:'gallery_sent',gallerySentAt:'2026-11-01',selectionsDue:'2026-11-05'});const summary=Ops.deliverySummary(p,'2026-11-06');assert.equal(summary.awaitingClient,true);assert.equal(summary.overdue,true);
 const original=structuredClone(p);for(const patch of [{stage:'invented'},{approvedAt:'2026-02-30'},{revisions:3}]){assert.throws(()=>Ops.configureDelivery(p,patch));assert.deepEqual(p,original);}
 Ops.configureDelivery(p,{stage:'approved',approvedAt:'2026-11-06'});assert.equal(Ops.deliverySummary(p,'2026-11-10').overdue,false);
});
test('expenses and editing time produce tax-exclusive estimated profit without combining currencies',()=>{
 const p=project('a');p.pay=[{amt:800}];
 Ops.addExpense(p,{id:'e1',date:'2026-11-06',category:'Travel',description:'Transport',amount:100,currency:'GHS'});
 Ops.addExpense(p,{id:'e2',date:'2026-11-06',category:'Rental',description:'Lens',amount:20,currency:'USD'});
 Ops.addTime(p,{id:'t1',date:'2026-11-06',description:'Editing',minutes:90,rate:40,currency:'GHS'});
 const report=Ops.profitability(p,{tax:10},'GHS');assert.equal(report.revenue,1000);assert.equal(report.invoiceTotal,1100);assert.equal(report.tax,100);assert.equal(report.received,800);assert.equal(report.monetaryCosts,100);assert.equal(report.timeCost,60);assert.equal(report.estimatedProfit,840);assert.equal(report.cashNet,700);assert.equal(report.hasOtherCurrencies,true);assert.equal(report.groups.find(g=>g.currency==='USD').monetaryCosts,20);assert.equal(report.groups.find(g=>g.currency==='USD').revenue,0);
});
test('cost records validate atomically and the financial report uses frozen invoice currency and rates',()=>{
 const p=project('a');Model.issueInvoice(p,{tax:10},'GHS');Ops.addExpense(p,{id:'e',date:'2026-11-06',category:'Other',description:'Cost',amount:'12.345',currency:'GHS'});assert.equal(p.expenses[0].amount,12.35);
 const before=structuredClone(p);assert.throws(()=>Ops.addExpense(p,{id:'e',date:'2026-11-06',amount:2,currency:'GHS'}));assert.throws(()=>Ops.addTime(p,{id:'t',date:'2026-11-06',minutes:0,rate:10,currency:'GHS'}));assert.deepEqual(p,before);
 const report=Ops.profitability(p,{tax:30},'USD');assert.equal(report.currency,'GHS');assert.equal(report.invoiceTotal,1100);
});
test('duplicating a project resets work and financial/client-response history but rebuilds automatic dates',()=>{
 const p={...project('old'),client:'Ama',email:'ama@example.com',cid:'contact',brief:'Portrait brief',notes:'private old notes',pkg:'Portrait',shots:[{t:'Family',d:true}],gear:[{t:'Camera',d:true}],pay:[{amt:300}],expenses:[{id:'old'}],timeEntries:[{id:'old'}],log:[{k:'Payment'}],link:'https://old-gallery.example',delivery:{stage:'delivered'},clientOffer:{id:'offer'},clientResponses:[{id:'response'}],messageDrafts:{draft:{body:'private'}},booking:{stage:'completed',depositType:'percent',depositValue:30,depositDue:'2026-11-01',balanceDue:'2026-12-01'}};
 Workflow.applyPreset(p,'portrait','2026-12-01');p.cells.Delivery='done';Workflow.setDue(p,'Delivery','2026-12-20');Model.issueInvoice(p,{tax:10},'GHS');
 const before=structuredClone(p),copy=Ops.duplicateProject(p,{id:'new',name:'Next portrait',date:'2027-01-10'});
 assert.equal(copy.client,'Ama');assert.deepEqual(copy.cells,{});assert.deepEqual(copy.shots,[{t:'Family',d:false}]);assert.deepEqual(copy.gear,[{t:'Camera',d:false}]);assert.equal(copy.due.Delivery,'2027-01-20');assert.deepEqual(copy.workflow.manualDates,{});assert.equal(copy.booking.stage,'enquiry');assert.equal(copy.booking.depositDue,'');
 for(const key of ['notes','link','pay','inv','invSnapshot','invHistory','expenses','timeEntries','log','delivery','clientOffer','clientResponses','messageDrafts'])assert.equal(copy[key],undefined,key);
 assert.deepEqual(p,before);copy.workflow.phases[0].s.push('Changed');assert.notDeepEqual(copy.workflow.phases,p.workflow.phases);
});
test('duplicate optional client removal and invalid options leave original data untouched',()=>{
 const p={...project('old'),client:'Client',phone:'0240000000'};const copy=Ops.duplicateProject(p,{id:'new',name:'New',date:'',copyClient:false});assert.equal(copy.client,undefined);assert.equal(copy.phone,undefined);
 assert.throws(()=>Ops.duplicateProject(p,{id:'old',name:'New',date:''}));assert.throws(()=>Ops.duplicateProject(p,{id:'new',name:'',date:''}));assert.throws(()=>Ops.duplicateProject(p,{id:'new',name:'New',date:'2026-02-30'}));assert.equal(p.client,'Client');
});
test('duplicate preserves effective prices, currency, discounts and tax while resetting invoice identity',()=>{
 const p={...project('old'),invCurrency:'USD',invDisc:100,invTax:10,inv:'INV-OLD'};
 Model.issueInvoice(p,{tax:5},'GHS');p.invTax=20;p.invDisc=0;p.invCurrency='EUR';
 const copy=Ops.duplicateProject(p,{id:'copy',name:'Next shoot',date:'',invoiceDefaults:{tax:30},currency:'GHS'});
 assert.equal(Model.invoiceCurrency(copy,'GHS'),'USD');assert.equal(Model.calculate(copy,{tax:30}).total,990);
 assert.equal(copy.inv,undefined);assert.equal(copy.invSnapshot,undefined);assert.equal(copy.invSent,undefined);
 const draft=Ops.duplicateProject(project('draft'),{id:'next',name:'Next',invoiceDefaults:{tax:15},currency:'GHS'});
 assert.equal(draft.invTax,15);assert.equal(draft.invCurrency,'GHS');assert.equal(Model.calculate(draft,{tax:0}).total,1150);
});
test('message drafts are isolated by template, survive JSON storage, and clear explicitly',()=>{
 const p=project('a');Ops.saveDraft(p,'Reminder','Subject','Custom message','2026-11-06T12:00:00Z');Ops.saveDraft(p,'Delivery','Gallery','Another message','2026-11-06T13:00:00Z');
 const loaded=JSON.parse(JSON.stringify(p));const draft=Ops.getDraft(loaded,'Reminder');assert.equal(draft.body,'Custom message');draft.body='external change';assert.equal(Ops.getDraft(loaded,'Reminder').body,'Custom message');assert.equal(Ops.clearDraft(loaded,'Reminder'),true);assert.equal(Ops.getDraft(loaded,'Reminder'),null);assert.equal(Ops.getDraft(loaded,'Delivery').subject,'Gallery');
 const old=structuredClone(p);assert.throws(()=>Ops.saveDraft(p,'__proto__','x','x'));assert.throws(()=>Ops.saveDraft(p,'Reminder','x','x','bad date'));assert.deepEqual(p,old);
});
test('client offers whitelist intended details, freeze issued quote data and include payment requirements',()=>{
 const p={...project('a'),client:'Client',email:'client@example.com',phone:'0240000000',location:'Accra',brief:'Private brief',notes:'Private notes',pay:[{amt:300}],expenses:[{description:'Private cost'}],booking:{stage:'quote',depositType:'percent',depositValue:30,depositDue:'2026-11-15',balanceDue:'2026-12-01',installments:[{id:'one',label:'Second payment',amount:400,due:'2026-11-25'}]}};
 Model.issueInvoice(p,{biz:'Old business',tax:10,pay:'Mobile money'},'GHS');p.amount=3000;
 const offer=Ops.createOffer(p,{biz:'New business',tax:20},'USD',{id:'offer',createdAt:'2026-11-06T12:00:00Z',expiresAt:'2026-12-06'});
 assert.equal(offer.business.name,'Old business');assert.equal(offer.quote.currency,'GHS');assert.equal(offer.quote.total,1100);assert.equal(offer.quote.deposit.required,330);assert.equal(offer.quote.installments[0].amount,400);assert.equal(offer.client.email,'client@example.com');assert.equal(offer.expiresAt,'2026-12-06T23:59:59.999Z');
 const serialized=JSON.stringify(offer);for(const privateText of ['Private brief','Private notes','Private cost'])assert(!serialized.includes(privateText));for(const key of ['pay','expenses','notes','brief','messageDrafts'])assert.equal(offer[key],undefined);
});
test('invalid offer identity or expiration is rejected without modifying project',()=>{
 const p=project('a'),old=structuredClone(p);assert.throws(()=>Ops.createOffer(p,{tax:0},'GHS',{id:'',createdAt:'2026-11-06T12:00:00Z'}));assert.throws(()=>Ops.createOffer(p,{tax:0},'GHS',{id:'offer',createdAt:'2026-11-06T12:00:00Z',expiresAt:'2026-11-05'}));assert.deepEqual(p,old);
});

test('canceled bookings and invoices cannot create a fresh client offer',()=>{const p=project('a');assert.throws(()=>Ops.createOffer({...p,booking:{stage:'canceled'}},{tax:0},'GHS',{id:'offer'}),/canceled/);assert.throws(()=>Ops.createOffer({...p,invCancel:true},{tax:0},'GHS',{id:'offer'}),/canceled/);});
