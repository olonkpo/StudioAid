(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./studio-workflow'));else root.StudioSearch=factory(root.StudioWorkflow);})(typeof globalThis!=='undefined'?globalThis:this,function(Workflow){
  'use strict';
  const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  function search(state,query,options){
    const q=normalize(query),tokens=q.split(/\s+/).filter(Boolean),limit=Math.max(1,Math.min(50,options&&options.limit||12));
    const rows=[];
    for(const p of state.projects||[]){
      if(!q&&p.arch)continue;
      rows.push({kind:'project',id:p.id,projectId:p.id,section:'ov',title:p.name,detail:[p.client,p.date,p.arch?'Archived':''].filter(Boolean).join(' · '),keywords:[p.client,p.email,p.phone,p.location,p.booking&&p.booking.stage].join(' ')});
      if(p.inv)rows.push({kind:'invoice',id:p.id,projectId:p.id,section:'inv',title:'Invoice '+p.inv,detail:[p.client||p.name,p.name].join(' · '),keywords:[p.inv,p.client,p.name].join(' ')});
    }
    for(const c of state.contacts||[])rows.push({kind:'contact',id:c.id,title:c.name,detail:c.email||c.phone||'Client',keywords:[c.email,c.phone].join(' ')});
    for(const d of state.docs||[])rows.push({kind:'document',id:d.id,documentKind:d.kind,title:d.name,detail:d.kind+' · '+d.status,keywords:d.kind});
    return rows.map((row,index)=>{
      const title=normalize(row.title),detail=normalize(row.detail+' '+row.keywords),text=title+' '+detail;
      if(tokens.some(token=>!text.includes(token)))return null;
      const score=!q?0:title===q?100:title.startsWith(q)?80:title.includes(q)?60:30;
      return {...row,score,index};
    }).filter(Boolean).sort((a,b)=>b.score-a.score||a.index-b.index).slice(0,limit).map(({keywords,score,index,...row})=>row);
  }
  function tasks(state,query,options){
    const tokens=normalize(query).split(/\s+/).filter(Boolean),limit=Math.max(1,Math.min(100,options&&options.limit||20)),rows=[];
    for(const p of state.projects||[]){
      if(p.arch||p.booking&&p.booking.stage==='canceled')continue;
      const steps=Workflow.getSteps(p,state.phases||[]);
      for(const step of steps){
        if(p.cells&&p.cells[step]==='done')continue;
        const text=normalize([step,p.name,p.client].join(' '));if(tokens.some(t=>!text.includes(t)))continue;
        rows.push({kind:'task',projectId:p.id,step,title:step,detail:p.name+(p.client?' · '+p.client:''),due:p.due&&p.due[step]||'',status:p.cells&&p.cells[step]||''});
      }
    }
    return rows.sort((a,b)=>(a.due||'9999').localeCompare(b.due||'9999')).slice(0,limit);
  }
  return{search,tasks};
});
