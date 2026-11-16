(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./studio-data'),require('./studio-model'),require('./studio-workflow'),require('./studio-booking'));else root.StudioTools=factory(root.StudioData,root.StudioModel,root.StudioWorkflow,root.StudioBooking);})(typeof globalThis!=='undefined'?globalThis:this,function(Data,Model,Workflow,Booking){
 'use strict';
 const columns={projects:['name','client','email','phone','date','time','location','package','amount','currency','discount','tax'],contacts:['name','email','phone','notes'],payments:['project','client','date','amount','currency','note'],expenses:['project','date','category','description','amount','currency'],time:['project','date','description','minutes','hourly_rate','currency']};
 const defaults={tasks:true,payments:true,shoots:true,delivery:true,leadDays:2};
 const formula=s=>/^[\s]*[=+\-@]/.test(s);
 function csvCell(value){let s=String(value??'');if(typeof value!=='number'&&formula(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';}
 function parseCSV(input){
  if(typeof input!=='string'||input.length>2e6)throw Error('Choose a CSV file smaller than 2 MB.');
  const text=input.replace(/^\uFEFF/,''),rows=[];let row=[],cell='',quoted=false,closed=false;
  const field=()=>{row.push(cell);cell='';closed=false;};const line=()=>{field();if(row.some(x=>x!==''))rows.push(row);row=[];if(rows.length>10001)throw Error('Import at most 10,000 rows at a time.');};
  for(let i=0;i<text.length;i++){const c=text[i];if(quoted){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else cell+=c;continue;}
   if(c===','){field();continue;}if(c==='\r'||c==='\n'){if(c==='\r'&&text[i+1]==='\n')i++;line();continue;}
   if(closed)throw Error('Unexpected text after a quoted CSV field.');if(c==='"'){if(cell)throw Error('A CSV quote must start a field.');quoted=true;}else cell+=c;
  }
  if(quoted)throw Error('A CSV field has an unclosed quote.');if(cell||row.length||closed)line();return rows;
 }
 function exportCSV(state,type){
  if(!columns[type])throw Error('Choose an export type.');const rows=[];
  if(type==='contacts')for(const c of state.contacts||[])rows.push(columns.contacts.map(k=>c[k]||''));
  else for(const p of state.projects||[]){const v=Model.invoiceView(p),c=Model.calculate(p,state.cfg&&state.cfg.inv||{}),cur=Model.invoiceCurrency(p,state.cfg&&state.cfg.cur||'GHS');
   if(type==='projects')rows.push([p.name,p.client,p.email,p.phone,p.date,p.time,p.location,p.pkg,c.sub,cur,c.disc,c.r]);
   if(type==='payments')for(const x of p.pay||[])rows.push([p.name,p.client,x.date,Number(x.amt),cur,x.note]);
   if(type==='expenses')for(const x of p.expenses||[])rows.push([p.name,x.date,x.category,x.description,Number(x.amount),x.currency]);
   if(type==='time')for(const x of p.timeEntries||[])rows.push([p.name,x.date,x.description,Number(x.minutes),Number(x.rate),x.currency]);
  }
  return '\uFEFF'+[columns[type],...rows].map(row=>row.map(csvCell).join(',')).join('\r\n');
 }
 function previewCSV(input,type,state,newId){
  if(!['projects','contacts'].includes(type))throw Error('Import projects or clients.');const rows=parseCSV(input);if(!rows.length)throw Error('The file is empty.');
  const aliases={project_name:'name',client_name:type==='contacts'?'name':'client',shoot_date:'date',price:'amount',package_name:'package'};
  const headers=rows.shift().map(x=>{const k=x.trim().toLowerCase().replace(/ /g,'_');return aliases[k]||k;});
  if(!headers.includes('name')||new Set(headers).size!==headers.length)throw Error('Include one name column and use unique column headings.');
  const result={projects:[],contacts:[],errors:[],skipped:0},seen=new Set((state[type]||[]).map(p=>identity(p,type)));
  function identity(p,t){return (t==='contacts'?[p.name,p.email]:[p.name,p.client,p.date]).map(x=>String(x||'').trim().toLowerCase()).join('\u0000');}
  rows.forEach((row,index)=>{try{
   if(row.length!==headers.length)throw Error('The number of fields does not match the headings.');const v={};headers.forEach((k,i)=>{const raw=row[i];v[k]=raw.startsWith("'")&&formula(raw.slice(1))?raw.slice(1):raw;});
   if(!v.name.trim())throw Error('Name is required.');const p={id:newId(),name:v.name.trim()};
   if(type==='contacts')Object.assign(p,{email:v.email||'',phone:v.phone||'',notes:v.notes||''});
   else{const amount=v.amount?Number(v.amount):0,discount=v.discount?Number(v.discount):0,tax=v.tax?Number(v.tax):0;if(![amount,discount,tax].every(n=>Number.isFinite(n)&&n>=0))throw Error('Amount, discount and tax must be nonnegative numbers without currency symbols.');if(v.time&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(v.time))throw Error('Use HH:mm for time.');Object.assign(p,{client:v.client||'',email:v.email||'',phone:v.phone||'',date:v.date||'',time:v.time||'',location:v.location||'',pkg:v.package||'',amount,invDisc:discount,invTax:tax,invCurrency:v.currency||state.cfg&&state.cfg.cur||'GHS',cells:{}});}
   Data.parseBackup({projects:type==='projects'?[p]:[],contacts:type==='contacts'?[p]:[]});const signature=identity(p,type);if(seen.has(signature)){result.skipped++;return;}seen.add(signature);result[type].push(p);
  }catch(error){result.errors.push({row:index+2,message:error.message});}});
  return result;
 }
 function reminderSettings(value){const out={...defaults,...value};for(const k of ['tasks','payments','shoots','delivery'])if(typeof out[k]!=='boolean')throw Error('Reminder switches must be on or off.');if(!Number.isInteger(out.leadDays)||out.leadDays<0||out.leadDays>30)throw Error('Choose 0–30 days before a shoot.');return out;}
 function reminders(state,today){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(today)||new Date(today+'T00:00:00Z').toISOString().slice(0,10)!==today)throw Error('Invalid reminder date.');
  const cfg=reminderSettings(state.cfg&&state.cfg.reminders),end=new Date(Date.parse(today+'T00:00:00Z')+cfg.leadDays*864e5).toISOString().slice(0,10),rows=[];
  for(const p of state.projects||[]){if(p.arch||p.sample||p.booking&&p.booking.stage==='canceled')continue;const add=(kind,label,section)=>rows.push({projectId:p.id,project:p.name,kind,label,section});
   if(cfg.shoots&&p.date>=today&&p.date<=end)add('shoot','Shoot '+p.date,'cs');
   if(cfg.payments){const b=Booking.summary(p,state.cfg&&state.cfg.inv||{},today);if(b.nextAmount>0&&b.nextDue&&b.nextDue<=today)add('payment','Payment due '+b.nextDue,'pay');}
   const steps=Workflow.getSteps(p,state.phases||[]);for(const step of steps){if(p.cells&&p.cells[step]==='done'||!p.due||!p.due[step]||p.due[step]>today)continue;const delivery=/deliver|gallery/i.test(step);if(delivery?cfg.delivery:cfg.tasks)add(delivery?'delivery':'task',step+' · '+p.due[step],'wf');}
   if(cfg.delivery&&p.delivery&&p.delivery.stage==='gallery_sent'&&p.delivery.selectionsDue&&p.delivery.selectionsDue<today)add('delivery','Client selections overdue','dl');
  }return rows;
 }
 function merge(template,values){const v={...values,client_name:values.client,shoot_date:values.date,balance_due:values.balance,project_name:values.project,studio_name:values.me};return template.replace(/\{(\w+)\}/g,(raw,k)=>v[k]===undefined?raw:String(v[k]));}
 function sampleProject(today,id){const p={id,name:'Sample portrait shoot',client:'Sample client',date:today,time:'10:00',amount:0,cells:{},brief:'Practice project: try the timeline, invoice and messages. Set a price in Payments to practice a quote. Delete this project when ready.',sample:true};Workflow.applyPreset(p,'portrait',today);Booking.configure(p,{stage:'quote',depositValue:30});return p;}
 return{parseCSV,exportCSV,previewCSV,reminderSettings,reminders,merge,sampleProject};
});
