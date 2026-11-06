const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Workflow=require('../studio-workflow'),Booking=require('../studio-booking'),Model=require('../studio-model');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8'),source=html.match(/<script>([\s\S]*?)<\/script>/)[1];
const extract=(start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));
const phases=[{n:'Booked',c:'#123456',s:['Confirm Booking','Send Reminder']},{n:'Processing',c:'#654321',s:['Meeting','Event','Delivery']}];
const key=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
class FixedDate extends Date{constructor(...args){super(...(args.length?args:['2026-11-06T12:00:00Z']))}}
test('mixed legacy and preset board groups are nonempty and every step appears once',()=>{
 const preset={id:'preset',name:'Portrait',date:'2026-12-01',cells:{}};Workflow.applyPreset(preset,'portrait');const legacy={id:'legacy',name:'Legacy',cells:{}};
 const context={projectPhases:p=>Workflow.getPhases(p,phases)};vm.createContext(context);vm.runInContext(extract('function boardPhases(','const activeWork='),context);
 for(const projects of [[preset,legacy],[legacy,preset]]){const groups=context.boardPhases(projects),steps=groups.flatMap(g=>g.s);assert(groups.every(g=>g.s.length>0));assert.equal(new Set(steps).size,steps.length);assert(steps.includes('Photograph Session'));assert(steps.includes('Meeting'));}
});
test('calendar and due notifications consistently omit canceled and archived work',()=>{
 const nodes={cal:{}},notifications=[];const projects=[{id:'a',name:'Active job',date:'2026-11-06',cells:{},due:{Delivery:'2026-11-06'}},{id:'c',name:'Canceled job',date:'2026-11-06',cells:{},due:{Delivery:'2026-11-06'},booking:{stage:'canceled'}},{id:'old',name:'Archived job',arch:true,date:'2026-11-06',cells:{},due:{Delivery:'2026-11-06'}}];
 const context={Date:FixedDate,S:{projects},view:new FixedDate(2026,10,1),key,cols:p=>Workflow.getSteps(p,phases),esc:x=>x,stat:()=> '--mute',$:id=>nodes[id],NAT:{notify:(...x)=>notifications.push(x)},save(){}};
 vm.createContext(context);vm.runInContext(extract('const activeWork=','const bookingSummary=')+extract('function renderCal(){','function renderBar(){')+extract('function notifyDue(){','if(NAT){document.documentElement'),context);context.renderCal();context.notifyDue();assert(nodes.cal.innerHTML.includes('Active job'));assert(!nodes.cal.innerHTML.includes('Canceled job'));assert(!nodes.cal.innerHTML.includes('Archived job'));assert.equal(notifications.length,1);assert.match(notifications[0][1],/^1 step due/);
});
test('canceled deposit plans do not say the deposit was received',()=>{
 const p={name:'Canceled',amount:1000,cells:{}};Booking.configure(p,{stage:'canceled',depositValue:30});const context={bookingSummary:p=>Booking.summary(p,{tax:0},'2026-11-06'),esc:x=>String(x),invoiceMoney:(p,n)=>'GHS '+n,stageOptions:()=>'',fmt:x=>x};
 vm.createContext(context);vm.runInContext(extract('function bookingStrip(','function paymentPlan(')+extract('function paymentPlanAmounts(','function changeBooking('),context);const result=context.bookingStrip(p)+context.paymentPlanAmounts(p);assert.match(result,/canceled/);assert.match(result,/collection (is )?paused/);assert.doesNotMatch(result,/Deposit received/);
});
