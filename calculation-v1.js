(function(root){
'use strict';
/* Single calculation graph. No financial values are persisted by this module.
   Inputs: immutable snapshot from Supabase, prices, B3 positions and audited transactions.
   Outputs: individual assets, owners, classes, family, scoped results and explicit checks. */
const E=root.MoneyTrackerEngine;
if(!E)throw Error('Motor de cálculo do MoneyTracker indisponível');
const cache=new WeakMap();
const round=n=>Math.round(((Number(n)||0)+Number.EPSILON)*100)/100;
const amount=n=>Number.isFinite(Number(n))?Number(n):0;
const ownerName=o=>o==='spouse'?'spouse':o==='me'?'me':'family';
const owners=o=>o==='family'?['me','spouse']:[ownerName(o)];
function classLabel(code,raw){
 const value=String(raw||'');
 if(value==='Renda fixa')return 'Renda fixa';
 if(/tesouro/i.test(value)||/^Tesouro /i.test(code))return 'Tesouro';
 if(value==='ETF'||value==='ETFs')return 'ETFs';
 if(value==='FII'||value==='FIIs')return 'FIIs';
 if(value==='Ações / BDRs'||value==='Ações')return 'Ações';
 const kind=E.classify(code,value);
 return kind==='ETF'?'ETFs':kind==='FII'?'FIIs':kind==='Ações / BDRs'?'Ações':kind==='Tesouro'?'Tesouro':kind==='Fundos'?'Fundos':'Outros';
}
function basis(holding,state,ledger,positions){
 const h=holding,code=E.codeOf(h.code);
 if(h.fixedIncome)return{cost:round(h.value),verified:false,nominal:true,reason:'Saldo nominal sem juros conhecidos'};
 if(classLabel(h.code,h.group)==='Tesouro'){
  if(Number.isFinite(Number(h.applied))&&Number(h.applied)>0)return{cost:round(h.applied),verified:true,nominal:false};
  return{cost:null,verified:false,nominal:false,reason:'Valor aplicado ausente na posição B3'};
 }
 if(!['position','quote'].includes(h.origin))return{cost:null,verified:false,nominal:false,reason:'Valor de mercado não confirmado'};
 const all=positions||[h];
 const qty=all.filter(x=>x.owner===h.owner&&E.codeOf(x.code)===code).reduce((s,x)=>s+amount(x.qty),0);
 if(qty<=0)return{cost:null,verified:false,nominal:false,reason:'Quantidade inválida'};
 const tolerance=Math.max(0.00001,0.002*qty);
 const current=ledger.stocks.get(h.owner+'|'+code);
 if(current&&!current.uncertain&&current.qty>0&&Math.abs(current.qty-qty)<=tolerance){
  return{cost:amount(current.cost)*amount(h.qty)/qty,verified:true,nominal:false,source:'livro de compras'};
 }
 const ref=state.reconciliation?.positionBasis?.[code];
 if(ref&&ref.owner===h.owner&&amount(ref.unitCost)>0&&Math.abs(amount(ref.qty)-qty)<=tolerance){
  return{cost:amount(ref.unitCost)*amount(h.qty),verified:true,nominal:false,source:'custo conciliado'};
 }
 return{cost:null,verified:false,nominal:false,reason:'Custo ou quantidade ainda não conciliado'};
}
function openGain(holdings,state,ledger,positions){
 let gain=0,cost=0,matched=0,missing=0,incomePending=0,nominalValue=0;
 for(const h of holdings){
  const b=basis(h,state,ledger,positions||holdings);
  if(b.nominal){incomePending++;nominalValue+=amount(h.value);continue;}
  if(!b.verified){missing++;continue;}
  matched++;cost+=amount(b.cost);gain+=amount(h.value)-amount(b.cost);
 }
 return{gain:round(gain),cost:round(cost),matched,missing,incomePending,nominalValue:round(nominalValue),complete:missing===0&&incomePending===0};
}
function sourceTotals(holdings){
 const values={b3:0,quotes:0,bank:0,estimated:0};
 for(const h of holdings){
  if(h.fixedIncome){values.bank+=amount(h.value);continue;}
  if(h.origin==='quote'){
   const orig=Number.isFinite(Number(h.snapshotValue))?Number(h.snapshotValue):amount(h.value);
   values.b3+=orig;values.quotes+=amount(h.value)-orig;
  }else if(h.origin==='position')values.b3+=amount(h.value);
  else values.estimated+=amount(h.value);
 }
 for(const key of Object.keys(values))values[key]=round(values[key]);
 values.total=round(values.b3+values.quotes+values.bank+values.estimated);
 return values;
}
function check(id,title,expected,actual){
 const difference=round(actual-expected);
 return{id,title,expected:round(expected),actual:round(actual),difference,ok:Math.abs(difference)<=0.02};
}
function aggregate(holdings){
 const classes=new Map(),byOwner=new Map(),byAsset=new Map();
 for(const h of holdings){
  const owner=h.owner,code=E.codeOf(h.code),cls=classLabel(h.code,h.group),value=amount(h.value),qty=amount(h.qty);
  for(const [map,key] of [[classes,cls],[byOwner,owner],[byAsset,owner+'|'+code]]){
   const entry=map.get(key)||{key,value:0,qty:0,count:0,openGain:0,cost:0,unverified:0};
   entry.value+=value;entry.qty+=qty;entry.count++;
   if(h.calculation?.verified){entry.cost+=amount(h.calculation.cost);entry.openGain+=amount(h.calculation.openGain);}
   else if(!h.fixedIncome)entry.unverified++;
   map.set(key,entry);
  }
 }
 const clean=map=>Object.fromEntries([...map].map(([key,row])=>[key,{...row,value:round(row.value),cost:round(row.cost),openGain:round(row.openGain)}]));
 return{classes:clean(classes),owners:clean(byOwner),assets:clean(byAsset)};
}
function cacheFor(state){
 if(!state||typeof state!=='object')throw Error('Dados financeiros inválidos');
 let item=cache.get(state);if(!item){item=new Map();cache.set(state,item);}return item;
}
function calculate(state,who='family',today=E.isoNow()){
 const owner=ownerName(who),memo=cacheFor(state),key=owner+'|'+today;
 if(memo.has(key))return memo.get(key);
 const base=E.portfolio(state,owner),ledger=E.ledger(state,owner);
 const detail=E.profitBreakdown?E.profitBreakdown(state,owner,'all',today):null;
 const gains=E.gains(state,owner,'all',today);
 const positions=base.holdings;
 const holdings=positions.map(h=>{
  const b=basis(h,state,ledger,positions),value=round(h.value);
  return{...h,calculation:{
    cost:b.verified?round(b.cost):null,verified:b.verified,nominal:!!b.nominal,reason:b.reason||null,
    openGain:b.verified?round(value-b.cost):null,
    returnPercent:b.verified&&b.cost>0?100*(value-b.cost)/b.cost:null,
    weight:base.total>0?100*value/base.total:0
  }};
 });
 const p={...base,holdings};
 const rollup=aggregate(holdings),sources=sourceTotals(holdings);
 const profitRows=(detail?.sales||[]).filter(x=>x.recognized&&Number.isFinite(Number(x.profit)));
 const paymentRows=(detail?.payouts||E.dividendRows(state,owner)).filter(x=>Number.isFinite(Number(x.amount)));
 const realized=round(profitRows.reduce((sum,s)=>sum+amount(s.profit),0));
 const dividends=round(paymentRows.reduce((sum,s)=>sum+amount(s.amount),0));
 const open=openGain(holdings,state,ledger,positions);
 const total=round(holdings.reduce((sum,h)=>sum+amount(h.value),0));
 const cls=round(Object.values(rollup.classes).reduce((sum,r)=>sum+r.value,0));
 const person=round(Object.values(rollup.owners).reduce((sum,r)=>sum+r.value,0));
 const audits=[
  check('assets','Ativos = patrimônio',base.total,total),
  check('classes','Classes = patrimônio',total,cls),
  check('owners','Titulares = patrimônio',total,person),
  check('sources','B3 + cotações + bancos = patrimônio',total,sources.total),
  check('realized','Lucro realizado = vendas conciliadas',amount(gains.realized),realized),
  check('dividends','Proventos = pagamentos registrados',amount(gains.dividends),dividends)
 ];
 // A missing acquisition cost is not a calculation error; it remains visible.
 if(open.matched>0&&gains.openGain!=null)
  audits.push(check('open-profit','Valorização calculada = resultado do motor',amount(gains.openGain),open.gain));
 const result={owner,p,ledger,d:detail,g:gains,holdings,rollup,sources,openGain:open,realized,dividends,
  total,checks:audits,valid:audits.every(x=>x.ok),issues:audits.filter(x=>!x.ok)};
 memo.set(key,result);
 return result;
}
function view(state,{owner='family',from='1900-01-01',to=E.isoNow(),className='all'}={}){
 const base=calculate(state,owner,E.isoNow()),matches=h=>className==='all'||classLabel(h.code,h.group)===className;
 const holdings=base.holdings.filter(matches);
 const sales=(base.d?.sales||[]).filter(s=>s.date>=from&&s.date<=to&&matches(s));
 const payouts=(base.d?.payouts||E.dividendRows(state,owner)).filter(p=>p.date>=from&&p.date<=to&&matches(p));
 const recognized=sales.filter(s=>s.recognized&&Number.isFinite(Number(s.profit)));
 const realized=round(recognized.reduce((sum,s)=>sum+amount(s.profit),0));
 const dividends=round(payouts.reduce((sum,s)=>sum+amount(s.amount),0));
 const total=round(holdings.reduce((sum,h)=>sum+amount(h.value),0));
 const calculatedOpen=openGain(holdings,state,base.ledger,base.holdings);
 const scopedSources=sourceTotals(holdings);
 const scopedRollup=aggregate(holdings);
 const checks=[
  check('visible-assets','Soma dos ativos filtrados',total,scopedRollup?.classes?Object.values(scopedRollup.classes).reduce((n,r)=>n+r.value,0):total),
  check('visible-sources','Origens dos valores filtrados',total,scopedSources.total)
 ];
 return{...base,holdings,sales,payouts,realized,dividends,total,openGain:calculatedOpen,
  excluded:sales.length-recognized.length,sources:scopedSources,rollup:scopedRollup,
  checks:[...base.checks,...checks],valid:base.valid&&checks.every(x=>x.ok),
  issues:[...base.issues,...checks.filter(x=>!x.ok)]};
}
function invalidate(state){
 if(state&&typeof state==='object')cache.delete(state);
}
root.MoneyTrackerCalculations={calculate,view,basis,openGain,classLabel,sourceTotals,invalidate,round};
})(window);
