(function(root){
'use strict';
const NHEAD=['Data do Negócio','Tipo de Movimentação','Mercado','Prazo/Vencimento','Instituição','Código de Negociação','Quantidade','Preço','Valor'];
const MHEAD=['Entrada/Saída','Data','Movimentação','Produto','Instituição','Quantidade','Preço unitário','Valor da Operação'];
const ETF=new Set(('BOVA11 BOVV11 DIVO11 PIBB11 IBOV11 WRLD11 IVVB11 BEST11 NASD11 TECK11 CHIP11 GOLD11 SPXI11 ACWI11 TECK11 LFTS11 HASH11 BITH11').split(' '));
const LABELS={me:'Minha carteira',spouse:'Carteira da esposa',family:'Família'};
const MONEY=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
const tidy=s=>String(s??'').trim();
const norm=s=>tidy(s).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/\s+/g,' ').replace(/[–—]/g,'-');
const number=x=>{
 if(typeof x==='number')return Number.isFinite(x)?x:NaN;
 let s=tidy(x).replace(/R\$/gi,'').replace(/\s/g,'');if(!s||s==='-')return NaN;
 if(s.includes(',')&&s.includes('.'))s=s.replace(/\./g,'').replace(',','.');
 else if(s.includes(','))s=s.replace(',','.');
 return Number(s);
};
const money=x=>MONEY.format(Number(x)||0);
const roundMoney=x=>Math.sign(x)*Math.round(Math.abs(x)*100+1e-9)/100;
const fmt=x=>new Intl.NumberFormat('pt-BR',{maximumFractionDigits:5}).format(Number(x)||0);
const dateISO=value=>{
 if(typeof value==='number'&&value>=1&&value<100000){const d=new Date(Date.UTC(1899,11,30)+Math.round(value)*86400000);return d.toISOString().slice(0,10);}
 const s=tidy(value),iso=s.match(/^(\d{4})-(\d\d)-(\d\d)/);if(iso)return iso[0];
 const br=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);return br?br[3]+'-'+br[2].padStart(2,'0')+'-'+br[1].padStart(2,'0'):'';
};
const dateBR=value=>{const d=dateISO(value);return d?d.slice(8,10)+'/'+d.slice(5,7)+'/'+d.slice(0,4):'';};
const isoNow=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');};
const cutoff=(period,today=isoNow())=>{
 if(period==='all')return'0000-01-01';
 const d=new Date(today+'T12:00:00');
 if(period==='30')d.setDate(d.getDate()-29);
 else if(period==='90')d.setDate(d.getDate()-89);
 else if(period==='1y')d.setFullYear(d.getFullYear()-1);
 else if(period==='5y')d.setFullYear(d.getFullYear()-5);
 else return'0000-01-01';
 return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
};
const periodLabel={30:'30 dias',90:'90 dias','1y':'1 ano','5y':'5 anos',all:'Todo o histórico'};
const codeOf=raw=>norm(raw).replace(/^(.*\d)F$/,'$1');
function classify(code,group){
 const c=codeOf(code),g=norm(group);
 if(g.includes('TESOURO'))return'Tesouro';
 if(g.includes('FUNDO DE INVESTIMENTO'))return'Fundos';
 if(ETF.has(c))return'ETF';
 if(/11$/.test(c))return'FII';
 if(/\d{1,2}$/.test(c))return'Ações / BDRs';
 return'Outros';
}
const ownerOf=x=>x==='spouse'?'spouse':'me';
const recordDate=r=>dateISO(r.t==='trade'?r.v[0]:r.v[1]);
function cleanRow(kind,row){
 const n=kind==='trade'?9:8;
 let out=Array.from(row||[]).slice(0,n);
 while(out.length<n)out.push('');
 const dt=kind==='trade'?0:1;out[dt]=dateBR(out[dt]);
 for(const i of kind==='trade'?[6,7,8]:[5,6,7]){const val=number(out[i]);out[i]=Number.isFinite(val)?Math.round(val*1e8)/1e8:tidy(out[i]);}
 return out.map(x=>typeof x==='string'?x.trim():x);
}
function rowValid(kind,row){
 const d=recordDate({t:kind,v:row});if(!/^\d{4}-\d\d-\d\d$/.test(d))return false;
 if(kind==='trade')return['COMPRA','VENDA'].includes(norm(row[1]))&&!!tidy(row[4])&&!!tidy(row[5])&&number(row[6])>0&&number(row[8])>=0;
 return['CREDITO','DEBITO'].includes(norm(row[0]))&&!!tidy(row[2])&&!!tidy(row[3])&&!!tidy(row[4]);
}
function fingerprint(t,row,owner){
 return ownerOf(owner)+'|'+t+'|'+row.map((x,i)=>{
  if((t==='trade'?[6,7,8]:[5,6,7]).includes(i)){const n=number(x);return Number.isFinite(n)?String(+n.toFixed(8)):norm(x);}
  if(i===(t==='trade'?0:1))return dateISO(x);
  return norm(x);
 }).join('\u001f');
}
function newState(){
 return{v:3,records:[],sources:{},classes:{},quotes:{},fixedIncomeTransactions:[],positionHistory:[],positionSnapshot:null,spousePositionSnapshot:null,positionParts:{},created:isoNow()};
}
function normalizeState(raw){
 const s=raw&&typeof raw==='object'?raw:{};
 const out={...newState(),...s,v:3};
 out.records=Array.isArray(s.records)?s.records.filter(r=>['trade','mov'].includes(r?.t)&&Array.isArray(r?.v)).map(r=>({...r,owner:ownerOf(r.owner)})):[];
 out.fixedIncomeTransactions=Array.isArray(s.fixedIncomeTransactions)?s.fixedIncomeTransactions.filter(t=>t&&t.owner&&t.date&&t.assetCode&&Number.isFinite(+t.amount)&&+t.amount>0):[];
 out.positionHistory=Array.isArray(s.positionHistory)?s.positionHistory:[];
 out.positionParts=s.positionParts&&typeof s.positionParts==='object'?s.positionParts:{};
 out.sources=s.sources&&typeof s.sources==='object'?s.sources:{};
 out.quotes=s.quotes&&typeof s.quotes==='object'?s.quotes:{};
 return out;
}
function ledger(state,owner='family'){
 const selected=owner==='family'?['me','spouse']:[ownerOf(owner)];
 const items=[];
 for(const r of state.records||[]){
  const o=ownerOf(r.owner);
  if(!selected.includes(o)||!Array.isArray(r.v))continue;
  if(r.t==='trade'){
   const d=recordDate(r),act=norm(r.v[1]);
   if(d&&['COMPRA','VENDA'].includes(act))items.push({kind:'trade',r,owner:o,date:d,priority:act==='COMPRA'?1:2});
  }else if(r.t==='mov'){
   const d=recordDate(r),ev=norm(r.v[2]),dir=norm(r.v[0]);
   if(d&&((dir==='CREDITO'&&['DESDOBRO','BONIFICACAO EM ATIVOS','GRUPAMENTO','INCORPORACAO','LEILAO DE FRACAO'].includes(ev))||(dir==='DEBITO'&&ev==='FRACAO EM ATIVOS')))
    items.push({kind:'event',r,owner:o,date:d,event:ev,priority:0});
  }
 }
 // B3 Excel does not provide intraday execution times. Same-day buys precede
 // sales; the result is a gross investment estimate, not a day-trade tax calculation.
 items.sort((a,b)=>a.date.localeCompare(b.date)||a.priority-b.priority);
 const stocks=new Map(),sales=[],problems=[],adjustments=[],pendingFractions=new Map();
 const get=(o,c)=>{
  const key=o+'|'+c;
  if(!stocks.has(key))stocks.set(key,{owner:o,code:c,qty:0,cost:0,unmatched:0,qtyPurchased:0,buys:0,uncertain:false});
  return stocks.get(key);
 };
 for(const item of items){
  const r=item.r,o=item.owner,date=item.date;
  const c=item.kind==='trade'?codeOf(r.v[5]):codeOf(tidy(r.v[3]).split(' - ')[0]);
  if(!c)continue;
  const p=get(o,c),qty=number(r.v[item.kind==='trade'?6:5]);
  if(item.kind==='event'){
   const before=p.qty,key=o+'|'+c;
   if(item.event==='LEILAO DE FRACAO'){
    const payout=number(r.v[7]),pending=pendingFractions.get(key);
    let amount=Number.isFinite(qty)&&qty>0?qty:0,basis=0,uncertain=p.uncertain;
    if(pending){
     amount=pending.qty;basis=pending.cost;uncertain=uncertain||pending.uncertain;
     pendingFractions.delete(key);
    }else{
     // Some B3 exports report quantity zero for fractional auctions.
     // Use only the outstanding fractional part; never invent whole shares.
     amount=amount||Math.max(0,p.qty-Math.floor(p.qty+1e-8));
     if(amount>0&&p.qty>0){
      const covered=Math.min(amount,p.qty);
      basis=p.cost*covered/p.qty;p.cost=Math.max(0,p.cost-basis);
      p.qty=Math.max(0,p.qty-covered);
     }else amount=0;
    }
    if(amount>0&&Number.isFinite(payout)&&payout>=0){
     const valid=!uncertain&&before>0;
     sales.push({owner:o,code:c,date,profit:valid?payout-basis:null,
       recognized:valid,uncertain:!valid,covered:amount,qty:amount,gross:payout,
       unmatched:false,reason:valid?'':'Leilão de fração com custo atribuído não confirmado'});
     if(!valid)problems.push({owner:o,code:c,date,qty:amount,reason:'Fração em leilão sem custo conhecido'});
    }
    if(p.qty<1e-8){p.qty=0;p.cost=0;p.uncertain=false;}
    adjustments.push({owner:o,code:c,date,type:item.event,qty:amount,before,after:p.qty,uncertain});
    continue;
   }
   if(!(qty>0)||!Number.isFinite(qty))continue;
   if(item.event==='FRACAO EM ATIVOS'){
    const covered=Math.min(qty,Math.max(0,p.qty)),basis=p.qty>0?p.cost*covered/p.qty:0;
    if(covered){p.cost=Math.max(0,p.cost-basis);p.qty=Math.max(0,p.qty-covered);}
    pendingFractions.set(key,{qty:covered||qty,cost:basis,uncertain:p.uncertain||covered<qty});
   }else if(item.event==='DESDOBRO'){
    p.qty+=qty;
    if(before<=0)p.uncertain=true;
   }else if(item.event==='GRUPAMENTO'){
    p.qty=qty;if(before<=0)p.uncertain=true;
   }else{
    p.qty+=qty;p.uncertain=true;
   }
   adjustments.push({owner:o,code:c,date,type:item.event,qty,before,after:p.qty,uncertain:p.uncertain});
   continue;
  }
  if(!(qty>0)||!Number.isFinite(qty))continue;
  const value=number(r.v[8]),action=norm(r.v[1]);
  if(!(value>=0)||!Number.isFinite(value))continue;
  if(action==='COMPRA'){
   p.qty+=qty;p.cost+=value;p.buys++;p.qtyPurchased+=qty;
  }else{
   const before=p.qty,covered=Math.min(qty,Math.max(0,before));
   const coveredCost=covered>0?p.cost*covered/before:0;
   const missingQty=Math.max(0,qty-covered);
   const valid=missingQty<1e-8&&!p.uncertain;
   const profit=valid?value-coveredCost:null;
   if(covered){p.cost=Math.max(0,p.cost-coveredCost);p.qty=Math.max(0,p.qty-covered);}
   if(missingQty>0){
    p.unmatched+=missingQty;
    problems.push({owner:o,code:c,qty:missingQty,date,reason:'Venda sem custo de aquisição completo'});
   }else if(!valid){
    problems.push({owner:o,code:c,qty:0,date,reason:'Custo desconhecido em bonificação, grupamento ou incorporação'});
   }
   sales.push({owner:o,code:c,date,profit,recognized:valid,uncertain:!valid,covered,qty,gross:value,unmatched:missingQty>0,reason:valid?'':p.uncertain?'Custo de aquisição não confirmado':'Compra anterior ausente'});
   if(p.qty<1e-8){p.qty=0;p.cost=0;p.uncertain=false;}
  }
 }
 return{stocks,sales,problems,adjustments};
}
function treasuryLedger(state,owner='family'){
 const selected=owner==='family'?['me','spouse']:[ownerOf(owner)];
 const actions=(state.records||[]).filter(r=>r.t==='mov'&&selected.includes(ownerOf(r.owner))&&
  norm(r.v[3]).startsWith('TESOURO ')&&['COMPRA','VENDA'].includes(norm(r.v[2]))&&recordDate(r))
  .slice().sort((a,b)=>recordDate(a).localeCompare(recordDate(b))||
   (norm(a.v[2])==='COMPRA'?0:1)-(norm(b.v[2])==='COMPRA'?0:1));
 const stocks=new Map(),sales=[],problems=[];
 for(const r of actions){
  const o=ownerOf(r.owner),code=norm(r.v[3]),date=recordDate(r);
  const qty=number(r.v[5]),amount=number(r.v[7]),kind=norm(r.v[2]),direction=norm(r.v[0]);
  if(!(qty>0)||!Number.isFinite(amount)||amount<0)continue;
  if(kind==='COMPRA'&&direction!=='CREDITO')continue;
  if(kind==='VENDA'&&direction!=='DEBITO')continue;
  const key=o+'|'+code;
  if(!stocks.has(key))stocks.set(key,{owner:o,code,qty:0,cost:0});
  const p=stocks.get(key);
  if(kind==='COMPRA'){p.qty+=qty;p.cost+=amount;}
  else{
   const prev=p.qty,covered=Math.min(qty,Math.max(0,prev)),cost=covered>0?p.cost*covered/prev:0;
   const missing=Math.max(0,qty-covered);
   const verified=missing<0.000001;
   sales.push({owner:o,code,date,profit:verified?amount-cost:null,recognized:verified,
    uncertain:!verified,covered,qty,gross:amount,unmatched:!verified,
    reason:verified?'':'Aquisição anterior do Tesouro não encontrada',group:'Tesouro'});
   if(!verified)problems.push({owner:o,code,qty:missing,date,reason:'Compra anterior do Tesouro ausente'});
   p.qty=Math.max(0,prev-covered);p.cost=Math.max(0,p.cost-cost);
   if(p.qty<0.000001){p.qty=0;p.cost=0;}
  }
 }
 return{stocks,sales,problems};
}

