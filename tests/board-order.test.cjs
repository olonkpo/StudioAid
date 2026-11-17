const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),Tools=require('../studio-tools'),Data=require('../studio-data');
const job=id=>({id,name:'Project '+id,cells:{Delivery:'started'},date:'2026-12-01',pay:[{amt:100,date:'2026-11-17'}]});
test('priority moves projects above or below targets without modifying project content',()=>{
 const list=['a','b','c','d'].map(job),before=JSON.stringify(list),ids=list.map(p=>p.id);
 assert.deepEqual(Tools.prioritizeProjects(list,ids,'d','b').map(p=>p.id),['a','d','b','c']);
 const down=Tools.prioritizeProjects(list,ids,'a','c',true);assert.deepEqual(down.map(p=>p.id),['b','c','a','d']);assert.equal(down[2],list[0]);assert.equal(JSON.stringify(list),before);
 assert.equal(Tools.prioritizeProjects(list,ids,'b','b'),list);assert.equal(Tools.prioritizeProjects(list,ids,'missing','b'),list);assert.equal(Tools.prioritizeProjects(list,ids,'a','b'),list);
});
test('filtered priority keeps hidden slots fixed and respects displayed name/date order',()=>{
 const list=['z','hidden','a','b'].map(job);list[1].arch=true;
 const moved=Tools.prioritizeProjects(list,['a','b','z'],'z','a');assert.deepEqual(moved.map(p=>p.id),['z','hidden','a','b']);
 const next=Tools.prioritizeProjects(list,['a','b','z'],'b','a');assert.deepEqual(next.map(p=>p.id),['b','hidden','a','z']);assert.equal(next[1],list[1]);
 assert.equal(Tools.prioritizeProjects(list,['a','a'],'a','z'),list);
});
test('mixed numeric/string project identities reorder safely and survive backup and restore',()=>{
 const list=[job(1),job('two'),job('3')],next=Tools.prioritizeProjects(list,['1','two','3'],'3','1');
 const saved=Data.parseBackup(Data.createBackup({projects:next}));assert.deepEqual(saved.projects.map(p=>p.id),['3',1,'two']);assert.deepEqual(saved.projects[0].pay,list[2].pay);
});
test('board move switches to priority, saves once and rejects a stale filtered drag',()=>{
 const html=fs.readFileSync(require('node:path').join(__dirname,'..','index.html'),'utf8'),source=html.match(/<script>([\s\S]*?)<\/script>/)[1],nodes={sf:{},boardOrderStatus:{}};
 const context={S:{projects:['a','b','c'].map(job),sf:'name'},StudioTools:Tools,$:id=>nodes[id],vis(){return context.S.projects},saves:0,save(){context.saves++},render(){}};
 vm.createContext(context);vm.runInContext(source.slice(source.indexOf('function moveBoardProject('),source.indexOf("$('board').ondragstart=")),context);
 assert.equal(context.moveBoardProject('c','a',false,['a','b']),false);assert.equal(context.saves,0);
 assert.equal(context.moveBoardProject('c','a',false,['a','b','c']),true);assert.equal(context.S.sf,'add');assert.equal(nodes.sf.value,'add');assert.equal(context.saves,1);assert.match(nodes.boardOrderStatus.textContent,/priority 1 of 3/);
});
