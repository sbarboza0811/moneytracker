'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const root={};
const context=vm.createContext({window:root,console,Date,Math,Number,String,Array,Map,Set,WeakMap,Object,JSON,RegExp,Error,Intl,crypto:globalThis.crypto});
for(const file of ['engine-v7.js','reconciliation-v7.js','calculation-v1.js']){
 vm.runInContext(fs.readFileSync(file,'utf8'),context,{filename:file});
}
const E=root.MoneyTrackerEngine,C=root.MoneyTrackerCalculations;
const date=E.isoNow(),now=new Date().toISOString();
const position=(code,qty,value)=>({code,product:code+' - ETF',group:'ETF',institution:'B3',qty,value,price:value/qty,available:qty,applied:0});
const s=E.newState();
s.positionSnapshot={date,rows:[position('DIVO11',10,1000),position('BOVA11',5,500)],total:1500,source:'B3 Samuel'};
s.spousePositionSnapshot={date,rows:[position('DIVO11',2,200)],total:200,source:'B3 Jessica'};
s.fixedIncomeTransactions=[{id:'fixed-1',owner:'me',assetCode:'RF-LCI-TEST',product:'LCI',operation:'buy',amount:300,date}];
s.quotes={
 DIVO11:{price:110,provider:'Yahoo Finance',marketDate:date,at:now},
 BOVA11:{price:90,provider:'Yahoo Finance',marketDate:date,at:now}
};
const me=C.calculate(s,'me'),spouse=C.calculate(s,'spouse'),family=C.calculate(s,'family');
assert.equal(me.total,1850,'Samuel');
assert.equal(spouse.total,220,'Jessica');
assert.equal(family.total,2070,'Família');
assert.equal(family.sources.b3,1700,'B3 oficial');
assert.equal(family.sources.quotes,70,'Variação das cotações');
assert.equal(family.sources.bank,300,'LCI fora da B3');
assert.equal(family.sources.total,family.total,'Fonte e total iguais');
assert.equal(family.rollup.owners.me.value,me.total,'Duas carteiras separadas');
assert.equal(family.rollup.owners.spouse.value,spouse.total,'Esposa separada');
assert(family.checks.find(x=>x.id==='family-total')?.ok,'Checagem das carteiras');
assert.equal(C.calculate(s,'me'),me,'Cache consistente');
const etfs=C.view(s,{owner:'family',className:'ETFs'});
assert.equal(etfs.total,1770,'Filtro classe não inclui LCI');
assert.equal(etfs.sources.bank,0,'Renda fixa fora do filtro');
const q2=E.normalizeState({...s,quotes:{...s.quotes,DIVO11:{...s.quotes.DIVO11,price:120}}});
assert.equal(C.calculate(q2,'me').total,1950,'Recalcula preço individual');
assert.equal(C.calculate(q2,'spouse').total,240,'Recalcula mesmo ativo de Jessica');
assert.equal(C.calculate(q2,'family').total,2190,'Recalcula família');
assert.equal(me.total,1850,'Não modifica versão anterior');
const pos2=E.normalizeState({...s,positionSnapshot:{...s.positionSnapshot,rows:[position('DIVO11',11,1100),position('BOVA11',5,500)],total:1600}});
assert.equal(C.calculate(pos2,'me').total,1960,'Recalcula quantidade');
assert.equal(C.calculate(pos2,'spouse').total,220,'Não altera o outro titular');
assert.equal(C.calculate(pos2,'family').total,2180,'Soma após quantidade');
const historyView=C.view(s,{owner:'me',from:'2020-01-01',to:'2020-12-31'});
assert.equal(historyView.total,1850,'Filtro histórico não altera avaliação atual');
const br=E.dateBR(date);
const withOperations=E.normalizeState({...s,records:[
 {id:'purchase-1',owner:'me',t:'trade',v:[br,'Compra','Vista','','XP','DIVO11',15,90,1350]},
 {id:'sale-1',owner:'me',t:'trade',v:[br,'Venda','Vista','','XP','DIVO11',5,100,500]},
 {id:'income-1',owner:'me',t:'mov',v:['Credito',br,'Rendimento','DIVO11 - ETF','XP',10,3,30]}
]});
const book=C.calculate(withOperations,'me');
assert.equal(book.realized,50,'Venda recalculada com custo médio');
assert.equal(book.dividends,30,'Provento incluído uma vez');
assert.equal(book.openGain.gain,200,'Lucro em aberto sem misturar venda');
assert.equal(C.calculate(withOperations,'family').realized,50,'Lucro da família');
assert.equal(C.calculate(withOperations,'family').dividends,30,'Provento da família');
assert(book.checks.find(x=>x.id==='realized')?.ok,'Auditoria de vendas');
const withRight=E.normalizeState({...s,spousePositionSnapshot:{...s.spousePositionSnapshot,
 rows:[...s.spousePositionSnapshot.rows,{code:'ALZR12',group:'Fundo de Investimento',product:'Direito ALZR12',qty:330,value:0,institution:'B3'}]}});
