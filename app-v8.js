(function(root){
'use strict';
const E=root.MoneyTrackerEngine;
if(!E)throw Error('Motor financeiro indisponível');
let S=E.newState(),auth=false,busy=false,toastTimer=null,analysis=null,derivedCache=null;
const U={page:'home',owner:'family',period:'1y',from:'',to:'',classe:'all',grain:'month',compare:'owners',search:'',sort:'value',importOwner:'me',assetKey:'',saleId:'',historyKind:'all',limit:70,importMessage:''};
const NAV=[['home','⌂','Início'],['portfolio','▦','Carteira'],['result','↗','Resultados'],['compare','⇄','Comparar'],['flow','◷','Fluxo'],['needs','✓','Diagnóstico']];
const money=E.money,fmt=E.fmt;
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const round=v=>Math.round((Number(v)||0)*100)/100;
const el=id=>document.getElementById(id);
const me=o=>String(S.displayNames?.[o]||({me:'Samuel',spouse:'Jessica',family:'Todos'}[o])||o);
const today=()=>E.isoNow();
const toNumber=s=>Number(s)||0;
function scope(){const to=U.period==='custom'?(U.to||today()):today(),from=U.period==='custom'?(U.from||'1900-01-01'):U.period==='all'?'1900-01-01':E.cutoff(U.period,to);return{from,to};}
function inRange(d){const r=scope();return !!d&&d>=r.from&&d<=r.to;}
function group(code,raw){
 const g=String(raw||'');if(g==='Renda fixa')return 'Renda fixa';
 if(/tesouro/i.test(g)||/^Tesouro /i.test(code))return 'Tesouro';
 if(g==='ETF'||g==='ETFs')return 'ETFs';
 if(g==='FII'||g==='FIIs')return 'FIIs';
 if(g==='Ações / BDRs'||g==='Ações')return 'Ações';
 const c=E.classify(code,g);
 return c==='ETF'?'ETFs':c==='FII'?'FIIs':c==='Ações / BDRs'?'Ações':c==='Tesouro'?'Tesouro':c==='Fundos'?'Fundos':'Outros';
}
function initialData(o){
 if(derivedCache&&derivedCache.state===S&&derivedCache.owner===o)return derivedCache.data;
 const p=E.portfolio(S,o),d=E.profitBreakdown?E.profitBreakdown(S,o,'all'):null,
 ledger=E.ledger(S,o),g=E.gains(S,o,'all'),data={p,d,ledger,g};
 derivedCache={state:S,owner:o,data};return data;
}
function rows(){
 const z=initialData(U.owner),r=scope();
 const holdings=z.p.holdings.filter(h=>U.classe==='all'||group(h.code,h.group)===U.classe);
 const rawSales=(z.d?.sales||[]).filter(s=>s.date>=r.from&&s.date<=r.to&&(U.classe==='all'||group(s.code,s.group)===U.classe));
 const payouts=(z.d?.payouts||E.dividendRows(S,U.owner)).filter(x=>x.date>=r.from&&x.date<=r.to&&(U.classe==='all'||group(x.code,x.group)===U.classe));
 const recognized=rawSales.filter(x=>x.recognized&&Number.isFinite(Number(x.profit)));
 const saleProfit=round(recognized.reduce((n,x)=>n+Number(x.profit),0)),div=round(payouts.reduce((n,x)=>n+Number(x.amount),0));
 const total=round(holdings.reduce((n,h)=>n+Number(h.value||0),0));
 return {...z,holdings,sales:rawSales,payouts,realized:saleProfit,dividends:div,total,openGain:openGain(holdings,z.ledger),excluded:rawSales.length-recognized.length};
}
function basisFor(h,ledger){
 if(h.fixedIncome)return{cost:h.value,verified:false,nominal:true,reason:'Principal conhecido, juros não informados'};
 if(h.group==='Tesouro'||group(h.code,h.group)==='Tesouro'){
  if(Number.isFinite(+h.applied)&&+h.applied>0)return{cost:+h.applied,verified:true};
  return{cost:null,verified:false,reason:'Sem valor aplicado'};
 }
 if(h.origin!=='position'&&h.origin!=='quote')return{cost:null,verified:false,reason:'Sem cotação atual'};
 const a=ledger.stocks.get(h.owner+'|'+E.codeOf(h.code));
 if(a&&!a.uncertain&&a.qty>0&&Math.abs(a.qty-h.qty)<=Math.max(.00001,.002*h.qty))return{cost:a.cost,verified:true};
 const b=S.reconciliation?.positionBasis?.[E.codeOf(h.code)];
 if(b&&b.owner===h.owner&&Math.abs(Number(b.qty)-h.qty)<.0001&&Number(b.unitCost)>0)return{cost:h.qty*Number(b.unitCost),verified:true};
 return{cost:null,verified:false,reason:'Custo ainda não conciliado'};
}
function openGain(holdings,ledger){
 const a=holdings.map(h=>({...basisFor(h,ledger),h})),complete=a.filter(x=>x.verified),unknown=a.filter(x=>!x.verified&&!x.nominal),nominal=a.filter(x=>x.nominal);
 return{gain:round(complete.reduce((n,x)=>n+x.h.value-x.cost,0)),cost:round(complete.reduce((n,x)=>n+x.cost,0)),missing:unknown.length,incomePending:nominal.length,nominalValue:round(nominal.reduce((n,x)=>n+x.h.value,0)),matched:complete.length};
}
function monthly(sales,payouts,from,to){
 const map=new Map();
 function add(d,key,value){const k=d.slice(0,7);if(!map.has(k))map.set(k,{date:k,sales:0,dividends:0});map.get(k)[key]+=Number(value)||0;}
 for(const s of sales)if(s.recognized&&Number.isFinite(+s.profit))add(s.date,'sales',s.profit);
 for(const p of payouts)add(p.date,'dividends',p.amount);
 const end=(to||today()).slice(0,7),start=from==='1900-01-01'?(Array.from(map.keys()).sort()[0]||end):from.slice(0,7);
 const first=new Date(start+'-01T12:00:00Z'),last=new Date(end+'-01T12:00:00Z'),arr=[];
 if(!Number.isFinite(first.getTime())||!Number.isFinite(last.getTime()))return[];
 for(let y=first.getUTCFullYear(),m=first.getUTCMonth(),i=0;i<240;i++){
  const k=y+'-'+String(m+1).padStart(2,'0');
  if(k>end)break;
  arr.push(map.get(k)||{date:k,sales:0,dividends:0});
  m++;if(m===12){y++;m=0;}
 }
 return arr;
}
function getMonths(data){const s=scope();return monthly(data.sales,data.payouts,s.from,s.to);}
function box(content,extra=''){return '<section class="m8-panel '+extra+'">'+content+'</section>';}
function header(title,subtitle='',action=''){return '<div class="m8-section-head"><div><h2>'+escape(title)+'</h2>'+(subtitle?'<p>'+escape(subtitle)+'</p>':'')+'</div>'+action+'</div>';}
function badge(s,type='neutral'){return '<span class="m8-badge '+type+'">'+escape(s)+'</span>';}
function iconStat(label,value,hint,tone,nav){return '<button class="m8-metric tone-'+(tone||'blue')+'" data-nav="'+(nav||'portfolio')+'"><span>'+escape(label)+'</span><strong>'+escape(value)+'</strong><small>'+escape(hint||'')+'</small></button>';}
function action(label,page,secondary=false){return '<button class="m8-btn '+(secondary?'sub':'primary')+'" data-nav="'+page+'">'+escape(label)+' <span>›</span></button>';}
function empty(msg){return '<div class="m8-empty"><span>◇</span><p>'+escape(msg)+'</p></div>';}
function barChart(list,mode='month',onlyDiv=false){
 const data=mode==='year'?Object.values(list.reduce((a,r)=>{const k=r.date.slice(0,4);if(!a[k])a[k]={date:k,sales:0,dividends:0};a[k].sales+=r.sales;a[k].dividends+=r.dividends;return a;},{})):list;
 if(!data.length)return empty('Sem vendas ou proventos neste intervalo.');
 const w=Math.max(670,data.length*49),h=250,x0=40,baseline=135;
 const peak=Math.max(1,...data.flatMap(v=>[Math.abs(v.sales),Math.abs(v.dividends)])),factor=105/peak;
 const cols=data.map((r,i)=>{const x=x0+(i+.5)*(w-80)/data.length,sv=onlyDiv?0:r.sales,dv=r.dividends;
  const a=Math.abs(sv)*factor,b=Math.abs(dv)*factor;
  const aRect=onlyDiv?'':'<rect x="'+(x-16)+'" y="'+(sv>=0?baseline-a:baseline)+'" width="14" height="'+Math.max(1,a)+'" rx="3" fill="'+(sv<0?'#ec7185':'#12b99a')+'"><title>'+escape(r.date)+' · Vendas '+money(sv)+'</title></rect>';
  return '<g data-month="'+escape(r.date)+'" role="button" tabindex="0" aria-label="Ver operações de '+escape(r.date)+'">'+aRect+'<rect x="'+(x+(onlyDiv?-7:3))+'" y="'+(baseline-b)+'" width="14" height="'+Math.max(1,b)+'" rx="3" fill="#5f83f3"><title>'+escape(r.date)+' · Proventos '+money(dv)+'</title></rect><text x="'+x+'" y="230" fill="#7d8da9" font-size="11" text-anchor="middle">'+escape(mode==='year'?r.date:r.date.slice(5))+'</text></g>';
 }).join('');
 return '<div class="m8-plot"><svg viewBox="0 0 '+w+' '+h+'" width="'+w+'" height="250" aria-label="Gráfico de resultados '+(mode==='month'?'mensais':'anuais')+'"><line x1="38" y1="'+baseline+'" x2="'+(w-24)+'" y2="'+baseline+'" stroke="#bac7d9"/><line x1="38" y1="30" x2="'+(w-24)+'" y2="30" stroke="#ebeff8" stroke-dasharray="4 5"/><line x1="38" y1="80" x2="'+(w-24)+'" y2="80" stroke="#ebeff8" stroke-dasharray="4 5"/>'+cols+'</svg></div><div class="m8-legend"><span><i style="background:#12b99a"></i>Lucro nas vendas</span><span><i style="background:#ec7185"></i>Prejuízo</span><span><i style="background:#5f83f3"></i>Proventos</span></div><p class="m8-hint">Clique em um mês ou ano para filtrar as operações.</p>';
}
const PALETTE=['#5078ee','#20b99b','#9d78e4','#f2ab62','#ef7d91','#48b8db','#7e8aa7','#d3b65d'];
function donut(items,total){
 if(!total)return empty('Sem valores nas classes selecionadas.');
 let pct=0;const css=items.filter(x=>x.value>0).map((x,i)=>{const start=pct;pct+=x.value/total*100;return PALETTE[i%PALETTE.length]+' '+start.toFixed(2)+'% '+pct.toFixed(2)+'%';}).join(',');
 return '<div class="m8-donut-box"><div class="m8-donut" style="background:conic-gradient('+css+')" aria-label="Distribuição patrimonial"><div><span>Posições</span><strong>'+money(total)+'</strong></div></div><div class="m8-donut-legend">'+items.filter(x=>x.value>0).map((x,i)=>'<button class="m8-legend-row" data-class="'+escape(x.name)+'"><i style="background:'+PALETTE[i%PALETTE.length]+'"></i><span>'+escape(x.name)+'</span><b>'+(100*x.value/total).toFixed(1).replace('.',',')+'%</b></button>').join('')+'</div></div>';
}
function alloc(d){const m=new Map();for(const h of d.holdings){const k=group(h.code,h.group);m.set(k,(m.get(k)||0)+Number(h.value||0));}return [...m].map(([name,value])=>({name,value})).sort((a,b)=>b.value-a.value);}
function assetRow(h,d){
 const b=basisFor(h,d.ledger),gain=b.verified?money(h.value-b.cost):'—';
 return '<button class="m8-asset-row" data-asset="'+escape(h.owner+'|'+h.code)+'"><span class="m8-token">'+escape(h.fixedIncome?'RF':h.code.slice(0,2))+'</span><span class="m8-asset-title"><strong>'+escape(h.code)+'</strong><small>'+escape(me(h.owner))+' · '+escape(group(h.code,h.group))+(h.fixedIncome?' · Saldo nominal':'')+'</small></span><span class="m8-asset-money"><strong>'+money(h.value)+'</strong><small class="'+(b.verified?'positive':'muted')+'">'+gain+'</small></span><b>›</b></button>';
}
function kpi(d){return '<div class="m8-kpis">'+iconStat('Patrimônio representado',money(d.total),d.holdings.length+' posições · valores de fontes diferentes','blue','portfolio')+iconStat('Resultado realizado',money(d.realized+d.dividends),'Vendas + proventos do período','teal','result')+iconStat('Proventos',money(d.dividends),d.payouts.length+' pagamentos','violet','income')+iconStat('Valorização apurada',d.openGain.matched?money(d.openGain.gain):'—',d.openGain.missing+' posições sem valorização','orange','flow')+'</div>';}
function trendPositions(){
 const owners=U.owner==='family'?['me','spouse']:[U.owner],raw=(S.positionHistory||[]).filter(x=>owners.includes(x.owner)&&x.date&&Number.isFinite(+x.total)).slice();
 for(const [o,f] of [['me','positionSnapshot'],['spouse','spousePositionSnapshot']]){
  if(!owners.includes(o))continue;
  const x=S[f];if(x?.rows?.length&&!raw.some(r=>r.owner===o&&r.date===x.date))raw.push({owner:o,date:x.date,total:Number(x.total)});
 }
 const dates=[...new Set(raw.map(x=>x.date))].filter(inRange).sort(),points=[];
 for(const date of dates){
  const vals=owners.map(o=>raw.filter(x=>x.owner===o&&x.date<=date).sort((a,b)=>a.date.localeCompare(b.date)).at(-1));
  if(vals.every(Boolean))points.push({date,value:vals.reduce((n,x)=>n+Number(x.total),0)});
 }
 return points;
}
function lineChart(points,format='money'){
 if(points.length<2)return empty('Não há pelo menos duas posições históricas comparáveis neste período. Importe novas posições B3 para formar esta curva, sem estimar dados.');
 const w=Math.max(640,points.length*38),h=232,pad=31,vals=points.map(x=>x.value),min=Math.min(...vals),max=Math.max(...vals),span=Math.max(1,max-min),
 x=i=>pad+i*(w-2*pad)/(points.length-1),y=v=>h-pad-(v-min)*(h-2*pad)/span;
 const path=points.map((r,i)=>(i?'L':'M')+x(i).toFixed(1)+' '+y(r.value).toFixed(1)).join(' ');
 const circles=points.map((r,i)=>'<circle cx="'+x(i)+'" cy="'+y(r.value)+'" r="3.7" fill="#4b77ed" stroke="#fff" stroke-width="1.5"><title>'+escape(r.date)+' · '+(format==='money'?money(r.value):r.value.toFixed(2)+'%')+'</title></circle>').join('');
 return '<div class="m8-plot"><svg width="'+w+'" height="'+h+'" viewBox="0 0 '+w+' '+h+'" aria-label="Evolução dos valores registrados"><defs><linearGradient id="m8area" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#567af3" stop-opacity=".20"/><stop offset="100%" stop-color="#567af3" stop-opacity="0"/></linearGradient></defs><path d="'+path+' L'+x(points.length-1)+' '+(h-pad)+' L'+pad+' '+(h-pad)+'Z" fill="url(#m8area)"/><path d="'+path+'" fill="none" stroke="#5078ee" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>'+circles+'<text x="'+pad+'" y="'+(h-5)+'" fill="#8593a8" font-size="11">'+escape(E.dateBR(points[0].date))+'</text><text x="'+(w-pad)+'" y="'+(h-5)+'" text-anchor="end" fill="#8593a8" font-size="11">'+escape(E.dateBR(points.at(-1).date))+'</text></svg></div>';
}
function dataNotice(d){
 if(d.p.valuation==='mixed')return '<div class="m8-notice">ℹ️ A visão reúne valores de mercado e posições estimadas. Não considere o total uma cotação atual de todos os ativos.</div>';
 if(d.p.valuation==='historical')return '<div class="m8-notice">ℹ️ Algumas posições estão avaliadas pelo custo histórico, não pelo preço de mercado.</div>';
 return '';
}

function purchaseFlows(){
 const d=rows(),r=scope(),map=new Map(),owners=U.owner==='family'?['me','spouse']:[U.owner];
 function add(date,kind,amount){
  if(!date||date<r.from||date>r.to||!(Number(amount)>0))return;
  const key=date.slice(0,7),row=map.get(key)||{date:key,invested:0,redeemed:0,profit:0};
  row[kind]+=Number(amount);map.set(key,row);
 }
 for(const t of S.records||[]){
  if(!owners.includes(t.owner||'me'))continue;
  const date=E.recordDate(t),v=t.v||[];
  if(t.t==='trade'&&E.norm(v[1])==='COMPRA'){
   const cls=group(v[5],v[2]);if(U.classe==='all'||cls===U.classe)add(date,'invested',E.number(v[8]));
  }else if(t.t==='mov'&&E.norm(v[2])==='COMPRA'&&E.norm(v[0])==='CREDITO'&&/^TESOURO /i.test(v[3]||'')){
   if(U.classe==='all'||U.classe==='Tesouro')add(date,'invested',E.number(v[7]));
  }
 }
 for(const t of S.fixedIncomeTransactions||[]){
  if(!owners.includes(t.owner))continue;
  if(U.classe!=='all'&&U.classe!=='Renda fixa')continue;
  add(t.date,t.operation==='sell'?'redeemed':'invested',t.amount);
 }
 for(const t of d.sales)if(t.recognized&&Number.isFinite(+t.profit)){
  const key=t.date.slice(0,7),row=map.get(key)||{date:key,invested:0,redeemed:0,profit:0};row.profit+=Number(t.profit);map.set(key,row);
 }
 for(const t of d.payouts){
  const key=t.date.slice(0,7),row=map.get(key)||{date:key,invested:0,redeemed:0,profit:0};row.profit+=Number(t.amount);map.set(key,row);
 }
 return [...map.values()].sort((a,b)=>a.date.localeCompare(b.date));
}
function wealthGroup(data){
 if(U.grain!=='year')return data;
 const m=new Map();for(const x of data){
  const key=x.date.slice(0,4),r=m.get(key)||{date:key,invested:0,redeemed:0,profit:0};
  for(const field of ['invested','redeemed','profit'])r[field]+=Number(x[field]||0);
  m.set(key,r);
 }return [...m.values()].sort((a,b)=>a.date.localeCompare(b.date));
}
function barsInvestedProfit(){
 const all=wealthGroup(purchaseFlows()),limit=U.grain==='year'?18:30,values=all.slice(-limit);
 const topSum=all.reduce((o,r)=>({invested:o.invested+r.invested,redeemed:o.redeemed+r.redeemed,profit:o.profit+r.profit}),{invested:0,redeemed:0,profit:0});
 const labels='<div class="m8-wealth-kpis">'+
 '<div><small>Compras e aplicações</small><strong>'+money(topSum.invested)+'</strong></div>'+
 '<div><small>Lucro realizado</small><strong class="'+(topSum.profit<0?'negative':'positive')+'">'+money(topSum.profit)+'</strong></div>'+
 '<div><small>Resgates de renda fixa</small><strong>'+money(topSum.redeemed)+'</strong></div></div>';
 if(!all.length)return labels+empty('Não há compras, aplicações ou lucro realizado no período selecionado.');
 const w=Math.max(670,values.length*60),height=274,top=32,base=191,bottom=236;
 const maxPos=Math.max(1,...values.map(x=>Math.max(x.invested,x.profit,0))),maxNeg=Math.max(1,...values.map(x=>Math.abs(Math.min(x.profit,0)))),posScale=137/maxPos,negScale=38/maxNeg;
 const rects=values.map((v,i)=>{
  const x=39+(i+.5)*(w-78)/values.length,hi=Math.max(v.invested?1:0,v.invested*posScale),hp=v.profit>=0?Math.max(v.profit?1:0,v.profit*posScale):Math.max(1,-v.profit*negScale);
  const buys='<rect x="'+(x-19)+'" y="'+(base-hi)+'" width="16" height="'+hi+'" rx="3" fill="#5a7ef1"><title>'+escape(v.date)+' · Aplicações '+money(v.invested)+'</title></rect>';
  const gains='<rect x="'+(x+3)+'" y="'+(v.profit>=0?base-hp:base)+'" width="16" height="'+hp+'" rx="3" fill="'+(v.profit<0?'#e36b80':'#14b99b')+'"><title>'+escape(v.date)+' · Resultado '+money(v.profit)+'</title></rect>';
  return '<g role="button" tabindex="0" data-month="'+escape(v.date)+'" aria-label="Abrir operações de '+escape(v.date)+'">'+buys+gains+
    '<text x="'+x+'" y="251" text-anchor="middle" fill="#8593aa" font-size="11">'+escape(U.grain==='year'?v.date:v.date.slice(5)+'/'+v.date.slice(2,4))+'</text></g>';
 }).join('');
 return labels+'<div class="m8-plot"><svg width="'+w+'" height="'+height+'" viewBox="0 0 '+w+' '+height+'" role="img" aria-label="Aplicações e lucro realizado comparados por '+(U.grain==='year'?'ano':'mês')+'"><line x1="25" y1="'+base+'" x2="'+(w-25)+'" y2="'+base+'" stroke="#b8c5da"/><line x1="25" y1="70" x2="'+(w-25)+'" y2="70" stroke="#e9eef8" stroke-dasharray="3 5"/>'+rects+'</svg></div>'+
 '<div class="m8-legend"><span><i style="background:#5a7ef1"></i>Compras/aplicações</span><span><i style="background:#14b99b"></i>Lucro realizado</span><span><i style="background:#e36b80"></i>Prejuízo realizado</span></div>'+
 (all.length>limit?'<p class="m8-hint">Exibindo '+limit+' períodos recentes; os totais acima abrangem todo o intervalo filtrado.</p>':'')+
 '<p class="m8-hint">Compras são movimentações registradas, não necessariamente dinheiro novo. Lucro é o resultado de vendas conciliadas mais proventos. Não representa patrimônio de mercado.</p>';
}
function confirmedWealthData(){
 const owners=U.owner==='family'?['me','spouse']:[U.owner],d=initialData(U.owner),r=scope();
 const snapshots=[];
 for(const o of owners){
  const snap=S[o==='spouse'?'spousePositionSnapshot':'positionSnapshot'];
  if(!snap?.rows?.length||!snap.date||snap.date<r.from||snap.date>r.to)continue;
  const holdings=d.p.holdings.filter(h=>h.owner===o&&['position','quote'].includes(h.origin)&&(U.classe==='all'||group(h.code,h.group)===U.classe));
  let invested=0,gain=0,unknown=0;
  for(const h of holdings){
   const basis=basisFor(h,d.ledger);
   if(basis.verified){invested+=basis.cost;gain+=h.value-basis.cost;}
   else unknown+=h.value;
  }
  snapshots.push({date:snap.date,invested:round(invested),profit:round(gain),unknown:round(unknown),n:holdings.length});
 }
 const map=new Map();
 for(const v of snapshots){
  const key=U.grain==='year'?v.date.slice(0,4):v.date.slice(0,7);
  const row=map.get(key)||{date:key,invested:0,profit:0,unknown:0,n:0};
  row.invested+=v.invested;row.profit+=v.profit;row.unknown+=v.unknown;row.n+=v.n;map.set(key,row);
 }
 return [...map.values()].sort((a,b)=>a.date.localeCompare(b.date));
}
function barsConfirmedWealth(){
 const data=confirmedWealthData();
 if(!data.length)return empty('Não existe posição B3 com valores e custos disponíveis no período. Uma série patrimonial mensal exige posições importadas de outros meses.');
 const values=data, w=Math.max(520,values.length*130),h=246,base=185;
 const max=Math.max(1,...values.map(r=>Math.abs(r.invested)+Math.max(0,r.profit)+r.unknown)),scale=142/max;
 const cols=values.map((v,i)=>{
  const x=36+(i+.5)*(w-72)/values.length,ci=Math.max(0,v.invested*scale),gain=Math.abs(v.profit)*scale,unk=Math.max(0,v.unknown*scale);
  const total=v.invested+v.profit+v.unknown;
  return '<g data-month="'+escape(v.date)+'" role="button" tabindex="0" aria-label="Visualizar posição '+escape(v.date)+'">'+
   '<rect x="'+(x-24)+'" y="'+(base-ci)+'" width="18" height="'+Math.max(0,ci)+'" rx="3" fill="#587aea"><title>Custo conciliado '+money(v.invested)+'</title></rect>'+
   '<rect x="'+(x-2)+'" y="'+(v.profit>=0?base-gain:base)+'" width="18" height="'+Math.max(gain,v.profit?1:0)+'" rx="3" fill="'+(v.profit<0?'#e36b80':'#16b99a')+'"><title>Valorização apurada '+money(v.profit)+'</title></rect>'+
   '<rect x="'+(x+20)+'" y="'+(base-unk)+'" width="18" height="'+Math.max(0,unk)+'" rx="3" fill="#b4c0d6"><title>Valor sem custo conciliado '+money(v.unknown)+'</title></rect>'+
   '<text x="'+(x+6)+'" y="218" text-anchor="middle" fill="#7b8ca5" font-size="12">'+escape(U.grain==='year'?v.date:v.date.slice(5)+'/'+v.date.slice(2,4))+'</text>'+
   '<text x="'+(x+6)+'" y="24" text-anchor="middle" fill="#394c70" font-size="12" font-weight="650">'+escape(money(total))+'</text></g>';
 }).join('');
 return '<div class="m8-plot"><svg width="'+w+'" height="'+h+'" viewBox="0 0 '+w+' '+h+'" role="img" aria-label="Custo, valorização e parcela sem custo das posições B3"><line x1="24" y1="'+base+'" x2="'+(w-24)+'" y2="'+base+'" stroke="#b8c5da"/>'+cols+'</svg></div>'+
 '<div class="m8-legend"><span><i style="background:#587aea"></i>Investido (custo conhecido)</span><span><i style="background:#16b99a"></i>Lucro em aberto</span><span><i style="background:#e36b80"></i>Prejuízo em aberto</span><span><i style="background:#b4c0d6"></i>Sem custo conciliado</span></div>'+
 '<p class="m8-hint">Apenas datas com relatório de posição B3 disponível. Os investimentos bancários sem saldo atualizado não aparecem neste gráfico. Não criamos meses ou anos sem dados.</p>';
}
function wealthDashboard(large=false){
 const buttons='<div class="m8-pills"><button data-grain="month" class="'+(U.grain==='month'?'sel':'')+'">Mensal</button><button data-grain="year" class="'+(U.grain==='year'?'sel':'')+'">Anual</button></div>';
 const hasOperations=purchaseFlows().length>0,hasSnapshots=confirmedWealthData().length>0;
 const flow=hasOperations?box(header('Investimentos × lucro realizado', 'Barras por '+(U.grain==='year'?'ano':'mês')+' · filtradas por titular, classe e período')+buttons+barsInvestedProfit(),'m8-wealth-major'):'';
 const confirmed=hasSnapshots?box(header('Patrimônio: investido × valorização','Somente datas com posição e custo disponíveis')+buttons+barsConfirmedWealth(),'m8-wealth-minor'):'';
 if(!flow&&!confirmed)return '';
 return '<section class="m8-wealth-dashboard">'+(large?flow+confirmed:'<div class="m8-grid m8-wealth-grid">'+flow+confirmed+'</div>')+'</section>';
}

function pageHome(){
 const d=rows(),m=getMonths(d);
 return kpi(d)+dataNotice(d)+wealthDashboard()+
 '<div class="m8-grid m8-two">'+box(header('Distribuição da carteira','Selecione uma classe para explorar')+donut(alloc(d),d.total))+
 box(header('Maiores posições','Acesse um ativo para ver suas operações',action('Carteira completa','portfolio',true))+d.holdings.slice().sort((a,b)=>b.value-a.value).slice(0,6).map(h=>assetRow(h,d)).join(''))+'</div>'+
 (m.some(x=>Math.abs(x.sales)+Math.abs(x.dividends)>.000001)?box(header('Lucros e proventos mensais','Resultado realizado sem ganhos em aberto',action('Ver resultados','result',true))+barChart(m.length>24?m.slice(-24):m,U.grain)):'');
}
function pagePortfolio(){
 const d=rows(),classes=alloc(d);let sorted=d.holdings.slice();
 const q=U.search.toLowerCase();if(q)sorted=sorted.filter(h=>(h.code+' '+h.product+' '+h.institution).toLowerCase().includes(q));
 sorted.sort((a,b)=>U.sort==='name'?a.code.localeCompare(b.code):U.sort==='gain'?((basisFor(b,d.ledger).verified?b.value-basisFor(b,d.ledger).cost:-Infinity)-(basisFor(a,d.ledger).verified?a.value-basisFor(a,d.ledger).cost:-Infinity)):b.value-a.value);
 return kpi(d)+dataNotice(d)+'<div class="m8-grid m8-two">'+box(header('Alocação por classe','Clique para filtrar o restante da carteira')+donut(classes,d.total))+
 box(header('Valor por classe','Comparação dos saldos atuais')+'<div class="m8-classbars">'+classes.map((c,i)=>'<button data-class="'+escape(c.name)+'" class="m8-classbar"><span>'+escape(c.name)+'</span><div><i style="background:'+PALETTE[i%PALETTE.length]+';width:'+Math.max(1,100*c.value/Math.max(1,classes[0]?.value))+'%"></i></div><strong>'+money(c.value)+'</strong></button>').join('')+'</div>')+'</div>'+
 box(header('Explorador de ativos',sorted.length+' posições no filtro atual')+
 '<div class="m8-row m8-wrap"><input id="m8-search" class="m8-input m8-grow" placeholder="Buscar código, ativo ou instituição" value="'+escape(U.search)+'"/>'+
 '<select class="m8-input" data-select="sort"><option value="value" '+(U.sort==='value'?'selected':'')+'>Maior valor</option><option value="gain" '+(U.sort==='gain'?'selected':'')+'>Maior ganho</option><option value="name" '+(U.sort==='name'?'selected':'')+'>Nome A-Z</option></select></div>'+
 (sorted.length?sorted.slice(0,U.limit).map(h=>assetRow(h,d)).join(''):empty('Nenhuma posição encontrada.'))+
 (sorted.length>U.limit?'<button class="m8-btn sub" data-action="more">Carregar mais ativos</button>':''))+
 box(header('Renda fixa','Aplicações cadastradas e resgates informados')+fixedPanel(d));
}
function fixedPanel(d){
 const list=(S.fixedIncomeTransactions||[]).filter(x=>U.owner==='family'||x.owner===U.owner).slice().sort((a,b)=>b.date.localeCompare(a.date));
 if(!list.length)return empty('Nenhum lançamento manual de RDB ou LCI para este titular.');
 const net=list.reduce((n,x)=>n+(x.operation==='sell'?-Number(x.amount):Number(x.amount)),0);
 return '<p><strong>'+money(net)+'</strong> líquidos aplicados conforme os lançamentos. Não inclui juros.</p>'+
 list.slice(0,10).map(x=>'<div class="m8-tx"><div><b>'+escape(x.product)+'</b><small>'+escape(me(x.owner))+' · '+E.dateBR(x.date)+' · '+(x.operation==='sell'?'Resgate':'Aplicação')+'</small></div><strong class="'+(x.operation==='sell'?'negative':'positive')+'">'+(x.operation==='sell'?'-':'+')+money(x.amount)+'</strong></div>').join('');
}
function pageResult(){
 const d=rows(),m=getMonths(d),view=U.resultView||'overview',g=new Map(),perAsset=new Map();
 for(const s of d.sales){
  const cls=group(s.code,s.group);
  if(!g.has(cls))g.set(cls,{name:cls,profit:0,gross:0,cost:0,count:0,unknown:0});
  const v=g.get(cls);v.count++;v.gross+=Number(s.gross)||0;
  if(s.recognized&&Number.isFinite(+s.profit)){v.profit+=Number(s.profit);v.cost+=Number(s.gross)-Number(s.profit);}
  else v.unknown++;
  const key=s.owner+'|'+s.code,asset=perAsset.get(key)||{key,code:s.code,owner:s.owner,profit:0,count:0,unknown:0};
  asset.count++;if(s.recognized)asset.profit+=Number(s.profit)||0;else asset.unknown++;
  perAsset.set(key,asset);
 }
 const groups=[...g.values()].sort((a,b)=>Math.abs(b.profit)-Math.abs(a.profit));
 const sales=d.sales.slice().sort((x,y)=>y.date.localeCompare(x.date)),payouts=d.payouts.slice().sort((x,y)=>y.date.localeCompare(x.date));
 const valid=sales.filter(s=>s.recognized&&Number.isFinite(+s.profit)),
 gross=round(valid.reduce((n,s)=>n+Number(s.gross||0),0)),
 costs=round(gross-d.realized),
 gainReturn=costs>0?100*d.realized/costs:null;
 const nav='<div class="m8-result-nav">'+[['overview','Visão geral'],['sales','Vendas detalhadas'],['income','Proventos']].map(([id,label])=>'<button data-result-view="'+id+'" class="'+(view===id?'active':'')+'">'+label+'</button>').join('')+'</div>';
 const summary='<div class="m8-result-summary">'+
 '<div><small>Resultado realizado</small><strong class="'+(d.realized+d.dividends<0?'negative':'positive')+'">'+money(d.realized+d.dividends)+'</strong><span>Vendas conciliadas + proventos</span></div>'+
 '<div><small>Lucro/prejuízo em vendas</small><strong class="'+(d.realized<0?'negative':'positive')+'">'+money(d.realized)+'</strong><span>'+valid.length+' operações com custo</span></div>'+
 '<div><small>Proventos recebidos</small><strong>'+money(d.dividends)+'</strong><span>'+payouts.length+' pagamentos</span></div>'+
 '<div><small>Rentabilidade das vendas*</small><strong>'+(gainReturn===null?'—':gainReturn.toFixed(2).replace('.',',')+'%')+'</strong><span>Lucro / custo das vendas</span></div></div>';
 const notice=d.excluded?'<div class="m8-notice">'+d.excluded+' venda(s) sem custo comprovado não entram no lucro exibido. Consulte Diagnóstico para conferir.</div>':'';
 const chart=m.some(x=>Math.abs(x.sales)+Math.abs(x.dividends)>.000001)?
  box(header('Evolução do resultado','Vendas e proventos '+(U.grain==='year'?'anuais':'mensais')+' · clique numa barra para filtrar')+
   '<div class="m8-pills"><button data-grain="month" class="'+(U.grain==='month'?'sel':'')+'">Mensal</button><button data-grain="year" class="'+(U.grain==='year'?'sel':'')+'">Anual</button></div>'+barChart(m,U.grain),'m8-results-graph'):'';
 const classPanel=groups.length?box(header('Lucro/prejuízo por classe','Selecione uma classe para filtrar os resultados')+
  groups.map(x=>'<button class="m8-class-result" data-class="'+escape(x.name)+'"><span><b>'+escape(x.name)+'</b><small>'+x.count+' vendas · vendido '+money(x.gross)+(x.unknown?' · '+x.unknown+' sem custo':'')+'</small></span><strong class="'+(x.profit<0?'negative':'positive')+'">'+money(x.profit)+'</strong><span>›</span></button>').join('')):'';
 const assetGroups=[...perAsset.values()].sort((x,y)=>Math.abs(y.profit)-Math.abs(x.profit));
 const assetPanel=assetGroups.length?box(header('Ativos que geraram resultado','Ranking das vendas do período')+
  assetGroups.slice(0,10).map(x=>'<div class="m8-tx"><div><b>'+escape(x.code)+'</b><small>'+escape(me(x.owner))+' · '+x.count+' vendas'+(x.unknown?' · '+x.unknown+' a conciliar':'')+'</small></div><strong class="'+(x.profit<0?'negative':'positive')+'">'+money(x.profit)+'</strong></div>').join('')):'';
 const salePanel=sales.length?box(header('Operações de venda','Clique para visualizar custo médio e compras anteriores')+
  sales.slice(0,view==='sales'?U.limit:8).map(saleRow).join('')+
  (view==='sales'&&sales.length>U.limit?'<button class="m8-btn sub" data-action="more">Carregar mais vendas</button>':'')+
  (view==='overview'&&sales.length>8?action('Ver todas as vendas','result',true):'')):'';
 const incomePanel=payouts.length?box(header('Proventos recebidos','Pagamentos identificados no intervalo')+
  payouts.slice(0,view==='income'?U.limit:8).map(p=>'<div class="m8-tx"><div><b>'+escape(p.code)+'</b><small>'+escape(me(p.owner))+' · '+E.dateBR(p.date)+' · '+escape(p.type)+'</small></div><strong>'+money(p.amount)+'</strong></div>').join('')+
  (view==='income'&&payouts.length>U.limit?'<button class="m8-btn sub" data-action="more">Carregar mais</button>':'')+
  (view==='overview'&&payouts.length>8?action('Ver proventos','income',true):'')):'';
 if(view==='sales')return nav+summary+notice+(sales.length?'<div class="m8-grid m8-two">'+salePanel+classPanel+'</div>':box('<p>Não houve vendas no período selecionado.</p>'));
 if(view==='income')return nav+summary+(incomePanel||box('<p>Não foram encontrados proventos neste período.</p>'))+chart;
 return nav+summary+notice+chart+
 (classPanel||assetPanel?'<div class="m8-grid m8-two">'+classPanel+assetPanel+'</div>':'')+
 (salePanel||incomePanel?'<div class="m8-grid m8-two">'+salePanel+incomePanel+'</div>':'')+
 '<p class="m8-hint">*Rentabilidade sobre o custo das vendas identificadas, não retorno percentual da carteira inteira. Valorização em aberto não está incluída.</p>';
}

function saleRow(s){
 return '<button class="m8-tx click" data-sale="'+escape(s.owner+'|'+s.code+'|'+s.date+'|'+s.qty+'|'+s.gross)+'"><span><b>'+escape(s.code)+' <small>· '+escape(me(s.owner))+'</small></b><small>'+E.dateBR(s.date)+' · vendido '+money(s.gross)+' · custo '+(s.recognized?money(s.cost):'não comprovado')+'</small></span><strong class="'+(s.recognized?(s.profit<0?'negative':'positive'):'muted')+'">'+(s.recognized?money(s.profit):'Não apurado')+'</strong></button>';
}
function pageIncome(){
 const d=rows(),m=getMonths(d);
 return '<div class="m8-kpis">'+iconStat('Proventos recebidos',money(d.dividends),d.payouts.length+' créditos','violet','income')+
 iconStat('Titular',me(U.owner),'Alterável no filtro global','blue','income')+'</div>'+
 (d.payouts.length?box(header('Evolução dos proventos','Por mês ou ano')+'<div class="m8-pills"><button data-grain="month" class="'+(U.grain==='month'?'sel':'')+'">Mensal</button><button data-grain="year" class="'+(U.grain==='year'?'sel':'')+'">Anual</button></div>'+barChart(m,U.grain,true)):'')+
 box(header('Pagamentos individuais',d.payouts.length+' proventos no intervalo')+(d.payouts.length?d.payouts.slice().sort((a,b)=>b.date.localeCompare(a.date)).slice(0,U.limit).map(x=>'<div class="m8-tx"><div><b>'+escape(x.code)+'</b><small>'+escape(me(x.owner))+' · '+E.dateBR(x.date)+' · '+escape(x.type)+'</small></div><strong>'+money(x.amount)+'</strong></div>').join(''):empty('Nenhum provento neste período.'))+
 (d.payouts.length>U.limit?'<button class="m8-btn sub" data-action="more">Carregar mais</button>':''));
}
function compareTrend(parts,from,to){
 const byOwner=parts.map(p=>monthly(p.sales,p.div,from,to));
 const data=byOwner[0].map((r,i)=>({date:r.date,a:r.sales+r.dividends,b:(byOwner[1][i]?.sales||0)+(byOwner[1][i]?.dividends||0)}));
 if(!data.length||!data.some(r=>Math.abs(r.a)+Math.abs(r.b)>.000001))return '';
 const visible=data.slice(-24),w=Math.max(700,visible.length*46),h=245,baseline=135;
 const max=Math.max(1,...visible.flatMap(p=>[Math.abs(p.a),Math.abs(p.b)])),scale=95/max;
 const rects=visible.map((p,i)=>{
  const x=38+(i+.5)*(w-80)/visible.length;
  const draw=(value,dx,color)=>'<rect x="'+(x+dx)+'" y="'+(value>=0?baseline-Math.abs(value)*scale:baseline)+'" width="14" height="'+Math.max(.8,Math.abs(value)*scale)+'" rx="3" fill="'+color+'"><title>'+escape(p.date)+' · '+money(value)+'</title></rect>';
  return '<g data-month="'+escape(p.date)+'" role="button" tabindex="0">'+draw(p.a,-15,'#5478ec')+draw(p.b,3,'#16b89e')+'<text x="'+x+'" y="227" text-anchor="middle" fill="#8b99b0" font-size="10">'+escape(p.date.slice(5))+'</text></g>';
 }).join('');
 return '<div class="m8-plot"><svg width="'+w+'" height="'+h+'" viewBox="0 0 '+w+' '+h+'" aria-label="Comparação de resultados mensais reais dos titulares"><line x1="36" y1="'+baseline+'" x2="'+(w-25)+'" y2="'+baseline+'" stroke="#c3d0e2"/>'+rects+'</svg></div>'+
 '<div class="m8-legend"><span><i style="background:#5478ec"></i>'+escape(parts[0].name)+'</span><span><i style="background:#16b89e"></i>'+escape(parts[1].name)+'</span></div><p class="m8-hint">Lucro/prejuízo de vendas conciliadas somado aos proventos, sem valorização em aberto. Clique em um mês para explorar operações.</p>';
}
function pageCompare(){
 const x=initialData('me'),y=initialData('spouse'),r=scope();
 const parts=[['me',x],['spouse',y]].map(([o,z])=>{
  const sales=(z.d?.sales||[]).filter(s=>s.date>=r.from&&s.date<=r.to&&(U.classe==='all'||group(s.code,s.group)===U.classe));
  const div=(z.d?.payouts||[]).filter(p=>p.date>=r.from&&p.date<=r.to&&(U.classe==='all'||group(p.code,p.group)===U.classe));
  const p=z.p.holdings.filter(h=>U.classe==='all'||group(h.code,h.group)===U.classe);
  return{owner:o,name:me(o),value:p.reduce((n,h)=>n+h.value,0),sales,div,realized:sales.filter(s=>s.recognized).reduce((n,s)=>n+Number(s.profit||0),0),dividends:div.reduce((n,p)=>n+Number(p.amount||0),0),holdings:p};
 });
 const m=U.compare==='years'?'year':U.grain,totals=parts.map(z=>({name:z.name,value:z.value}));
 const curr=U.compare==='owners'?totals:U.compare==='classes'?alloc(rows()):Object.values(monthly(rows().sales,rows().payouts,r.from,r.to).reduce((z,t)=>{const key=t.date.slice(0,4);if(!z[key])z[key]={year:key,result:0};z[key].result+=t.sales+t.dividends;return z;},{})).map(x=>({name:x.year,value:x.result}));
 return box(header('Laboratório de comparações','Mesmo período e critérios para os dois lados')+
 '<div class="m8-pills"><button data-compare="owners" class="'+(U.compare==='owners'?'sel':'')+'">Samuel × Jessica</button><button data-compare="classes" class="'+(U.compare==='classes'?'sel':'')+'">Classes de ativos</button><button data-compare="years" class="'+(U.compare==='years'?'sel':'')+'">Ano contra ano</button></div>'+
 '<div class="m8-compare">'+curr.map((z,i)=>'<div><small>'+escape(z.name)+'</small><strong>'+money(z.value)+'</strong><div class="m8-track"><i style="width:'+Math.min(100,Math.max(0,z.value)*100/Math.max(1,...curr.map(t=>t.value)))+'%;background:'+PALETTE[i%PALETTE.length]+'"></i></div></div>').join('')+'</div>'+
 (U.compare==='owners'?compareTrend(parts,r.from,r.to):'')+
 '<p class="m8-hint">'+(U.compare==='years'?'Comparação do resultado bruto realizado por ano, sem valorização em aberto.':U.compare==='classes'?'Distribuição atual por classe, não rentabilidade histórica.':'Valores de posições de cada titular podem ter bases de avaliação diferentes. Não equivalem à rentabilidade corrigida por aportes.')+'</p>')+
 '<div class="m8-grid m8-two">'+box(header('Resultado realizado', 'Vendas e proventos separados por titular')+
 parts.map(p=>'<div class="m8-compare-line"><b>'+escape(p.name)+'</b><span>Vendas '+money(p.realized)+'</span><span>Proventos '+money(p.dividends)+'</span><strong>'+money(p.realized+p.dividends)+'</strong></div>').join(''))+
 box(header('Cobertura da comparação','Disponibilidade dos dados')+
 '<div class="m8-notice">Rentabilidade percentual rigorosa exige histórico de posição e fluxo de aportes/retiradas. O app não apresenta percentuais artificiais de retorno.</div>'+
 action('Ver fontes e pendências','needs',true))+'</div>';
}
function pageFlow(){
 const d=rows(),unknown=d.holdings.filter(h=>!basisFor(h,d.ledger).verified&&!h.fixedIncome).reduce((n,h)=>n+h.value,0);
 const changes=d.openGain,bank=d.holdings.filter(h=>h.fixedIncome);
 return '<div class="m8-kpis">'+iconStat('Patrimônio representado',money(d.total),'Valores atuais e nominais','blue','portfolio')+
 iconStat('Custo conciliado',money(changes.cost),changes.matched+' posições avaliadas','orange','flow')+
 iconStat('Valorização identificada',changes.matched?money(changes.gain):'—','Ganho em aberto onde calculável','teal','result')+
 iconStat('Renda fixa nominal',money(changes.nominalValue),changes.incomePending+' aplicações sem juros atualizados','violet','portfolio')+'</div>'+
 wealthDashboard(true)+
 (unknown>0?box(header('Valores sem custo conciliado','Posições que ainda exigem base documental')+'<p><strong>'+money(unknown)+'</strong> em '+changes.missing+' posição(ões).</p>'):'')+
 box(header('Dinheiro novo × reinvestimento','O que conseguimos afirmar com os dados disponíveis')+
 '<div class="m8-notice">Compras de ativos e aplicações de renda fixa não representam necessariamente dinheiro novo. Para calcular aportes líquidos, precisamos conhecer depósitos externos, transferências e saques. O gráfico de aplicações mostra apenas operações de compra identificadas, e não depósitos confirmados.</div>'+
 (bank.length?'<p class="m8-hint">RDB e LCI: '+money(changes.nominalValue)+' de principal líquido registrado em '+bank.length+' aplicação(ões). Os juros não foram inventados nem registrados como lucro ou pendência de custo.</p>':'')) ;
}
function analyze(){analysis={state:S,owner:U.owner,issues:E.gaps(S,U.owner),at:new Date().toISOString()};}
function pageNeeds(){
 if(!analysis||analysis.state!==S||analysis.owner!==U.owner)analyze();
 const d=rows(),issues=analysis.issues||[],critical=issues.filter(x=>x.level==='critical').length,warning=issues.filter(x=>x.level==='warning').length;
 return '<div class="m8-kpis">'+iconStat('Avisos críticos',String(critical),'Calculados dos dados atuais','rose','needs')+
 iconStat('Pontos de atenção',String(warning),'Sem exigência de anos vazios','orange','needs')+
 iconStat('Vendas sem lucro apurado',String(d.excluded),'Fora do resultado','violet','result')+
 iconStat('Posições não avaliadas',String(d.openGain.missing),'Custo ou preço indisponível','blue','portfolio')+'</div>'+
 box(header('Diagnóstico automático','Análise recalculada a partir da base atual','<button class="m8-btn primary" data-action="analyze">↻ Analisar agora</button>')+
 '<p class="m8-hint">Análise de '+new Date(analysis.at).toLocaleString('pt-BR')+'. A lista não é um cadastro fixo de pendências.</p>'+
 (issues.length?issues.map(x=>'<div class="m8-issue"><span class="'+(x.level==='critical'?'critical':x.level==='warning'?'warning':'info')+'">'+(x.level==='critical'?'!':x.level==='warning'?'⚠':'i')+'</span><div><b>'+escape(x.title)+'</b><p>'+escape(x.why||'')+'</p><small>'+escape(x.action||'')+'</small></div></div>').join(''):empty('Nenhuma pendência detectada pelas regras atuais.')))+
 box(header('Onde corrigir os dados','Importações são reconciliadas automaticamente')+action('Importar relatório B3','import')+' '+action('Ver histórico','history',true));
}
function pageAsset(){
 const d=initialData(U.owner),h=d.p.holdings.find(a=>a.owner+'|'+a.code===U.assetKey);
 if(!h)return box(empty('Ativo não encontrado no titular atual.')+action('Voltar à carteira','portfolio',true));
 const b=basisFor(h,d.ledger),fixed=(S.fixedIncomeTransactions||[]).filter(t=>t.owner===h.owner&&t.assetCode===h.code);
 const trades=(S.records||[]).filter(r=>r.owner===h.owner&&(r.t==='trade'?E.codeOf(r.v[5])===E.codeOf(h.code):E.codeOf(String(r.v[3]).split(' - ')[0])===E.codeOf(h.code))).sort((a,b)=>E.recordDate(b).localeCompare(E.recordDate(a)));
 const sales=(d.d?.sales||[]).filter(s=>s.owner===h.owner&&E.codeOf(s.code)===E.codeOf(h.code));
 return '<button class="m8-back" data-nav="portfolio">← Voltar à carteira</button>'+
 '<div class="m8-feature"><span>'+escape(me(h.owner))+' · '+escape(group(h.code,h.group))+'</span><h2>'+escape(h.product||h.code)+'</h2><strong>'+money(h.value)+'</strong><small>'+(h.fixedIncome?'Saldo nominal sem juros':'Valor da posição conforme fonte disponível')+'</small></div>'+
 '<div class="m8-kpis">'+iconStat('Custo',b.cost!==null?money(b.cost):'—',b.reason||'Base identificada','blue','asset')+
 iconStat('Valorização',b.verified?money(h.value-b.cost):'—',b.verified?'Diferença bruto':'Não apurada','teal','asset')+
 iconStat('Instituição',h.institution||'Não informada',h.fixedIncome?h.rate||'':h.source||'','violet','asset')+'</div>'+
 box(header('Operações e eventos',fixed.length+trades.length+' movimentos registrados')+
 (fixed.length?fixed.slice().sort((a,b)=>b.date.localeCompare(a.date)).map(t=>'<div class="m8-tx"><div><b>'+escape(t.operation==='sell'?'Resgate':'Aplicação')+'</b><small>'+E.dateBR(t.date)+' · '+escape(t.rate)+'</small></div><strong>'+money(t.amount)+'</strong></div>').join(''):'')+
 trades.slice(0,50).map(r=>'<div class="m8-tx"><div><b>'+escape(r.t==='trade'?r.v[1]:r.v[2])+'</b><small>'+E.dateBR(E.recordDate(r))+' · '+escape(r.v[4]||'')+'</small></div><strong>'+money(Number(r.v[r.t==='trade'?8:7]))+'</strong></div>').join('')+
 (!fixed.length&&!trades.length?empty('Nenhuma operação vinculada.'):'') )+
 (sales.length?box(header('Vendas e lucro','Clique para ver a apuração')+sales.slice(0,30).map(saleRow).join('')):'')+
 (!h.fixedIncome?box(header('Cotação consultada','Apenas cotações disponíveis do provedor')+'<p>'+(S.quotes?.[h.code]?money(S.quotes[h.code].price):'Sem cotação consultada')+'</p><button class="m8-btn sub" data-quote="'+escape(h.code)+'">Consultar</button>'):'');
}
function pageSale(){
 const d=initialData(U.owner),s=(d.d?.sales||[]).find(x=>[x.owner,x.code,x.date,x.qty,x.gross].join('|')===U.saleId);
 if(!s)return box(empty('Venda não encontrada no histórico.')+action('Voltar aos resultados','result',true));
 const relevant=(d.d?.assets||[]).find(x=>x.owner===s.owner&&x.code===s.code);
 const buys=(relevant?.purchases||[]).filter(x=>x.date<=s.date);
 return '<button class="m8-back" data-nav="result">← Voltar aos resultados</button>'+
 '<div class="m8-feature"><span>Venda de '+escape(s.code)+' · '+escape(me(s.owner))+'</span><h2>'+E.dateBR(s.date)+'</h2><strong class="'+(s.profit<0?'negative':'')+'">'+(s.recognized?money(s.profit):'Lucro não apurado')+'</strong><small>Resultado bruto · '+fmt(s.qty)+' unidades</small></div>'+
 '<div class="m8-kpis">'+iconStat('Total vendido',money(s.gross),'Valor bruto','blue','sale')+iconStat('Custo atribuído',s.recognized?money(s.cost):'—',s.source||'Sem custo validado','orange','sale')+
 iconStat('Resultado',s.recognized?money(s.profit):'—',s.recognized?'Lucro ou prejuízo':'Excluído do lucro','teal','sale')+'</div>'+
 box(header('Compras históricas do ativo','Formam o custo médio; não são lotes automaticamente vinculados à venda')+
 (buys.length?buys.slice(0,70).map(x=>'<div class="m8-tx"><div><b>Compra · '+E.dateBR(x.date)+'</b><small>'+fmt(x.qty)+' un. · '+escape(x.broker||'')+'</small></div><strong>'+money(x.total)+'</strong></div>').join(''):empty('Nenhuma compra anterior localizada.')))+
 box(header('Conciliação','Verificação do custo e da origem')+badge(s.recognized?'Custo identificado':'Custo não comprovado',s.recognized?'good':'warning')+'<p class="m8-hint">'+escape(s.source||s.reason||'Base calculada a partir dos registros disponíveis.')+'</p>');
}
function pageHistory(){
 const r=scope(),records=(S.records||[]).filter(x=>(U.owner==='family'||x.owner===U.owner)&&inRange(E.recordDate(x))&&(U.historyKind==='all'||U.historyKind===x.t))
 .map(x=>({date:E.recordDate(x),owner:x.owner,name:x.t==='trade'?x.v[5]:x.v[3],action:x.t==='trade'?x.v[1]:x.v[2],amount:Number(x.v[x.t==='trade'?8:7])||0,source:x.source||'B3'}));
 const fixed=(S.fixedIncomeTransactions||[]).filter(x=>(U.owner==='family'||x.owner===U.owner)&&inRange(x.date)&&(U.historyKind==='all'||U.historyKind==='fixed'))
 .map(x=>({date:x.date,owner:x.owner,name:x.product,action:x.operation==='sell'?'Resgate':'Aplicação',amount:Number(x.amount),source:x.source}));
 const q=U.search.toLowerCase();const list=records.concat(fixed).filter(x=>(x.name+' '+x.action+' '+x.source).toLowerCase().includes(q)).sort((a,b)=>b.date.localeCompare(a.date));
 return box(header('Histórico de operações','Negociações B3, movimentos e renda fixa')+
 '<div class="m8-row m8-wrap"><div class="m8-pills">'+[['all','Todos'],['trade','Negociações'],['mov','Movimentações'],['fixed','Renda fixa']].map(([v,l])=>'<button data-history="'+v+'" class="'+(U.historyKind===v?'sel':'')+'">'+l+'</button>').join('')+'</div><input class="m8-input m8-grow" id="m8-search" value="'+escape(U.search)+'" placeholder="Filtrar ativo ou instituição"/></div>'+
 '<p class="m8-hint">'+list.length+' lançamentos · '+escape(me(U.owner))+'</p>'+
 list.slice(0,U.limit).map(x=>'<div class="m8-tx"><div><b>'+escape(x.name)+'</b><small>'+E.dateBR(x.date)+' · '+escape(me(x.owner))+' · '+escape(x.action)+'</small></div><strong>'+money(x.amount)+'</strong></div>').join('')+
 (list.length>U.limit?'<button class="m8-btn sub" data-action="more">Carregar mais</button>':'' ));
}
function pageImport(){
 return box(header('Central de importação','Arquivos XLSX de posição, negociação e movimentação B3')+
 '<div class="m8-row m8-wrap"><label for="m8-import-owner">Carteira</label><select class="m8-input" id="m8-import-owner"><option value="me" '+(U.importOwner==='me'?'selected':'')+'>'+escape(me('me'))+'</option><option value="spouse" '+(U.importOwner==='spouse'?'selected':'')+'>'+escape(me('spouse'))+'</option></select></div>'+
 '<label class="m8-drop" for="m8-file">↑<strong>Selecionar arquivos XLSX ou XLS</strong><span>As duplicidades são verificadas automaticamente antes de gravar.</span><input id="m8-file" type="file" accept=".xlsx,.xls" multiple '+(busy?'disabled':'')+'></label>'+
 (U.importMessage?'<pre class="m8-import-message">'+escape(U.importMessage)+'</pre>':'')+
 '<div class="m8-notice">Os arquivos são processados localmente e os dados consolidados são sincronizados na sua conta autenticada. Nenhuma operação é apagada automaticamente.</div>')+
 box(header('Importações já registradas',Object.keys(S.sources||{}).length+' arquivos')+
 Object.entries(S.sources||{}).slice(-18).reverse().map(([name,v])=>'<div class="m8-tx"><div><b>'+escape(name)+'</b><small>'+escape(v.type||'')+' · '+escape(me(v.owner||'me'))+'</small></div><strong>'+Number(v.accepted||0)+' registros</strong></div>').join(''));
}
function pageQuotes(){
 const p=rows().holdings.filter(x=>!x.fixedIncome);
 return box(header('Cotações de ativos','Consulta sob demanda, sem assumir preço de mercado quando indisponível')+
 p.slice(0,U.limit).map(h=>'<div class="m8-tx"><div><b>'+escape(h.code)+'</b><small>'+escape(me(h.owner))+(S.quotes?.[h.code]?' · '+money(S.quotes[h.code].price):' · Sem cotação nova')+'</small></div><button class="m8-btn sub" data-quote="'+escape(h.code)+'">Consultar</button></div>').join(''));
}
function pageMore(){
 return box(header('Configurações e conta','Nomes editáveis, sincronização e segurança')+
 '<div class="m8-grid m8-two"><div><h3>Identificação dos titulares</h3>'+
 [['me','Carteira individual'],['spouse','Outra carteira'],['family','Visão conjunta']].map(([o,l])=>'<label class="m8-field">'+l+'<input id="m8-name-'+o+'" class="m8-input" maxlength="32" value="'+escape(me(o))+'"></label>').join('')+
 '<button class="m8-btn primary" data-action="save-names">Salvar nomes</button></div>'+
 '<div><h3>Sincronização</h3><p id="mt7-cloud-status">'+escape(root.MoneyTrackerCloudV7?.status||'Verificando…')+'</p><div class="m8-actions"><button class="m8-btn sub" data-action="sync">Sincronizar</button><button class="m8-btn sub" data-action="backup">Exportar backup</button><button class="m8-btn sub" data-action="restore-pick">Restaurar backup</button><button class="m8-btn sub" data-action="logout">Sair da conta</button></div></div></div>'+
 '<input type="file" id="m8-restore" accept=".json,application/json" hidden>')+
 box(header('Ferramentas','Importar e verificar seus dados')+
 '<div class="m8-quick">'+[['import','⇧','Importar B3'],['history','≡','Histórico completo'],['income','↓','Proventos'],['quotes','◉','Cotações'],['needs','✓','Diagnóstico']].map(([id,ic,label])=>'<button class="m8-quicklink" data-nav="'+id+'"><span>'+ic+'</span>'+label+' <b>›</b></button>').join('')+'</div>');
}
function layout(content){
 const titles={home:'Visão geral',portfolio:'Carteira e alocação',result:'Resultados e rentabilidade',compare:'Comparações integradas',flow:'Origem do patrimônio',needs:'Diagnóstico financeiro',asset:'Detalhe do ativo',sale:'Detalhe da venda',income:'Proventos',history:'Histórico',import:'Importação B3',more:'Configurações',quotes:'Cotações'};
 const nav= id=>U.page===id?' active':'';
 const ownerButtons=[['me',me('me')],['spouse',me('spouse')],['family',me('family')]].map(([o,n])=>'<button data-owner="'+o+'" class="'+(U.owner===o?'active':'')+'" aria-pressed="'+(U.owner===o)+'">'+escape(n)+'</button>').join('');
 const filters='<div class="m8-toolbar"><div class="m8-toggle">'+ownerButtons+'</div><div class="m8-divider"></div><div class="m8-pills">'+[['30','30d'],['90','90d'],['1y','1 ano'],['5y','5 anos'],['all','Tudo'],['custom','Datas']].map(([v,label])=>'<button data-period="'+v+'" class="'+(U.period===v?'sel':'')+'">'+label+'</button>').join('')+'</div>'+
 '<select class="m8-input m8-class-select" data-select="class"><option value="all">Todas as classes</option>'+['Ações','FIIs','ETFs','Tesouro','Renda fixa','Fundos','Outros'].map(c=>'<option value="'+c+'" '+(U.classe===c?'selected':'')+'>'+c+'</option>').join('')+'</select>'+
 '<button class="m8-iconbtn" data-action="filter-more" title="Filtro de datas">⚙</button></div>'+
 (U.period==='custom'||U.showCustom?'<div class="m8-custom"><label>De <input type="date" class="m8-input" data-date="from" value="'+escape(U.from)+'"></label><label>Até <input type="date" class="m8-input" data-date="to" value="'+escape(U.to)+'"></label><button class="m8-btn sub" data-action="clear-filters">Limpar datas</button></div>':'');
 return '<div class="m8-app"><aside class="m8-sidebar"><div class="m8-brand"><span class="m8-brandmark">↗</span><div>money<strong>tracker</strong><small>Seu patrimônio, explicado.</small></div></div>'+
 '<div class="m8-side-label">EXPLORAR</div><nav>'+NAV.map(([id,ico,label])=>'<button data-nav="'+id+'" class="'+nav(id)+'"><span>'+ico+'</span>'+label+'</button>').join('')+'</nav>'+
 '<div class="m8-side-label">FERRAMENTAS</div><nav>'+[['income','↓','Proventos'],['history','≡','Histórico'],['import','⇧','Importar B3'],['quotes','◉','Cotações'],['more','⚙','Configurações']].map(([id,ico,l])=>'<button data-nav="'+id+'" class="'+nav(id)+'"><span>'+ico+'</span>'+l+'</button>').join('')+'</nav>'+
 '<div class="m8-side-foot">MoneyTracker 2.0<small>Dados privados · Supabase</small></div></aside>'+
 '<div class="m8-main"><header class="m8-top"><div><span class="m8-eyebrow">MONEYTRACKER / '+escape(me(U.owner))+'</span><h1>'+escape(titles[U.page]||'Visão geral')+'</h1></div><div class="m8-topright"><button class="m8-btn sub" data-nav="import">⇧ Importar</button><button class="m8-iconbtn" data-nav="more" aria-label="Configurações">⚙</button></div></header>'+
 filters+'<main class="m8-content">'+content+'</main></div>'+
 '<nav class="m8-bottom">'+[['home','⌂','Início'],['portfolio','▦','Carteira'],['result','↗','Resultados'],['compare','⇄','Comparar'],['more','☰','Mais']].map(([id,ico,l])=>'<button class="'+nav(id)+'" data-nav="'+id+'"><b>'+ico+'</b><span>'+l+'</span></button>').join('')+'</nav></div>';
}
function render(){
 const target=el('mt7-app');if(!target)return;
 let html;
 try{html=({
  home:pageHome,portfolio:pagePortfolio,result:pageResult,compare:pageCompare,flow:pageFlow,needs:pageNeeds,asset:pageAsset,sale:pageSale,
  income:pageIncome,history:pageHistory,import:pageImport,quotes:pageQuotes,more:pageMore
 })[U.page]?.()||pageHome();}
 catch(err){console.error('Erro ao renderizar a tela',err);html=box('<h2>Não foi possível abrir esta tela</h2><p>'+escape(err.message||'Falha inesperada')+'</p>'+action('Voltar ao início','home',true));}
 target.innerHTML=layout(html);
}
function navigate(page){
 U.page=page;U.limit=70;U.search='';if(page==='import'&&U.owner!=='family')U.importOwner=U.owner;
 if(page==='needs')analysis=null;
 root.scrollTo?.({top:0,behavior:'instant'});render();
}
function notify(msg,bad=false){
 const target=el('mt7-toasts');if(!target)return;
 target.innerHTML='<div class="m8-toast '+(bad?'bad':'')+'">'+escape(msg)+'</div>';
 clearTimeout(toastTimer);toastTimer=setTimeout(()=>{target.innerHTML='';},6000);
}
function save(next){S=E.normalizeState(next);derivedCache=null;analysis=null;render();root.MoneyTrackerCloudV7?.scheduleSave(S);}
function download(filename,txt){const url=URL.createObjectURL(new Blob([txt],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);}
async function importFiles(files){
 if(!auth)return notify('Entre na sua conta antes de importar.',true);
 if(busy||!files?.length)return;
 busy=true;U.importMessage='Processando '+files.length+' arquivo(s)…';render();
 try{
  const r=await E.importXlsx(S,U.importOwner,files,root.MoneyTrackerExcel);
  S=E.normalizeState(r.next);derivedCache=null;analysis=null;
  U.importMessage=r.summary.added+' operações novas · '+r.summary.duplicates+' duplicadas ignoradas · '+r.summary.positionsChanged+' posições atualizadas.';
  root.MoneyTrackerCloudV7?.scheduleSave(S);notify('Importação concluída. Confira a sincronização.');
 }catch(err){U.importMessage='Nenhum registro alterado. '+(err.message||err);notify(U.importMessage,true);}
 finally{busy=false;render();}
}
async function quote(symbol){
 try{notify('Consultando '+symbol+'…');const r=await root.MoneyTrackerCloudV7.quote(symbol);
  if(!(Number(r.price)>0))throw Error('Sem cotação válida');
  save({...S,quotes:{...S.quotes,[symbol]:{price:Number(r.price),at:r.at||new Date().toISOString(),provider:r.provider||'brapi'}}});notify(symbol+' atualizado: '+money(r.price));
 }catch(err){notify(err.message||'Falha na consulta',true);}
}
function listen(){
 document.addEventListener('click',async ev=>{
  const b=ev.target.closest('button,[data-month]');if(!b)return;
  if(b.dataset.nav)return navigate(b.dataset.nav);
  if(b.dataset.owner){U.owner=b.dataset.owner;derivedCache=null;analysis=null;U.classe='all';return render();}
  if(b.dataset.period){U.period=b.dataset.period;U.showCustom=b.dataset.period==='custom';return render();}
  if(b.dataset.grain){U.grain=b.dataset.grain;return render();}
  if(b.dataset.resultView){U.resultView=b.dataset.resultView;U.limit=70;return render();}
  if(b.dataset.compare){U.compare=b.dataset.compare;return render();}
  if(b.dataset.class){U.classe=b.dataset.class;return navigate(U.page==='result'?'result':'portfolio');}
  if(b.dataset.asset){U.assetKey=b.dataset.asset;return navigate('asset');}
  if(b.dataset.sale){U.saleId=b.dataset.sale;return navigate('sale');}
  if(b.dataset.history){U.historyKind=b.dataset.history;return render();}
  if(b.dataset.month){const val=b.dataset.month;if(val.length===4){U.from=val+'-01-01';U.to=val+'-12-31';}else{U.from=val+'-01';const d=new Date(Number(val.slice(0,4)),Number(val.slice(5,7)),0);U.to=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}U.period='custom';U.showCustom=true;return navigate('result');}
  if(b.dataset.quote)return quote(b.dataset.quote);
  const a=b.dataset.action;if(!a)return;
  if(a==='more'){U.limit+=70;return render();}
  if(a==='filter-more'){U.showCustom=!U.showCustom;return render();}
  if(a==='clear-filters'){U.from='';U.to='';U.period='1y';U.showCustom=false;return render();}
  if(a==='analyze'){analysis=null;analyze();render();return notify('Diagnóstico atualizado a partir dos seus dados.');}
  if(a==='save-names'){const n={};for(const o of ['me','spouse','family'])n[o]=(el('m8-name-'+o)?.value||'').trim().slice(0,32)||({me:'Samuel',spouse:'Jessica',family:'Todos'}[o]);save({...S,displayNames:n});return notify('Nomes atualizados.');}
  if(a==='sync')return root.MoneyTrackerCloudV7?.sync();
  if(a==='logout')return root.MoneyTrackerCloudV7?.logout();
  if(a==='backup')return download('moneytracker-backup-'+today()+'.json',JSON.stringify({format:'moneytracker-backup',version:8,date:new Date().toISOString(),data:S},null,2));
  if(a==='restore-pick')return el('m8-restore')?.click();
 });
 document.addEventListener('keydown',ev=>{if((ev.key==='Enter'||ev.key===' ')&&ev.target.matches('[data-month]')){ev.preventDefault();ev.target.click();}});
 document.addEventListener('change',async ev=>{
  const t=ev.target;
  if(t.dataset.select==='class'){U.classe=t.value;return render();}
  if(t.dataset.select==='sort'){U.sort=t.value;return render();}
  if(t.dataset.date){U[t.dataset.date]=t.value;U.period='custom';return render();}
  if(t.id==='m8-import-owner'){U.importOwner=t.value;return;}
  if(t.id==='m8-file'){await importFiles(Array.from(t.files||[]));return;}
  if(t.id==='m8-restore'){
   const f=t.files?.[0];if(!f)return;
   try{const data=JSON.parse(await f.text());if(data.format!=='moneytracker-backup'||!Array.isArray(data.data?.records))throw Error('Backup inválido');
    if(!confirm('Substituir os dados locais e sincronizados por este backup? Exporte o atual antes de confirmar.'))return;
    save(data.data);notify('Backup restaurado e enviado à sincronização.');
   }catch(err){notify('Não foi possível restaurar: '+(err.message||err),true);}
  }
 });
 document.addEventListener('input',ev=>{
  const t=ev.target;if(t.id!=='m8-search')return;
  U.search=t.value;const n=t.selectionStart;render();
  const input=el('m8-search');if(input){input.focus();try{input.setSelectionRange(n,n);}catch{}}
 });
}
root.MoneyTrackerAppV7={
 getState:()=>S,setState:d=>{S=E.normalizeState(d);derivedCache=null;analysis=null;render();},
 loginReady:()=>{auth=true;el('mt7-auth').hidden=true;render();},
 loginNeeded:()=>{auth=false;el('mt7-auth').hidden=false;},
 getUi:()=>U,notify,render,
 onSyncError:msg=>notify(msg,true),
 loginStatus:msg=>{const t=el('mt7-auth-status');if(t)t.textContent=msg||'';},
 isAuthenticated:()=>auth
};
listen();render();
})(window);