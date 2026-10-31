(function(root){
'use strict';
/* Conciliação privada: preços históricos vivem APENAS no snapshot autenticado
   do Supabase. Nenhuma posição ou nota particular fica no repositório público. */
const E=root.MoneyTrackerEngine;
if(!E)throw Error('Motor financeiro ausente para conciliação');
const originalGains=E.gains;
const num=x=>Number(x);
const rounded=x=>Math.round((x+Number.EPSILON)*100)/100;
const ownerSet=o=>o==='family'?['me','spouse']:[o==='spouse'?'spouse':'me'];
const validStatus=s=>['CALCULAVEL_BRUTO','PROVISORIO','INCOMPLETO'].includes(s);
function getEntries(state){
 const r=state&&state.reconciliation;
 return r&&r.owner==='spouse'&&Array.isArray(r.sales)?r.sales.filter(x=>
  x&&/^\d{4}-\d{2}-\d{2}$/.test(String(x.date||''))&&
  /^[A-Z0-9]{4,12}$/.test(String(x.code||''))&&validStatus(x.status)
 ):[];
}
function saleKey(x){return x.owner+'|'+x.date+'|'+E.codeOf(x.code);}
function audit(state,owner='family',period='all',today=E.isoNow()){
 const from=E.cutoff(period,today),owners=ownerSet(owner),all=getEntries(state);
 const selected=all.filter(x=>owners.includes('spouse')&&x.date>=from&&x.date<=today);
 const sales=[...E.ledger(state,owner).sales,...E.treasuryLedger(state,owner).sales]
  .filter(x=>x.date>=from&&x.date<=today);
 const groups=new Map(),overrides=new Map(),checks=[];
 for(const s of sales){const k=saleKey(s);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(s);}
 for(const rec of selected){
  const key='spouse|'+rec.date+'|'+rec.code,rows=groups.get(key)||[];
  const quantity=rows.reduce((t,x)=>t+num(x.qty),0);
  const gross=rows.reduce((t,x)=>t+num(x.gross),0);
  // Somente sobrepor quando a negociação da B3 confere com o arquivo auditado.
  const matched=rows.length>0&&Math.abs(quantity-num(rec.qty))<0.00001&&
   Math.abs(gross-num(rec.gross))<=0.02;
  checks.push({...rec,matched});
  if(!matched)continue;
  const verified=rec.status==='CALCULAVEL_BRUTO'&&Number.isFinite(num(rec.basis))&&rec.basis!==null;
  for(const row of rows){
   // Aloca lucro por valor vendido, preservando as linhas individuais da B3.
   const share=gross>0?num(row.gross)/gross:1/rows.length;
   overrides.set(row,{
    recognized:verified,uncertain:!verified,
    profit:verified?(num(rec.gross)-num(rec.basis))*share:null,
    reason:verified?'Conciliação histórica de custo bruto':
     'Conciliação '+rec.status.toLowerCase()+': resultado excluído até validação'
   });
  }
 }
 return{sales,overrides,checks,items:selected,
  verified:checks.filter(x=>x.matched&&x.status==='CALCULAVEL_BRUTO').length,
  provisional:checks.filter(x=>x.matched&&x.status==='PROVISORIO').length,
  incomplete:checks.filter(x=>x.matched&&x.status==='INCOMPLETO').length,
  unmatched:checks.filter(x=>!x.matched).length};
}
E.reconciliationReport=function(state,owner='family',period='all',today=E.isoNow()){
 const a=audit(state,owner,period,today);
 return{items:a.checks,verified:a.verified,provisional:a.provisional,
  incomplete:a.incomplete,unmatched:a.unmatched,
  annualIncome:(state?.reconciliation?.annualIncome||[]).filter(x=>x.year===2024)};
};

/* Pendências têm de ser apuradas após a conciliação: não usar a lista bruta
   de vendas da B3 como se todas ainda estivessem sem custo. */
const originalGaps=E.gaps;
E.gaps=function(state,owner='family',today=E.isoNow()){
 const base=originalGaps(state,owner,today);
 if(!getEntries(state).length)return base.filter(x=>x.code!=='cash-flow-coverage');
 const includeSpouse=ownerSet(owner).includes('spouse');
 const items=base.filter(x=>x.code!=='cash-flow-coverage'&&
  !(includeSpouse&&x.owner==='spouse'&&x.code==='unverified-sales'));
 if(!includeSpouse)return items;
 const report=audit(state,'spouse','all',today),g=E.gains(state,'spouse','all',today);
 const pending=report.checks.filter(x=>!x.matched||x.status!=='CALCULAVEL_BRUTO');
 if(g.excludedSales>0){
  const codes=[...new Set(pending.map(x=>x.code))];
  items.push({level:'critical',owner:'spouse',code:'reconciliation-unverified',
   title:g.excludedSales+' venda(s) ainda sem custo verificado (Jessica)',
   why:pending.length+' grupos de operações com custo provisório/incompleto. '+
    (codes.length?'Ativos: '+codes.join(', ')+'. ':'')+
    'As '+report.verified+' vendas conciliadas não estão nesta pendência.',
   action:'Veja abaixo cada data e ativo. Consulte notas de aquisição ou custo de eventos societários; não é necessário buscar 2024 sem negociações.'});
 }
 return items;
};

E.gains=function(state,owner='family',period='all',today=E.isoNow()){
 const base=originalGains(state,owner,period,today);
 if(!getEntries(state).length||!ownerSet(owner).includes('spouse'))return base;
 const a=audit(state,owner,period,today);
 const sales=a.sales.map(x=>a.overrides.has(x)?{...x,...a.overrides.get(x)}:x);
 const recognized=sales.filter(x=>x.recognized&&Number.isFinite(x.profit));
 const excluded=sales.filter(x=>!x.recognized||!Number.isFinite(x.profit));
 const payouts=E.dividendRows(state,owner).filter(x=>x.date>=base.from&&x.date<=today);
 const monthly=new Map();
 function add(date,key,amount){
  if(!Number.isFinite(amount))return;
  const m=date.slice(0,7);
  if(!monthly.has(m))monthly.set(m,{month:m,realized:0,dividends:0});
  monthly.get(m)[key]+=amount;
 }
 recognized.forEach(x=>add(x.date,'realized',x.profit));
 payouts.forEach(x=>add(x.date,'dividends',x.amount));
 const realized=rounded(recognized.reduce((total,x)=>total+x.profit,0));
 const dividends=rounded(payouts.reduce((total,x)=>total+x.amount,0));
 const parts=[];
 if(excluded.length)parts.push(excluded.length+' negociações sem custo confirmado foram excluídas do lucro.');
 if(a.unmatched)parts.push(a.unmatched+' conciliações não coincidiram com as negociações importadas.');
 if(base.missing)parts.push(base.missing+' posições abertas sem custo/preço suficiente.');
 if(period!=='all')parts.push('Sem preço histórico, a valorização de posições abertas neste intervalo não é apurada.');
 if(base.unmatched?.length)parts.push('Histórico societário e custos de posições ainda precisam de conferência.');
 return{...base,realized,dividends,profit:rounded(realized+dividends+base.openIncluded),
  sales:recognized.length,totalSales:sales.length,excludedSales:excluded.length,
  excludedGross:excluded.reduce((total,x)=>total+x.gross,0),
  payments:payouts.length,monthly:[...monthly.values()].sort((x,y)=>x.month.localeCompare(y.month)),
  complete:base.complete&&excluded.length===0&&a.unmatched===0&&a.provisional===0&&a.incomplete===0,
  partial:!(base.complete&&excluded.length===0&&a.unmatched===0&&a.provisional===0&&a.incomplete===0),warning:parts.join(' '),
  reconciliationVerified:a.verified,reconciliationProvisional:a.provisional,
  reconciliationIncomplete:a.incomplete,reconciliationUnmatched:a.unmatched};
};
})(window);
