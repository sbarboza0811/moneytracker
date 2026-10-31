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
 /^[A-Z0-9]{4,12}$/.test(String(x.code||''))&&validStatus(x.status));
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
  const key=rec.owner+'|'+rec.date+'|'+rec.code,rows=groups.get(key)||[];
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
 // O relatório consolidado de 2024 já foi recebido: é referência histórica,
 // não uma cotação para 2026. O aviso nunca deve solicitar o mesmo arquivo.
 const historical=state&&state.spouseHistoricalPosition;
 const revised=base.map(issue=>{
  if(issue.owner==='me'&&issue.code==='cost-reconcile'){
   const led=E.ledger(state,'me'),port=E.portfolio(state,'me');
   const costFixed=new Set(extraOpenBasis(state,'me').map(x=>x.code));
   const entries=port.holdings.filter(h=>{
    if(costFixed.has(h.code))return false;
    if(h.group==='Tesouro')return !(h.applied>0);
    if(h.origin!=='position'&&h.origin!=='quote')return true;
    const rec=led.stocks.get('me|'+E.codeOf(h.code));
    return !(rec&&!rec.uncertain&&rec.qty>0&&Math.abs(rec.qty-h.qty)<=Math.max(.00001,.002*h.qty));
   });
   const recent=entries.filter(h=>['BOVA11','BEST11'].includes(h.code)).map(h=>{
    const raw=state.records.filter(r=>r.t==='trade'&&r.owner==='me'&&
      r.v[1]==='Compra'&&E.codeOf(r.v[5])===h.code&&r.v[0]==='28/10/2026');
    const bought=raw.reduce((sum,r)=>sum+Number(r.v[6]||0),0);
    const ledQty=led.stocks.get('me|'+E.codeOf(h.code))?.qty||0;
    return{code:h.code,bought,position:h.qty,ledger:ledQty,exact:Math.abs(ledQty-h.qty-bought)<.000001};
   });
   const explained=recent.filter(x=>x.exact&&x.bought>0);
   const irim=entries.find(x=>x.code==='IRIM11');
   const unresolved=entries.filter(x=>!explained.some(y=>y.code===x.code));
   const words=explained.map(x=>x.code+': posição '+x.position+' e compra de '+x.bought+
      ' unidades em 28/10/2026, já registrada no histórico');
   if(irim)words.push('IRIM11: origem confirmada na liquidação de IRDM11 (82 cotas geraram 72 IRIM11 e fração leiloada); custo fiscal da reorganização precisa ser tratado separadamente');
   return {...issue,level:unresolved.length?'warning':'info',code:'reconcile-position-timing',
    title:explained.length+' divergências de posição explicadas por compras recentes'+
      (unresolved.length?' e '+unresolved.length+' conversão(ões)/custo(s) ainda a calcular':''),
    why:'Não faltam comprovantes das compras recentes. '+words.join('. ')+'.',
    action:'Não reenvie BOVA11 ou BEST11. Confirme apenas uma posição B3 atualizada após essas compras para o valor de mercado. A origem IRIM11 já foi localizada em 2025; falta aplicar o custo fiscal sem misturar a amortização.'};
  }
  if(issue.owner!=='spouse'||issue.code!=='missing-position'||!historical?.rows?.length)return issue;
  return {...issue,level:'warning',code:'historical-spouse-position',
   title:'Posição histórica da Jessica recebida; valor atual de 2026 ainda sem confirmação',
   why:'A B3 confirmou '+historical.rows.length+' ativos em 31/12/2024. Este relatório histórico foi vinculado ao aplicativo; não é valorização atual de 2026.',
   action:'Nada a reenviar de 2024. Para valor de mercado atual, é necessária uma posição de 2026 se ela não estiver disponível nas fontes conectadas.'};
 });
 if(!getEntries(state).length)return revised.filter(x=>x.code!=='cash-flow-coverage');
 const auditable=new Set(getEntries(state).map(x=>x.owner));
 const selected=ownerSet(owner);
 const items=revised.filter(x=>x.code!=='cash-flow-coverage'&&
   !(x.code==='unverified-sales'&&selected.includes(x.owner)&&auditable.has(x.owner)));
 for(const o of selected){
  if(!auditable.has(o))continue;
  const report=audit(state,o,'all',today),g=E.gains(state,o,'all',today);
  if(g.excludedSales<=0&&report.unmatched===0)continue;
  const raw=[...E.ledger(state,o).sales,...E.treasuryLedger(state,o).sales];
  const verified=new Set(report.checks.filter(x=>x.matched&&x.status==='CALCULAVEL_BRUTO')
   .map(x=>x.owner+'|'+x.date+'|'+x.code));
  const unresolved=raw.filter(x=>!x.recognized&&!verified.has(x.owner+'|'+x.date+'|'+x.code));
  const codes=[...new Set(unresolved.map(x=>x.code))];
  items.push({level:'critical',owner:o,code:'reconciliation-unverified',
    title:g.excludedSales+' venda(s) sem custo comprovado ('+(o==='spouse'?'Jessica':'Samuel')+')',
    why:report.verified+' grupo(s) já conciliados por documentos. Restam '+g.excludedSales+
      ' registros em '+[...new Set(unresolved.map(x=>x.date+'|'+x.code))].length+
      ' grupos, entre eles '+codes.slice(0,12).join(', ')+'.',
    action:'Confira os detalhes por ativo/data abaixo. A negociação já foi importada; faltam custos históricos ou eventos específicos das unidades.'});
 }
 return items;
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
 const confirmedKeys=new Set(a.checks.filter(x=>x.matched&&x.status==='CALCULAVEL_BRUTO')
  .map(x=>x.owner+'|'+x.date+'|'+x.code));
 const remainingProblems=(base.unmatched||[]).filter(p=>
  !confirmedKeys.has((p.owner||'me')+'|'+p.date+'|'+E.codeOf(p.code)));
 const parts=[];
 if(excluded.length)parts.push(excluded.length+' negociações sem custo confirmado foram excluídas do lucro.');
 if(a.unmatched)parts.push(a.unmatched+' conciliações não coincidiram com as negociações importadas.');
 if(missing){
  if(owner==='spouse'&&!state.spousePositionSnapshot?.rows?.length)
   parts.push('A posição histórica da Jessica foi recebida; sem um valor de mercado atual, a valorização em aberto não pode ser concluída.');
  else if(owner==='me'&&missing===2)
   parts.push('BOVA11 e BEST11: as compras de 28/10/2026 estão no histórico, mas não na posição exportada. A avaliação dessas unidades permanece fora do lucro em aberto.');
  else if(owner==='family')
   parts.push('Avaliação familiar parcial: posição de Jessica histórica e compras recentes de BOVA11/BEST11 não refletidas no snapshot.');
  else parts.push(missing+' posições abertas sem custo/preço suficiente.');
 }
 if(period!=='all')parts.push('Sem preço histórico, a valorização de posições abertas neste intervalo não é apurada.');
 if(remainingProblems.length)parts.push('Existem '+remainingProblems.length+' problemas históricos ainda não conciliados.');
 return{...base,unmatched:remainingProblems,realized,dividends,openGain,openIncluded,matched,missing,
  profit:rounded(realized+dividends+openIncluded),
  sales:recognized.length,totalSales:sales.length,excludedSales:excluded.length,
  excludedGross:excluded.reduce((total,x)=>total+x.gross,0),
  payments:payouts.length,monthly:[...monthly.values()].sort((x,y)=>x.month.localeCompare(y.month)),
  complete:missing===0&&remainingProblems.length===0&&excluded.length===0&&a.unmatched===0&&a.provisional===0&&a.incomplete===0&&period==='all',
  partial:!(missing===0&&remainingProblems.length===0&&excluded.length===0&&a.unmatched===0&&a.provisional===0&&a.incomplete===0&&period==='all'),warning:parts.join(' '),
  reconciliationVerified:a.verified,reconciliationProvisional:a.provisional,
  reconciliationIncomplete:a.incomplete,reconciliationUnmatched:a.unmatched};
};
})(window);
