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
 const r=state&&state.reconciliation||{};
 const inputs=[...(Array.isArray(r.sales)?r.sales.map(x=>({...x,owner:'spouse'})):[]),
  ...(Array.isArray(r.meSales)?r.meSales.map(x=>({...x,owner:'me'})):[])];
 return inputs.filter(x=>x&&/^\d{4}-\d{2}-\d{2}$/.test(String(x.date||''))&&
 (/^[A-Z0-9]{4,12}$/.test(String(x.code||''))||/^TESOURO (SELIC|IPCA|PREFIXADO)/i.test(String(x.code||'')))&&validStatus(x.status)&&!E.isSubscriptionRight(x.code));
}
function saleKey(x){return x.owner+'|'+x.date+'|'+E.codeOf(x.code);}
function extraOpenBasis(state,owner){
 const bases=state?.reconciliation?.positionBasis||{},list=[],p=E.portfolio(state,owner);
 const ledger=E.ledger(state,owner);
 for(const h of p.holdings){
  const ref=bases[E.codeOf(h.code)];
  if(!ref||ref.owner!==h.owner||!(Number(ref.unitCost)>0)||!(Number(ref.qty)>0)||
   Math.abs(h.qty-Number(ref.qty))>0.00001||!['position','quote'].includes(h.origin)||h.group==='Tesouro')continue;
  const current=ledger.stocks.get(h.owner+'|'+E.codeOf(h.code));
  const reconciled=current&&!current.uncertain&&current.qty>0&&
   Math.abs(current.qty-h.qty)<=Math.max(0.00001,0.002*h.qty);
  if(!reconciled)list.push({code:h.code,owner:h.owner,gain:h.value-h.qty*Number(ref.unitCost)});
 }
 return list;
}
function audit(state,owner='family',period='all',today=E.isoNow()){
 const from=E.cutoff(period,today),owners=ownerSet(owner),all=getEntries(state);
 const selected=all.filter(x=>owners.includes(x.owner)&&x.date>=from&&x.date<=today);
 const sales=[...E.ledger(state,owner).sales,...E.treasuryLedger(state,owner).sales]
  .filter(x=>x.date>=from&&x.date<=today);
 const groups=new Map(),overrides=new Map(),checks=[];
 for(const s of sales){const k=saleKey(s);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(s);}
 for(const rec of selected){
  const key=rec.owner+'|'+rec.date+'|'+E.codeOf(rec.code),rows=groups.get(key)||[];
  // Algumas vendas ocorrem no mesmo dia em corretoras diferentes.
  // Conciliar primeiro a linha exata, depois permitir grupo por data+ativo.
  const exact=rows.find(x=>!overrides.has(x)&&Math.abs(num(x.qty)-num(rec.qty))<0.00001&&
   Math.abs(num(x.gross)-num(rec.gross))<=0.02);
  const groupRows=exact?[exact]:rows.filter(x=>!overrides.has(x));
  const quantity=groupRows.reduce((t,x)=>t+num(x.qty),0);
  const gross=groupRows.reduce((t,x)=>t+num(x.gross),0);
  // Somente sobrepor quando a quantidade e o valor conferem.
  const matched=groupRows.length>0&&Math.abs(quantity-num(rec.qty))<0.00001&&
   Math.abs(gross-num(rec.gross))<=0.02;
  checks.push({...rec,matched});
  if(!matched)continue;
  const verified=rec.status==='CALCULAVEL_BRUTO'&&Number.isFinite(num(rec.basis))&&rec.basis!==null;
  for(const row of groupRows){
   // Aloca lucro apenas às linhas conciliadas desta venda, sem sobrescrever outra corretora.
   const share=gross>0?num(row.gross)/gross:1/groupRows.length;
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
 const selected=ownerSet(owner),issues=[],p=E.portfolio(state,owner);
 for(const o of selected){
  const label=o==='spouse'?'Jessica':'Samuel';
  const snapshot=o==='spouse'?state.spousePositionSnapshot:state.positionSnapshot;
  if(!snapshot?.rows?.length)issues.push({level:'warning',owner:o,code:'missing-position',
   title:'Posição B3 atual não importada — '+label,
   why:'A avaliação disponível pode usar histórico ou estimativas, sem confirmar o valor de mercado atual.',
   action:'Importe uma Posição B3 atualizada para obter valores de mercado.'});
  else if(snapshot.date&&today.slice(0,7)!==snapshot.date.slice(0,7))
   issues.push({level:'info',owner:o,code:'old-position',title:'Posição de '+label+' tem data anterior',
    why:'Posição registrada em '+E.dateBR(snapshot.date)+'.',
    action:'Atualize a Posição B3 quando quiser uma avaliação recente.'});
  const g=E.gains(state,o,'all',today);
  if(g.excludedSales>0||g.reconciliationUnmatched>0||g.reconciliationProvisional>0||g.reconciliationIncomplete>0){
   issues.push({level:'critical',owner:o,code:'unverified-sales',
    title:'Vendas ou conciliações a verificar — '+label,
    why:g.excludedSales+' venda(s) sem lucro apurado; '+g.reconciliationUnmatched+' conciliação(ões) não correspondentes.',
    action:'Confira as operações específicas no histórico e os custos de origem.'});
  }
  if(g.missing>0)issues.push({level:'warning',owner:o,code:'open-cost-unverified',
   title:g.missing+' posição(ões) sem valorização completa — '+label,
   why:'Existem posições cujo custo ou valor de mercado ainda não pode ser calculado com as fontes atuais.',
   action:'Importe fontes de custo ou posição quando disponíveis; nenhuma cotação será tratada como custo fiscal.'});
 }
 return issues;
};

E.gains=function(state,owner='family',period='all',today=E.isoNow()){
 const base=originalGains(state,owner,period,today);
 const added=extraOpenBasis(state,owner);
 const addedGain=rounded(added.reduce((sum,x)=>sum+x.gain,0));
 const missing=Math.max(0,base.missing-added.length),matched=base.matched+added.length;
 const openGain=matched?rounded((base.openGain||0)+addedGain):null;
 const openIncluded=period==='all'?rounded(base.openIncluded+addedGain):base.openIncluded;
 if(!getEntries(state).some(x=>ownerSet(owner).includes(x.owner)))
  return {...base,openGain,openIncluded,matched,missing,
   profit:rounded(base.realized+base.dividends+openIncluded)};

 const a=audit(state,owner,period,today);
 const sales=a.sales.map(x=>{
  const row=a.overrides.has(x)?{...x,...a.overrides.get(x)}:x;
  const partial=(state?.reconciliation?.mePartialSales||[]).find(p=>
   p.owner===row.owner&&p.date===row.date&&p.code===E.codeOf(row.code)&&
   Math.abs(Number(p.qty)-row.qty)<0.0000001&&
   Math.abs(Number(p.gross)-row.gross)<0.02&&p.status==='CALCULAVEL_BRUTO');
  if(!partial||!row.recognized||!Number.isFinite(Number(partial.basis)))return row;
  return {...row,profit:Number(partial.gross)-Number(partial.basis),
   reason:'Custo bruto da negociação individual auditado contra compras da mesma corretora'};
 });
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
 // Problemas do livro bruto não são pendências novas quando a venda já está conciliada.
 // Somente vendas efetivamente excluídas ou conciliações sem correspondência bloqueiam o resultado.
 const remainingProblems=(base.unmatched||[]).filter(p=>
  excluded.some(x=>x.owner===(p.owner||'me')&&x.date===p.date&&E.codeOf(x.code)===E.codeOf(p.code)));
 const parts=[];
 const custodyMismatch=false; // Nunca usar uma divergência estática arquivada como bloqueio de cálculo.
 if(excluded.length)parts.push(excluded.length+' negociações sem custo confirmado foram excluídas do lucro.');
 if(a.unmatched)parts.push(a.unmatched+' conciliações não coincidiram com as negociações importadas.');
 if(missing){
  if(owner==='spouse'&&!state.spousePositionSnapshot?.rows?.length)
   parts.push('A posição histórica da Jessica foi recebida; sem um valor de mercado atual, a valorização em aberto não pode ser concluída.');
  else parts.push(missing+' posições abertas ainda sem custo/preço suficiente para valorização completa.');
 }
 // O filtro histórico mostra apenas vendas e proventos. Não repetir aviso de valorização não incluída: a interface já informa isso.
 if(remainingProblems.length)parts.push('Existem '+remainingProblems.length+' problemas históricos ainda não conciliados.');
 return{...base,unmatched:remainingProblems,realized,dividends,openGain,openIncluded,matched,missing,
  profit:rounded(realized+dividends+openIncluded),
  sales:recognized.length,totalSales:sales.length,excludedSales:excluded.length,
  excludedGross:excluded.reduce((total,x)=>total+x.gross,0),
  payments:payouts.length,monthly:[...monthly.values()].sort((x,y)=>x.month.localeCompare(y.month)),
  complete:missing===0&&base.incomePending===0&&remainingProblems.length===0&&excluded.length===0&&a.unmatched===0&&a.provisional===0&&a.incomplete===0&&!custodyMismatch&&period==='all',
  partial:!(missing===0&&base.incomePending===0&&remainingProblems.length===0&&excluded.length===0&&a.unmatched===0&&a.provisional===0&&a.incomplete===0&&!custodyMismatch&&period==='all'),warning:parts.join(' '),
  reconciliationVerified:a.verified,reconciliationProvisional:a.provisional,
  reconciliationIncomplete:a.incomplete,reconciliationUnmatched:a.unmatched};
};

/* Detalhamento sempre derivado da importação corrente e dos custos conciliados.
   Compras são fontes do custo médio, não lotes FIFO específicos. */
E.profitBreakdown=function(state,owner='family',period='all',today=E.isoNow()){
 const owners=ownerSet(owner),from=E.cutoff(period,today),a=audit(state,owner,period,today);
 const raw=a.sales; // Mesmas referências usadas pelo mapa de conciliações.
 const sales=raw.map(x=>{
   const v=a.overrides.get(x);
   const row=v?{...x,...v}:x;
   const partial=(state?.reconciliation?.mePartialSales||[]).find(p=>
    p.owner===row.owner&&p.date===row.date&&p.code===E.codeOf(row.code)&&
    Math.abs(Number(p.qty)-row.qty)<0.0000001&&
    Math.abs(Number(p.gross)-row.gross)<0.02&&p.status==='CALCULAVEL_BRUTO');
   const verifiedPartial=partial&&row.recognized&&Number.isFinite(Number(partial.basis));
   const profit=verifiedPartial?Number(partial.gross)-Number(partial.basis):row.profit;
   return {...row,profit,cost:row.recognized&&Number.isFinite(profit)?rounded(row.gross-profit):null,
    source:verifiedPartial?'Custo individual auditado':(v?'Custo conciliado':(row.recognized?'Custo médio do histórico':'Custo não verificado'))};
 }).sort((x,y)=>y.date.localeCompare(x.date)||x.code.localeCompare(y.code));
 const purchases=(state.records||[]).filter(r=>owners.includes(r.owner||'me')&&
   ((r.t==='trade'&&String(r.v[1]).toLowerCase()==='compra')||
    (r.t==='mov'&&String(r.v[2]).toLowerCase()==='compra'&&String(r.v[0]).toLowerCase()==='credito')))
   .map(r=>({owner:r.owner||'me',code:E.codeOf(r.t==='trade'?r.v[5]:String(r.v[3]).split(' - ')[0]),
    date:E.recordDate(r),qty:E.number(r.v[r.t==='trade'?6:5]),total:E.number(r.v[r.t==='trade'?8:7]),
    broker:String(r.v[4]||''),source:r.source||''})).filter(x=>x.date&&x.date<=today&&x.qty>0&&Number.isFinite(x.total)&&!E.isSubscriptionRight(x.code));
 const purchasesByCode=new Map();
 for(const p of purchases){const key=p.owner+'|'+p.code;if(!purchasesByCode.has(key))purchasesByCode.set(key,[]);purchasesByCode.get(key).push(p);}
 for(const list of purchasesByCode.values())list.sort((x,y)=>y.date.localeCompare(x.date));
 const payouts=E.dividendRows(state,owner).filter(x=>x.date>=from&&x.date<=today)
  .sort((x,y)=>y.date.localeCompare(x.date)||x.code.localeCompare(y.code));
 const byAsset=new Map();
 for(const x of sales){
  const key=x.owner+'|'+x.code;
  if(!byAsset.has(key))byAsset.set(key,{owner:x.owner,code:x.code,qtySold:0,gross:0,cost:0,profit:0,sales:[],purchases:[]});
  const g=byAsset.get(key);g.qtySold+=x.qty;g.gross+=x.gross;g.cost+=x.cost||0;g.profit+=x.profit||0;g.sales.push(x);
 }
 for(const [key,g] of byAsset){
  const lastSale=g.sales.reduce((date,x)=>x.date>date?x.date:date,'');
  g.purchases=(purchasesByCode.get(key)||[]).filter(x=>x.date<=lastSale);
  g.hasUnverified=g.sales.some(x=>!x.recognized);
  g.gross=rounded(g.gross);g.cost=rounded(g.cost);g.profit=rounded(g.profit);
 }
 return{from,to:today,assets:[...byAsset.values()].sort((x,y)=>y.sales[0].date.localeCompare(x.sales[0].date)),
  sales,payouts,realized:rounded(sales.reduce((n,x)=>n+(Number.isFinite(x.profit)?x.profit:0),0)),
  dividends:rounded(payouts.reduce((n,x)=>n+x.amount,0)),
  excluded:sales.filter(x=>!x.recognized).length};
};

})(window);