const rights=C.calculate(withRight,'spouse');
assert.equal(rights.openGain.missing,spouse.openGain.missing,'Direito de subscrição com valor zero não adiciona pendência de custo');
assert(rights.checks.every(x=>x.ok),'Direito com valor zero não quebra auditorias');
assert.equal(rights.total,spouse.total,'Direito zerado não aumenta patrimônio');
assert(!rights.holdings.some(h=>h.code==='ALZR12'),'Direitos não aparecem como posições');
const pricedRight=E.normalizeState({...s,
 spousePositionSnapshot:{...s.spousePositionSnapshot,rows:[...s.spousePositionSnapshot.rows,
  {code:'ALZR12',group:'Fundo de Investimento',product:'ALZR12 - Direito de subscrição',qty:100,value:200,price:2,institution:'B3'}]},
 quotes:{...s.quotes,ALZR12:{price:3,provider:'Yahoo Finance',marketDate:date,at:now}}
});
const excl=C.calculate(pricedRight,'family');
assert.equal(excl.total,family.total,'Direitos positivos e cotações não entram no patrimônio');
assert(!excl.holdings.some(h=>h.code==='ALZR12'),'Direitos positivos não aparecem na carteira');
assert(!('Direitos' in excl.rollup.classes),'Categoria Direitos fora da alocação');
assert(excl.checks.every(x=>x.ok),'Auditoria continua consistente após exclusão');
for(const code of ['BTLG12','KNCR12','XPML12','BCFF13','IRBR1']){
 assert(E.isSubscriptionRight(code,'Fundo de Investimento','Produto sem a palavra direito'),code+' é direito/recibo B3 confirmado');
}
assert(E.isSubscriptionEvent('Cessão de Direitos'),'Cessão escondida mesmo sem sufixo convencional');
assert(E.isSubscriptionEvent('Recibo de Subscrição'),'Recibo escondido');
assert(!E.isSubscriptionEvent('Transferência - Liquidação'),'Liquidação normal preservada');
assert.equal(E.classify('TAEE11',''),'Units','Units continuam visíveis');
assert.equal(E.classify('BOVA11',''),'ETF','ETFs continuam visíveis');
assert(E.isSubscriptionRight('ZZZZ12','Direito de Subscrição',''),'Metadado explicito identifica direito desconhecido');
assert(!E.isSubscriptionRight('BOVA11','ETF',''),'Sufixo 11 não indica direito');
const rightTrades=E.normalizeState({...s,records:[
 {id:'right-buy',owner:'spouse',t:'trade',v:[br,'Compra','Vista','','XP','ALZR12',10,2,20]},
 {id:'right-sell',owner:'spouse',t:'trade',v:[br,'Venda','Vista','','XP','ALZR12',10,3,30]}
]});
const rightResult=C.calculate(rightTrades,'spouse');
assert.equal(rightResult.realized,0,'Venda de direito excluída do lucro');
assert.equal(rightResult.dividends,0,'Direito excluído dos proventos');
assert(rightResult.checks.every(x=>x.ok),'Vendas de direitos não geram divergências');
const repriced=E.normalizeState({...withOperations,quotes:{...withOperations.quotes,DIVO11:{...withOperations.quotes.DIVO11,price:120}}});
const afterReprice=C.calculate(repriced,'me');
assert.equal(afterReprice.openGain.gain,300,'Reprecificação afeta lucro aberto');
assert.equal(afterReprice.realized,50,'Reprecificação não altera vendas passadas');
assert.equal(afterReprice.dividends,30,'Reprecificação não altera proventos pagos');

// The final "11" does not identify the security category.
for(const [ticker,category] of [
 ['AUVP11','ETF'],['IMAB11','ETF'],['BOVA11','ETF'],
 ['TAEE11','Units'],['SAPR11','Units'],['BIDI11','Units'],
 ['MXRF11','FII'],['BTLG11','FII'],['ALZR12','Direitos'],
 ['ZZZZ11','Outros']
]){
 assert.equal(E.classify(ticker,''),category,ticker+' must have verified category');
}
assert.equal(E.classify('FUTR11','ETF'),'ETF','Explicit exchange category for future ETF');
assert.equal(E.classify('FUTR11','Fundo de Investimento'),'Fundos','Generic fund title does not prove FII');
assert.equal(C.classLabel('TAEE11',''),'Units','Units are not FIIs');
assert.equal(C.classLabel('ALZR12','Fundo de Investimento'),'Direitos','Subscription rights are not FIIs');

console.log('PASS: preços, quantidades, vendas, proventos, custo, família, classes, Units, FIIs, ETFs, filtros e auditorias.');
