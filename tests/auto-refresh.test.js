'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const listeners={},timers=[],saved=[],fetched=[];
const document={
 visibilityState:'visible',
 getElementById:id=>id==='mt7-auth'?{hidden:false}:null,
 addEventListener:(name,fn)=>{(listeners[name]??=[]).push(fn);},
 documentElement:{dataset:{theme:'dark'}},
 querySelector:()=>null
};
const localStore=new Map();
const root={
 localStorage:{getItem:k=>localStore.get(k)||null,setItem:(k,v)=>localStore.set(k,String(v))},
 setInterval:()=>1,
 addEventListener:(name,fn)=>{(listeners[name]??=[]).push(fn);},
 matchMedia:()=>({matches:false})
};
const context=vm.createContext({window:root,document,console,Date,Math,Intl,Number,String,Array,Map,Set,WeakMap,Object,JSON,RegExp,Error,
 setTimeout:(fn)=>{timers.push(fn);return timers.length;},clearTimeout:()=>{}});
for(const f of ['engine-v7.js','reconciliation-v7.js','calculation-v1.js','app-v8.js']){
 vm.runInContext(fs.readFileSync(f,'utf8'),context,{filename:f});
}
const E=root.MoneyTrackerEngine,C=root.MoneyTrackerCalculations,A=root.MoneyTrackerAppV7;
const iso=E.isoNow(),stamp=new Date(Date.now()-2*3600000).toISOString();
const s=E.newState();
s.positionSnapshot={date:iso,source:'B3',total:1500,rows:[
 {code:'DIVO11',group:'ETF',product:'DIVO11',qty:10,value:1000,price:100,institution:'B3'},
 {code:'BOVA11',group:'ETF',product:'BOVA11',qty:5,value:500,price:100,institution:'B3'}
]};
s.spousePositionSnapshot={date:iso,source:'B3',total:200,rows:[
 {code:'DIVO11',group:'ETF',product:'DIVO11',qty:2,value:200,price:100,institution:'B3'}
]};
s.quotes={
 DIVO11:{price:110,marketDate:iso,at:stamp,provider:'Yahoo Finance · B3 (.SA)'},
 BOVA11:{price:90,marketDate:iso,at:stamp,provider:'Yahoo Finance · B3 (.SA)'}
};
root.MoneyTrackerCloudV7={
 refreshIfChanged:async()=>false,
 quote:async ticker=>{
  fetched.push(ticker);
  return{symbol:ticker,price:ticker==='DIVO11'?120:95,marketDate:iso,at:new Date().toISOString(),provider:'Yahoo Finance · B3 (.SA)'};
 },
 scheduleSave:next=>saved.push(next)
};
A.setState(s);
assert.equal(C.calculate(A.getState(),'family').total,1770,'Old stored quotes');
A.loginReady();
assert(timers.length>0,'Initial automatic refresh scheduled');
(async()=>{
 timers.shift()();
 await new Promise(resolve=>setImmediate(resolve));
 await new Promise(resolve=>setImmediate(resolve));
 const current=A.getState();
 assert.deepEqual([...fetched].sort(),['BOVA11','DIVO11'],'Automatic refresh checked both symbols');
 assert.equal(current.quotes.DIVO11.price,120,'New price persisted into app');
 assert.equal(current.quotes.BOVA11.price,95,'New price persisted for other asset');
 assert.equal(C.calculate(current,'me').total,1675,'Samuel revalued');
 assert.equal(C.calculate(current,'spouse').total,240,'Jessica revalued');
 assert.equal(C.calculate(current,'family').total,1915,'Family revalued');
 assert.equal(saved.length,1,'One cloud save after batch refresh');
 assert.equal(saved[0].records.length,0,'No invented operations');
 assert.equal(localStore.has('moneytracker-quotes-autorefresh-v271'),true,'Throttle recorded');
 assert.equal((listeners.focus||[]).length,1,'Rechecks on app focus');
 assert.equal((listeners.visibilitychange||[]).length,1,'Rechecks on tab return');
 const source=fs.readFileSync('supabase/functions/moneytracker-quotes/index.ts','utf8');
 assert(source.includes('Promise.allSettled(sources.map(s=>s.query))'),'Quote service checks independent providers');
 assert(source.includes('offers.sort((a,b)=>String(b.marketDate).localeCompare(String(a.marketDate))'),'Quote service prefers newer dates');
 console.log('PASS: automated quotes reprice individuals/family, sync to cloud, and prefer newest provider.');
})().catch(e=>{console.error(e);process.exitCode=1;});