function makeHistoricalHoldings(led,owner){
 return Array.from(led.stocks.values()).filter(p=>p.owner===owner&&p.qty>0.00000001).map(p=>({
  owner,code:p.code,product:p.code,group:classify(p.code,''),qty:p.qty,
  value:Math.max(0,p.cost),unit:p.qty?p.cost/p.qty:0,origin:'estimated',
  institution:'Histórico B3',source:'Negociações B3'
 }));
}
function makeSnapshotHoldings(snapshot,owner){
 if(!snapshot||!Array.isArray(snapshot.rows)||!snapshot.rows.length)return null;
 return snapshot.rows.map(r=>{
  const code=tidy(r.code)||tidy(r.product),qty=number(r.qty),value=number(r.value);
  return{owner,code,product:tidy(r.product)||code,group:classify(code,r.group),qty:Number.isFinite(qty)?qty:0,
   value:Number.isFinite(value)?value:0,unit:qty?value/qty:0,origin:'position',
   institution:tidy(r.institution),source:tidy(snapshot.source)||'Posição B3',date:snapshot.date||'',groupRaw:r.group||'',applied:Number.isFinite(number(r.applied))?number(r.applied):null};
 }).filter(r=>r.qty>0&&r.value>=0);
}
function fixedIncomeHoldings(state,owner){
 const transactions=(state.fixedIncomeTransactions||[]).filter(t=>ownerOf(t.owner)===owner)
   .slice().sort((a,b)=>String(a.date).localeCompare(String(b.date))||String(a.id).localeCompare(String(b.id)));
 const balances=new Map();
 for(const tx of transactions){
  const key=String(tx.assetCode),amount=Number(tx.amount);
  if(!key||!(amount>0))continue;
  let p=balances.get(key);
  if(!p){p={owner,code:key,product:tx.product||key,group:'Renda fixa',institution:tx.institution||'',rate:tx.rate||'',maturity:tx.maturity||'',balance:0,date:tx.date,source:tx.source||'Registro manual'};balances.set(key,p);}
  p.balance+=tx.operation==='sell'?-amount:amount;
  p.date=tx.date;
 }
 return [...balances.values()].filter(x=>x.balance>0.005).map(x=>({
  owner,code:x.code,product:x.product,group:x.group,institution:x.institution,
  qty:1,value:Math.round(x.balance*100)/100,unit:Math.round(x.balance*100)/100,
  origin:'estimated',fixedIncome:true,applied:null,
  source:x.source,date:x.date,rate:x.rate,maturity:x.maturity
 }));
}
function portfolio(state,owner='family'){
 const owners=owner==='family'?['me','spouse']:[ownerOf(owner)],led=ledger(state,owner);
 const byPerson={},holdings=[];
 for(const p of owners){
  const snapshot=p==='spouse'?state.spousePositionSnapshot:state.positionSnapshot;
  const fromPosition=makeSnapshotHoldings(snapshot,p);
  const rows=[...(fromPosition||makeHistoricalHoldings(led,p)),...fixedIncomeHoldings(state,p)];
  rows.forEach(x=>{
   // Do not reprice Renda Fixa or unconfirmed positions.
   if(x.origin==='position'&&x.group!=='Tesouro'&&!x.fixedIncome){
    const q=state.quotes?.[x.code],price=Number(q?.price);
    const fetchedAge=Date.now()-Date.parse(q?.at||'');
    const marketAge=q?.marketDate?Date.now()-Date.parse(String(q.marketDate)+'T12:00:00Z'):null;
    const validSource=/brapi|capital agora/i.test(String(q?.provider||''));
    const validFetch=Number.isFinite(fetchedAge)&&fetchedAge>=0&&fetchedAge<=4*86400000;
    const validMarket=marketAge===null||(Number.isFinite(marketAge)&&marketAge>=-86400000&&marketAge<=8*86400000);
    if(validSource&&Number.isFinite(price)&&price>0&&validFetch&&validMarket){
     x.snapshotValue=x.value;x.value=Math.round(x.qty*price*100)/100;x.unit=price;
     x.origin='quote';x.quoteDate=q.marketDate||String(q.at).slice(0,10);x.quoteProvider=q.provider;
    }
   }
   holdings.push(x);
  });
  byPerson[p]={total:rows.reduce((n,x)=>n+x.value,0),count:rows.length,source:fromPosition?'position':'estimated',
    date:fromPosition?snapshot.date:null,unmatched:led.problems.filter(x=>x.owner===p).length};
 }
 holdings.sort((a,b)=>b.value-a.value);
 const total=holdings.reduce((n,x)=>n+x.value,0);
 const market=holdings.filter(x=>x.origin==='position'||x.origin==='quote').reduce((n,x)=>n+x.value,0);
 const estimated=total-market;
 const classes={};for(const h of holdings)classes[h.group]=(classes[h.group]||0)+h.value;
 return{owner,holdings,total,market,estimated,byPerson,classes,valuation:market>0&&estimated>0?'mixed':estimated>0?'historical':'position',
  confirmed:estimated===0&&holdings.length>0};
}
const DIVTYPES=new Set(['DIVIDENDO','RENDIMENTO','JUROS SOBRE CAPITAL PROPRIO','JCP']);
function dividendRows(state,owner){
 const owners=owner==='family'?['me','spouse']:[ownerOf(owner)];
 return state.records.filter(r=>r.t==='mov'&&owners.includes(ownerOf(r.owner))&&norm(r.v[0])==='CREDITO'&&(DIVTYPES.has(norm(r.v[2]))||(norm(r.v[2])==='JUROS'&&norm(r.v[3]).startsWith('TESOURO '))))
 .map(r=>({owner:ownerOf(r.owner),date:recordDate(r),amount:number(r.v[7]),code:codeOf(tidy(r.v[3]).split(' - ')[0]),type:tidy(r.v[2])}))
 .filter(r=>r.date&&Number.isFinite(r.amount)&&r.amount>=0);
}
function gains(state,owner='family',period='all',today=isoNow()){
 const from=cutoff(period,today),port=portfolio(state,owner),led=ledger(state,owner),bonds=treasuryLedger(state,owner);
 const sales=[...led.sales,...bonds.sales].filter(x=>x.date>=from&&x.date<=today);
 const recognizedSales=sales.filter(x=>x.recognized&&Number.isFinite(x.profit));
 const excludedSales=sales.filter(x=>!x.recognized);
 const payouts=dividendRows(state,owner).filter(x=>x.date>=from&&x.date<=today);
 const realized=roundMoney(recognizedSales.reduce((n,x)=>n+x.profit,0));
 const dividends=roundMoney(payouts.reduce((n,x)=>n+x.amount,0));
 let openGain=0,matched=0,missing=0,tesouroMatched=0,incomePending=0;
 for(const h of port.holdings){
  // Direitos de subscrição sem valor de mercado não são posições compradas nem lucro em aberto.
  if(h.value===0&&/^[A-Z]{4}1[23]$/.test(codeOf(h.code)))continue;
  if(h.fixedIncome){incomePending++;continue;} // Principal conhecido; juros desconhecidos não são falta de custo.
  if(h.origin!=='position'&&h.origin!=='quote'){missing++;continue;}
  if(h.group==='Tesouro'){
   // B3 position report contains Valor Aplicado for Tesouro Direto.
   // Value - applied is GROSS mark-to-market gain, not after taxes.
   if(Number.isFinite(h.applied)&&h.applied>0){
    matched++;tesouroMatched++;openGain+=h.value-h.applied;
   }else missing++;
   continue;
  }
  const basis=led.stocks.get(h.owner+'|'+codeOf(h.code));
  const tolerance=Math.max(.00001,.002*h.qty);
  if(!basis||basis.uncertain||basis.qty<=0||Math.abs(basis.qty-h.qty)>tolerance){missing++;continue;}
  matched++;openGain+=h.value-basis.cost;
 }
 openGain=roundMoney(openGain);
 const openAvailable=period==='all'&&matched>0;
 const openIncluded=openAvailable?openGain:0;
 const profit=roundMoney(realized+dividends+openIncluded);
 const unmatched=[...led.problems,...bonds.problems].filter(p=>p.date<=today);
 const missingWindow=period!=='all';
 const complete=port.holdings.length>0&&missing===0&&incomePending===0&&unmatched.length===0&&excludedSales.length===0&&period==='all';
 const monthly=new Map();
 const add=(date,key,amount)=>{
  if(!Number.isFinite(amount))return;
  const k=date.slice(0,7);if(!monthly.has(k))monthly.set(k,{month:k,realized:0,dividends:0});
  monthly.get(k)[key]+=amount;
 };
 recognizedSales.forEach(x=>add(x.date,'realized',x.profit));
 payouts.forEach(p=>add(p.date,'dividends',p.amount));
 const months=[...monthly.values()].sort((a,b)=>a.month.localeCompare(b.month));
 let warning='';
 if(excludedSales.length)warning=excludedSales.length+' venda(s) do período estão fora do lucro porque não há custo de aquisição completo. Consulte Pendências.';
 if(missing)warning+=(warning?' ':'')+missing+' posição(ões) sem valorização comprovada (inclusive renda fixa sem saldo atualizado); o ganho em aberto é parcial.';
 if(missingWindow)warning+=(warning?' ':'')+'A valorização das posições abertas nesse período não é calculada sem preços históricos comparáveis.';
 if(!warning&&unmatched.length)warning='Há eventos societários ou compras anteriores a conferir; o resultado acumulado pode estar incompleto.';
 return{
  owner,period,from,to:today,profit,realized,dividends,openGain:matched?openGain:null,
  openIncluded,openAvailable,matched,missing,incomePending,tesouroMatched,complete,partial:!complete,
  sales:recognizedSales.length,totalSales:sales.length,excludedSales:excludedSales.length,
  excludedGross:excludedSales.reduce((n,x)=>n+x.gross,0),
  payments:payouts.length,positions:port.holdings.length,
  capitalInvested:port.total,unmatched,monthly:months,warning
 };
}
function gaps(state,owner='family',today=isoNow()){
 const p=portfolio(state,owner),led=ledger(state,owner),items=[];
 const selected=owner==='family'?['me','spouse']:[ownerOf(owner)];
 for(const o of selected){
  const name=o==='spouse'?'sua esposa':'você',item=p.byPerson[o];
  const snapshot=o==='spouse'?state.spousePositionSnapshot:state.positionSnapshot;
  if(!snapshot?.rows?.length){
   items.push({level:'critical',owner:o,title:'Falta a Posição B3 de '+name,
    why:'Sem a Posição, a carteira exibe custo histórico, não valor atual de mercado.',
    action:'Baixe o relatório Posição na Área do Investidor da B3 para '+name+' e importe o Excel.',code:'missing-position'});
  }else if(snapshot.date&&today.slice(0,7)!==snapshot.date.slice(0,7)){
   items.push({level:'warning',owner:o,title:'Atualize a Posição B3 de '+name,
    why:'A última posição registrada é de '+dateBR(snapshot.date)+'.',
    action:'Baixe e importe uma nova Posição B3.',code:'old-position'});
  }
  // Ausência de operações em um ano é válida e não indica arquivo faltante.
  // Exigir histórico adicional apenas por lacunas comprovadas (como vendas sem compras).
  const unverified=[...led.sales,...treasuryLedger(state,o).sales].filter(x=>x.owner===o&&!x.recognized);
  if(unverified.length){
   const codes=[...new Set(unverified.map(x=>x.code))];
   items.push({level:'critical',owner:o,
    title:unverified.length+' vendas sem custo comprovado ('+name+')',
    why:'As operações dos ativos '+codes.slice(0,12).join(', ')+(codes.length>12?' e outros':'')+
     ' não podem ter lucro apurado sem uma compra anterior completa ou o custo atribuído em eventos societários. Essas vendas NÃO entram no resultado exibido.',
    action:'No histórico de Negociação e Movimentação B3 e nos extratos da corretora, confira a origem e o custo de aquisição desses códigos. Em bonificações, verifique o custo atribuído pelo emissor. Não é necessário trazer anos sem movimentações.',
    code:'unverified-sales'});
  }
  if(item&&item.source==='position'){
   const result=gains(state,o,'all',today);
   const otherMissing=Math.max(0,result.missing-p.holdings.filter(h=>h.owner===o&&h.fixedIncome).length);
   if(otherMissing)items.push({level:'warning',owner:o,title:'Conciliar custo médio de '+name,
    why:otherMissing+' posição(ões) ainda não têm custo ou valorização integralmente comprovados. Isso não significa necessariamente divergência de quantidade.',
    action:'Confira extratos de corretoras e eventos societários (desdobramento, grupamento, subscrição, transferência).',code:'cost-reconcile'});
  }
  const fixed=p.holdings.filter(h=>h.owner===o&&h.fixedIncome);
  if(fixed.length)items.push({level:'info',owner:o,title:'Renda fixa sem saldos atualizados ('+name+')',
   why:fixed.length+' aplicação(ões) com saldo líquido calculado apenas pelas compras e resgates. Juros e valor de resgate não são conhecidos.',
   action:'Consulte o saldo atualizado de RDB/LCI no banco ou extrato atual; não é necessário informar rendimentos estimados.',code:'fixed-income-current-value'});
 }
 items.push({level:'info',owner:'family',title:'Lucro financeiro completo entre corretoras e bancos',
  why:'A B3 mostra compras, vendas e proventos, mas não confirma todos os aportes, saques, saldo em trânsito e taxas bancárias.',
  action:'Para apurar também o resultado de caixa entre XP, bancos e Inter, obtenha extratos de transferências bancárias/corretoras. O lucro das operações B3 já é calculado automaticamente.',code:'cash-flow-coverage'});
 return items;
}
function parsePositionRows(rows){
 let index=-1;
 for(let i=0;i<Math.min(12,rows.length);i++){
  const h=(rows[i]||[]).map(norm);if(h[0]==='PRODUTO'&&h.includes('VALOR ATUALIZADO')&&h.includes('QUANTIDADE')){index=i;break;}
 }
 if(index<0)return null;
 const header=rows[index].map(norm),at=t=>header.indexOf(norm(t)),get=(r,t)=>at(t)<0?'':r[at(t)]??'';
 const group=at('Vencimento')>=0&&at('Código ISIN')>=0?'Tesouro Direto':at('Administrador')>=0?'Fundo de Investimento':'ETF';
 const items=[];let skipped=0;
 for(const row of rows.slice(index+1)){
  if(!row||!row.some(x=>tidy(x)))continue;
  const product=tidy(row[0]),q=number(get(row,'Quantidade')),v=number(get(row,'Valor Atualizado'));
  const candidate=tidy(get(row,group==='Tesouro Direto'?'Código ISIN':'Código de Negociação'));
  const valid=group==='Tesouro Direto'?(/^Tesouro /i.test(product)&&/^[A-Z0-9]{10,15}$/i.test(candidate)):
   (/^[A-Z]{4}[0-9]{2}$/i.test(candidate)&&product.toUpperCase().startsWith(candidate.toUpperCase()+' -'));
  // B3 workbook exports include footer repetitions such as "55|55|...|Total|72570".
  // They are NOT assets; never parse them as holdings.
  if(!valid||!(q>0)||!Number.isFinite(v)||v<0){skipped++;continue;}
  const code=group==='Tesouro Direto'?product:candidate;
  items.push({group,product,code,institution:tidy(get(row,'Instituição')),qty:q,value:v,
   price:number(get(row,'Preço de Fechamento'))||0,available:number(get(row,'Quantidade Disponível'))||0,
   maturity:tidy(get(row,'Vencimento')),indexer:tidy(get(row,'Indexador')),applied:number(get(row,'Valor Aplicado'))||0});
 }
 return{group,items,skipped};
}
function parseSheet(rows){
 const pos=parsePositionRows(rows);if(pos)return{kind:'position',rows:pos.items,skipped:pos.skipped,group:pos.group};
 for(let i=0;i<Math.min(12,rows.length);i++){
  const h=(rows[i]||[]).map(norm);
  let kind=null;
  if(h[0]===norm(NHEAD[0])&&h[5]===norm(NHEAD[5]))kind='trade';
  if(h[0]===norm(MHEAD[0])&&h[2]===norm(MHEAD[2]))kind='mov';
  if(!kind)continue;
  const result=[],invalid=[];
  for(let k=i+1;k<rows.length;k++){
   const row=rows[k];if(!row||!row.some(x=>tidy(x)))continue;
   const value=cleanRow(kind,row);
   if(rowValid(kind,value))result.push(value);
   else invalid.push(k+1);
  }
  return{kind,rows:result,invalid};
 }
 return null;
}
const uid=()=>root.crypto?.randomUUID?root.crypto.randomUUID():'id-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
async function importXlsx(state,owner,files,xlsx){
 const o=ownerOf(owner),input=Array.from(files||[]);
 if(!input.length)throw Error('Selecione um ou mais arquivos Excel.');
 if(input.some(f=>!/\.xlsx$/i.test(f.name||'')))throw Error('Aceito apenas Excel .xlsx exportado da B3.');
 if(!xlsx?.read)throw Error('Leitor de Excel indisponível.');
 const next=normalizeState(state),newRecords=[],positionByGroup=new Map(),details=[],filesStats=[];
 const existing=new Map();for(const r of next.records){const key=fingerprint(r.t,r.v,r.owner);existing.set(key,(existing.get(key)||0)+1);}
 const maxCounts=new Map(),byKey=new Map();let invalid=0,duplicates=0;
 for(const file of input){
   let sheets;try{sheets=await xlsx.read(file);}catch(err){throw Error(file.name+': '+(err.message||err));}
   let recognized=0,localAdds=0,localCount=new Map(),positionCount=0,invalidRows=0;
   for(const sheet of sheets){
     const parsed=parseSheet(sheet.rows||[]);if(!parsed)continue;
     recognized++;
     if(parsed.kind==='position'){
       invalidRows+=parsed.skipped||0;
       if(!positionByGroup.has(parsed.group))positionByGroup.set(parsed.group,[]);
       positionByGroup.get(parsed.group).push(...parsed.rows.map(r=>({...r,_file:file.name})));
       positionCount+=parsed.rows.length;continue;
     }
     invalidRows+=parsed.invalid?.length||0;
     for(const v of parsed.rows){
       const key=fingerprint(parsed.kind,v,o),n=(localCount.get(key)||0)+1;localCount.set(key,n);
       if(n>(maxCounts.get(key)||0)){
         maxCounts.set(key,n);
         if(!byKey.has(key))byKey.set(key,[]);
         byKey.get(key).push({id:uid(),owner:o,t:parsed.kind,v,source:file.name});
         localAdds++;
       }
     }
   }
   if(!recognized)throw Error(file.name+': estrutura não reconhecida. Exporte Negociação, Movimentação ou Posição da B3.');
   invalid+=invalidRows;
   filesStats.push({name:file.name,recognized,rows:localAdds,positions:positionCount,invalid:invalidRows});
 }
 // A single repeated trade can be legitimate. Keep its original occurrence count
 // within one export; imports from overlapping exports do not duplicate it again.
 for(const [key,count] of maxCounts){
   const old=existing.get(key)||0,add=Math.max(0,count-old);
   const proposed=byKey.get(key)||[];
   newRecords.push(...proposed.slice(Math.max(0,proposed.length-add)));
   duplicates+=Math.min(count,old);
 }
 // If a genuine B3 export later includes the ALZR11 2025 split, replace the
 // documented placeholder instead of counting the same 342 units twice.
 for(const r of newRecords){
  if(r.owner!=='spouse'||r.t!=='mov'||dateISO(r.v[1])<'2025-05-06'||dateISO(r.v[1])>'2025-05-09'||
    !['DESDOBRO','DESDOBRAMENTO'].includes(norm(r.v[2]))||
    codeOf(tidy(r.v[3]).split(' - ')[0])!=='ALZR11'||Math.abs(number(r.v[5])-342)>1e-8)continue;
  next.records=next.records.filter(old=>old.id!=='verified-alzr11-split-2025-05-06');
 }
 next.records.push(...newRecords);
 let positionsChanged=0;
 if(positionByGroup.size){
   const field=o==='spouse'?'spousePositionSnapshot':'positionSnapshot',before=next[field];
   const groups=new Set(positionByGroup.keys()),preserved=(before?.rows||[]).filter(r=>!groups.has(r.group));
   const latest=[];
   for(const [group,items] of positionByGroup){
     const seen=new Set();
     for(const r of items){const key=[r.group,r.code,r.institution,r.qty,r.value].join('|');if(seen.has(key))continue;seen.add(key);const row={...r};delete row._file;latest.push(row);}
   }
   const rows=preserved.concat(latest);
   const total=Math.round(rows.reduce((n,r)=>n+(number(r.value)||0),0)*100)/100;
   const date=isoNow(),source=input.map(f=>f.name).join(' + ');
   next[field]={date,rows,total,source,importedAt:new Date().toISOString(),groups:[...groups]};
   positionsChanged=latest.length;
   next.positionHistory=next.positionHistory.filter(r=>!(r.owner===o&&r.date===date)).concat([{date,owner:o,total,source,sourceType:'import-date'}]);
 }
 for(const f of filesStats)next.sources[(o==='spouse'?'Esposa · ':'Minha · ')+f.name]={
   type:f.positions?'position':'history',owner:o,accepted:f.rows,positions:f.positions,invalid:f.invalid,importedAt:new Date().toISOString()
 };
 return{next,summary:{owner:o,files:input.length,added:newRecords.length,duplicates,invalid,positionsChanged,details:filesStats}};
}
root.MoneyTrackerEngine={normalizeState,newState,portfolio,ledger,treasuryLedger,gains,gaps,cutoff,periodLabel,
 parseSheet,parsePositionRows,importXlsx,dateISO,dateBR,isoNow,fmt,money,norm,number,codeOf,recordDate,fingerprint,cleanRow,rowValid,dividendRows,classify,LABELS};
})(window);