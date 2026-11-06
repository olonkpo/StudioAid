(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.StudioModel=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const clone=value=>JSON.parse(JSON.stringify(value));
  const number=value=>Number.isFinite(Number(value))?Number(value):0;
  const cents=value=>Math.round((number(value)+Number.EPSILON)*100)/100;
  const locked=p=>!!(p.invSent&&p.invSnapshot&&p.invSnapshot.version===1);
  function invoiceView(p){return locked(p)?Object.assign({},p,clone(p.invSnapshot.data)):p;}
  function invoiceDefaults(p,defaults){return locked(p)?clone(p.invSnapshot.business):defaults;}
  function invoiceCurrency(p,fallback){return locked(p)?p.invSnapshot.currency:(p.invCurrency||fallback);}
  function calculate(project,defaults){
    const p=invoiceView(project),I=invoiceDefaults(project,defaults||{});
    const ls=p.items&&p.items.length?p.items:[{d:p.invDesc||p.pkg||p.name,price:number(p.amount),qty:1}];
    const sub=cents(ls.reduce((sum,line)=>sum+cents(number(line.price)*number(line.qty)),0));
    const disc=cents(Math.min(Math.max(number(p.invDisc),0),Math.max(sub,0)));
    const r=Math.max(0,(p.invTax!==undefined&&String(p.invTax).trim()!==''?number(p.invTax):number(I.tax)));
    const tax=cents((sub-disc)*r/100),total=cents(sub-disc+tax);
    const paid=cents((project.pay||[]).reduce((sum,x)=>sum+number(x.amt),0));
    return {ls:clone(ls),sub,disc,r,tax,total,paid,bal:cents(total-paid)};
  }
  function issueInvoice(p,defaults,currency){
    if(locked(p))return p.invSnapshot;
    const c=calculate(p,defaults),data={};
    for(const key of ['name','client','email','phone','inv','invDate','invDue','invNote','invDesc','pkg'])data[key]=p[key]||'';
    Object.assign(data,{amount:c.sub,items:c.ls,invDisc:c.disc,invTax:c.r});
    p.invSnapshot={version:1,currency:p.invCurrency||currency,business:clone(defaults),data};
    p.invSent=true;
    return p.invSnapshot;
  }
  function reviseInvoice(p){
    if(p.invSnapshot){
      (p.invHistory=p.invHistory||[]).push(clone(p.invSnapshot));
      Object.assign(p,clone(p.invSnapshot.data));p.invCurrency=p.invSnapshot.currency;
      delete p.invSnapshot;p.invRevision=(p.invRevision||0)+1;
    }
    p.invSent=false;
  }
  function syncProjectAmount(p,defaults){
    const c=calculate(p,defaults);
    // Keep an explicit pretax input before changing the project summary.
    if(!p.items||!p.items.length)p.items=clone(c.ls);
    p.amount=c.total;return c.total;
  }
  function resetLines(p,defaults){const c=calculate(p,defaults);p.amount=c.sub;delete p.items;}
  function outstanding(p,defaults){return p.invCancel?0:Math.max(0,calculate(p,defaults).bal);}
  return {calculate,invoiceView,invoiceDefaults,invoiceCurrency,issueInvoice,reviseInvoice,syncProjectAmount,resetLines,outstanding,isIssued:locked};
});
