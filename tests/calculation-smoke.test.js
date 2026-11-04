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
console.log('PASS: base, preços, quantidades, titulares, classes, fontes, filtros e integridade.');
