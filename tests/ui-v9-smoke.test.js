'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const handlers={};
const box={innerHTML:''},auth={hidden:false};
const document={
 visibilityState:'visible',
 getElementById:id=>id==='mt7-app'?box:id==='mt7-auth'?auth:null,
 addEventListener:(event,fn)=>{(handlers[event]??=[]).push(fn);},
 documentElement:{dataset:{theme:'dark'}},querySelector:()=>null
};
const stored=new Map();
const root={
 localStorage:{getItem:k=>stored.get(k)||null,setItem:(k,v)=>stored.set(k,v)},
 scrollTo:()=>{},setTimeout:()=>{},clearTimeout:()=>{}
};
const context=vm.createContext({window:root,document,console,Date,Math,Intl,Number,String,Array,Map,Set,WeakMap,Object,JSON,RegExp,Error,setTimeout:()=>{},clearTimeout:()=>{}});
for(const name of ['engine-v7.js','reconciliation-v7.js','calculation-v1.js','app-v9.js'])
 vm.runInContext(fs.readFileSync(name,'utf8'),context,{filename:name});
const E=root.MoneyTrackerEngine,C=root.MoneyTrackerCalculations,A=root.MoneyTrackerAppV7,U=A.getUi(),iso=E.isoNow();
assert.equal(U.page,'home');
assert(box.innerHTML.includes('MoneyTracker'),'Home must render');
const position=(code,qty,value,group)=>({code,group,product:code,qty,value,price:value/qty,institution:'B3'});
const state=E.newState();
state.positionSnapshot={date:iso,rows:[position('DIVO11',10,1000,'ETF'),position('BOVA11',5,500,'ETF')],total:1500};
state.spousePositionSnapshot={date:iso,rows:[position('DIVO11',2,200,'ETF')],total:200};
state.fixedIncomeTransactions=[{id:'test-rf',owner:'me',assetCode:'RF-LCI-TEST',product:'LCI',operation:'buy',amount:300,date:iso}];
state.quotes={DIVO11:{price:110,provider:'Yahoo Finance',marketDate:iso,at:new Date().toISOString()},BOVA11:{price:90,provider:'Yahoo Finance',marketDate:iso,at:new Date().toISOString()}};
A.setState(state);
assert.equal(C.calculate(A.getState(),'family').total,2070);
assert(box.innerHTML.includes('2.070,00'),'Shows combined patrimonio on home');
assert(box.innerHTML.includes('Samuel e Jessica'),'Shows people comparison');
const screens=['home','portfolio','result','ai','more','asset','sale','income','compare','needs','history','import','quotes'];
for(const page of screens){
 U.page=page;A.render();
 assert(box.innerHTML.includes('mt9-bottom'),'Mobile nav stays available on '+page);
 assert(!box.innerHTML.includes('Não foi possível exibir esta tela'),'Screen renders: '+page);
}
U.owner='me';U.page='portfolio';U.classe='ETFs';A.render();
assert(box.innerHTML.includes('BOVA11'),'Assets rendered in portfolio');
assert(!box.innerHTML.includes('MXRF11'),'No incorrect FII placeholder');
handlers.click[0]({target:{closest:()=>({dataset:{nav:'result'}})}});
assert.equal(U.classe,'all','Hidden class filter cleared after leaving portfolio');
assert.equal(U.page,'result','Navigation works');
for(const p of ['30','90','1y','5y','all']){
 U.period=p;A.render();
 assert(!box.innerHTML.includes('Não foi possível exibir esta tela'),'Period works: '+p);
}
assert.equal(E.classify('TAEE11',''),'Units');
assert.equal(E.classify('BOVA11',''),'ETF');
assert.equal(E.classify('MXRF11',''),'FII');
assert.equal(E.classify('ZZZZ11',''),'Outros');
console.log('PASS: 13 views, people, period filters, persistent navigation, B3 classification, sums and navigation isolation.');
