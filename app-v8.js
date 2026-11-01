(function(root){
'use strict';
const E=root.MoneyTrackerEngine;
if(!E)throw Error('Motor financeiro indisponível');
let S=E.newState(),auth=false,busy=false,toastTimer=null,analysis=null,derivedCache=null;
const U={page:'home',owner:'family',period:'1y',from:'',to:'',classe:'all',grain:'month',compare:'owners',search:'',sort:'value',importOwner:'me',assetKey:'',saleId:'',historyKind:'all',limit:70,importMessage:'',quoteLoading:false,quoteProgress:'',quoteErrors:[],planStyle:'balanced',planAmount:1000};
const NAV=[['home','⌂','Início'],['portfolio','▦','Carteira'],['insights','✦','Análises'],['result','↗','Resultados'],['compare','⇄','Comparar'],['flow','◷','Fluxo'],['needs','✓','Diagnóstico']];
const money=E.money,fmt=E.fmt;
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const round=v=>Math.round((Number(v)||0)*100)/100;
const mobileChart=()=>!!root.matchMedia?.('(max-width:790px)').matches;
const chartMinWidth=()=>Math.max(255,Math.min(640,(Number(root.innerWidth)||390)-66));
const currentTheme=()=>document.documentElement.dataset.theme==='light'?'light':'dark';
function setTheme(mode){
 const next=mode==='light'?'light':'dark';
 document.documentElement.dataset.theme=next;
 const meta=document.querySelector('meta[name="theme-color"]');
 if(meta)meta.setAttribute('content',next==='dark'?'#0a1120':'#f3f6fc');
 try{root.localStorage.setItem('moneytracker-theme-v1',next);}catch(_){}
 render();
}
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
 const w=mobileChart()?Math.max(chartMinWidth(),data.length*57):Math.max(670,data.length*49),h=250,x0=40,baseline=135;
 const peak=Math.max(1,...data.flatMap(v=>[Math.abs(v.sales),Math.abs(v.dividends)])),factor=105/peak;
 const cols=data.map((r,i)=>{const x=x0+(i+.5)*(w-80)/data.length,sv=onlyDiv?0:r.sales,dv=r.dividends;
  const a=Math.abs(sv)*factor,b=Math.abs(dv)*factor;
  const aRect=onlyDiv?'':'<rect x="'+(x-16)+'" y="'+(sv>=0?baseline-a:baseline)+'" width="14" height="'+Math.max(1,a)+'" rx="3" fill="'+(sv<0?'#ec7185':'#12b99a')+'"><title>'+escape(r.date)+' · Vendas '+money(sv)+'</title></rect>';
  return '<g data-month="'+escape(r.date)+'" role="button" tabindex="0" aria-label="Ver operações de '+escape(r.date)+'">'+aRect+'<rect x="'+(x+(onlyDiv?-7:3))+'" y="'+(baseline-b)+'" width="14" height="'+Math.max(1,b)+'" rx="3" fill="#5f83f3"><title>'+escape(r.date)+' · Proventos '+money(dv)+'</title></rect><text x="'+x+'" y="230" fill="#7d8da9" font-size="11" text-anchor="middle">'+escape(mode==='year'?r.date:r.date.slice(5)+'/'+r.date.slice(2,4))+'</text></g>';
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
function positionMarketDay(date){
 const d=String(date||'');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(d))return d;
 const day=new Date(d+'T12:00:00Z');
 if(day.getUTCDay()===6)day.setUTCDate(day.getUTCDate()-1);
 if(day.getUTCDay()===0)day.setUTCDate(day.getUTCDate()-2);
 return day.toISOString().slice(0,10);
}
function quoteMeta(code,positionDate=''){
 const q=S.quotes?.[code],price=Number(q?.price);
 const date=String(q?.marketDate||q?.at||'').slice(0,10);
 const validDate=/^\d{4}-\d{2}-\d{2}$/.test(date)&&Number.isFinite(Date.parse(date+'T12:00:00Z'));
 const dateTime=validDate?Date.parse(date+'T12:00:00Z'):NaN;
 const validSource=/brapi|capital agora|yahoo finance/i.test(String(q?.provider||''));
 const available=!!q&&validSource&&Number.isFinite(price)&&price>0&&validDate&&dateTime<=Date.now()+86400000&&(!positionDate||date>=positionMarketDay(positionDate));
 const fetchedAge=Date.now()-Date.parse(q?.at||'');
 const fresh=available&&Number.isFinite(fetchedAge)&&fetchedAge>=0&&fetchedAge<=4*86400000&&Date.now()-dateTime<=8*86400000;
 return{quote:q||null,date,available,fresh,stale:available&&!fresh};
}
function pricedHoldings(){
 return E.portfolio(S,U.owner).holdings.filter(h=>!h.fixedIncome&&h.group!=='Tesouro'&&/^[A-Z][A-Z0-9]{3,11}$/.test(h.code));
}
function quoteSummary(){
 const positions=pricedHoldings(),unique=[...new Set(positions.map(h=>h.code))];
 const recent=[...new Set(positions.filter(h=>h.origin==='quote'&&!h.quoteStale).map(h=>h.code))].length;
 const cached=[...new Set(positions.filter(h=>h.origin==='quote'&&h.quoteStale).map(h=>h.code))].length;
 const retained=positions.filter(h=>h.origin==='quote').reduce((v,h)=>v+Number(h.value||0),0);
 return '<div class="m8-quote-summary"><div><small>Cotações recentes</small><strong>'+recent+' / '+unique.length+'</strong></div>'+
 '<div><small>Última cotação salva</small><strong>'+cached+' ativo(s)</strong></div>'+
 '<div><small>Valor com cotação salva</small><strong>'+money(retained)+'</strong></div></div>';
}
function quoteUpdateControls(){
 return '<div class="m8-quote-controls"><button class="m8-btn primary" data-action="refresh-quotes" '+(U.quoteLoading?'disabled':'')+'>'+(U.quoteLoading?'Consultando…':'↻ Atualizar todas as cotações')+'</button>'+
 '<span id="m8-quote-progress" role="status" aria-live="polite">'+escape(U.quoteProgress||'Consulte o último preço disponível por ativo.')+'</span></div>'+
 (U.quoteErrors?.length?'<div class="m8-quote-errors"><b>'+U.quoteErrors.length+' ativo(s) sem nova cotação</b><p>'+escape(U.quoteErrors.slice(0,6).map(x=>x.symbol+': '+x.message).join(' · '))+'</p><small>Usando a última cotação salva ou a posição B3 mais recente, com a data indicada. O custo de aquisição não muda.</small></div>':'');
}
function assetRow(h,d){
 const b=basisFor(h,d.ledger),gain=b.verified?money(h.value-b.cost):'—';
 const priceInfo=!h.fixedIncome&&(h.origin==='quote'?(h.quoteStale?' · Últ. cot. ':' · Cot. ')+money(h.unit)+'/un.':h.snapshotPrice>0?' · B3 '+money(h.snapshotPrice)+'/un.':'');
 return '<button class="m8-asset-row" data-asset="'+escape(h.owner+'|'+h.code)+'"><span class="m8-token">'+escape(h.fixedIncome?'RF':h.code.slice(0,2))+'</span><span class="m8-asset-title"><strong>'+escape(h.code)+'</strong><small>'+escape(me(h.owner))+' · '+escape(group(h.code,h.group))+(h.fixedIncome?' · Saldo nominal':'')+priceInfo+'</small></span><span class="m8-asset-money"><strong>'+money(h.value)+'</strong><small class="'+(b.verified?'positive':'muted')+'">'+gain+'</small></span><b>›</b></button>';
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
 const w=mobileChart()?Math.max(chartMinWidth(),points.length*70):Math.max(640,points.length*38),h=232,pad=31,vals=points.map(x=>x.value),min=Math.min(...vals),max=Math.max(...vals),span=Math.max(1,max-min),
 x=i=>pad+i*(w-2*pad)/(points.length-1),y=v=>h-pad-(v-min)*(h-2*pad)/span;
 const path=points.map((r,i)=>(i?'L':'M')+x(i).toFixed(1)+' '+y(r.value).toFixed(1)).join(' ');
 const circles=points.map((r,i)=>'<circle cx="'+x(i)+'" cy="'+y(r.value)+'" r="3.7" fill="#4b77ed" stroke="#fff" stroke-width="1.5"><title>'+escape(r.date)+' · '+(format==='money'?money(r.value):r.value.toFixed(2)+'%')+'</title></circle>').join('');
 return '<div class="m8-plot"><svg width="'+w+'" height="'+h+'" viewBox="0 0 '+w+' '+h+'" aria-label="Evolução dos valores registrados"><defs><linearGradient id="m8area" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#567af3" stop-opacity=".20"/><stop offset="100%" stop-color="#567af3" stop-opacity="0"/></linearGradient></defs><path d="'+path+' L'+x(points.length-1)+' '+(h-pad)+' L'+pad+' '+(h-pad)+'Z" fill="url(#m8area)"/><path d="'+path+'" fill="none" stroke="#5078ee" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>'+circles+'<text x="'+pad+'" y="'+(h-5)+'" fill="#8593a8" font-size="11">'+escape(E.dateBR(points[0].date))+'</text><text x="'+(w-pad)+'" y="'+(h-5)+'" text-anchor="end" fill="#8593a8" font-size="11">'+escape(E.dateBR(points.at(-1).date))+'</text></svg></div>';
}
function dataNotice(d){
 const old=d.holdings.filter(h=>h.origin==='quote'&&h.quoteStale).length;
 const b3=d.holdings.filter(h=>h.origin==='position'&&h.group!=='Tesouro'&&!h.fixedIncome).length;
 let notices='';
 if(old||b3)notices+='<div class="m8-notice">ℹ️ '+(old?old+' posição(ões) usam a última cotação salva, que pode estar desatualizada. ':'')+
 (b3?b3+' posição(ões) usam o último valor do relatório B3. ':'')+
 'Confira a data de referência em Cotações.</div>';
 if(d.p.valuation==='mixed')notices+='<div class="m8-notice">A carteira mistura valores de mercado, valores históricos e saldos estimados. O patrimônio não representa necessariamente o preço de venda hoje.</div>';
 else if(d.p.valuation==='historical')notices+='<div class="m8-notice">Algumas posições usam custo histórico, não cotação de mercado.</div>';
 return notices;
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
   const snapshotValue=h.origin==='quote'&&Number.isFinite(+h.snapshotValue)?+h.snapshotValue:h.value;
   if(basis.verified){invested+=basis.cost;gain+=snapshotValue-basis.cost;}
   else unknown+=snapshotValue;
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
 const values=data, w=mobileChart()?Math.max(chartMinWidth(),values.length*95):Math.max(520,values.length*130),h=246,base=185;
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
function wealthDashboard(){
 if(!confirmedWealthData().length)return '';
 const buttons='<div class="m8-pills"><button data-grain="month" class="'+(U.grain==='month'?'sel':'')+'">Mensal</button><button data-grain="year" class="'+(U.grain==='year'?'sel':'')+'">Anual</button></div>';
 return '<section class="m8-wealth-dashboard">'+box(header('Patrimônio: investido × valorização','Somente datas com posição e custo disponíveis')+buttons+barsConfirmedWealth(),'m8-wealth-major')+'</section>';
}
function pageHome(){
 const d=rows(),m=getMonths(d);
 const listed=pricedHoldings(),codes=[...new Set(listed.map(h=>h.code))],
       fresh=new Set(listed.filter(h=>h.origin==='quote'&&!h.quoteStale).map(h=>h.code)).size,
       last=new Set(listed.filter(h=>h.origin==='quote'&&h.quoteStale).map(h=>h.code)).size,
       b3=new Set(listed.filter(h=>h.origin==='position').map(h=>h.code)).size;
 const refreshBar='<div class="m8-home-refresh"><div class="m8-home-refresh-text"><b>Atualizar cotações</b><small>'+fresh+' recentes · '+last+' últimas cotações · '+b3+' posições B3</small></div>'+
   '<button type="button" class="m8-btn primary m8-home-refresh-btn" data-action="refresh-quotes" aria-label="Atualizar cotações de todos os ativos" '+(U.quoteLoading||!codes.length?'disabled':'')+'>'+(U.quoteLoading?'⏳ Atualizando…':'↻ Atualizar agora')+'</button>'+
   '<span id="m8-quote-progress" role="status" aria-live="polite">'+escape(U.quoteProgress||'Valores de mercado conforme cotação disponível')+'</span></div>';
 return refreshBar+insightHome()+kpi(d)+dataNotice(d)+wealthDashboard()+
 '<div class="m8-grid m8-two">'+box(header('Distribuição da carteira','Selecione uma classe para explorar')+donut(alloc(d),d.total))+
 box(header('Maiores posições','Acesse um ativo para ver suas operações',action('Carteira completa','portfolio',true))+d.holdings.slice().sort((a,b)=>b.value-a.value).slice(0,6).map(h=>assetRow(h,d)).join(''))+'</div>'+
 (m.some(x=>Math.abs(x.sales)+Math.abs(x.dividends)>.000001)?box(header('Lucros e proventos mensais','Resultado realizado sem ganhos em aberto',action('Ver resultados','result',true))+barChart(m.length>24?m.slice(-24):m,U.grain)):'');
}
function pagePortfolio(){
 const d=rows(),classes=alloc(d);let sorted=d.holdings.slice();
 const q=U.search.toLowerCase();if(q)sorted=sorted.filter(h=>(h.code+' '+h.product+' '+h.institution).toLowerCase().includes(q));
 sorted.sort((a,b)=>U.sort==='name'?a.code.localeCompare(b.code):U.sort==='gain'?((basisFor(b,d.ledger).verified?b.value-basisFor(b,d.ledger).cost:-Infinity)-(basisFor(a,d.ledger).verified?a.value-basisFor(a,d.ledger).cost:-Infinity)):b.value-a.value);
 return kpi(d)+dataNotice(d)+box(header('Cotações da carteira','Atualize preços do último pregão; renda fixa e Tesouro ficam separados')+quoteSummary()+quoteUpdateControls()+'<p class="m8-hint">Fonte: <a href="https://capitalagora.com.br/api" target="_blank" rel="noopener">Capital Agora</a> (fechamento B3), brapi.dev ou Yahoo Finance (.SA, fonte alternativa); cobertura sujeita à disponibilidade.</p>')+'<div class="m8-grid m8-two">'+box(header('Alocação por classe','Clique para filtrar o restante da carteira')+donut(classes,d.total))+
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
 const visible=data.slice(-24),w=mobileChart()?Math.max(chartMinWidth(),visible.length*57):Math.max(700,visible.length*46),h=245,baseline=135;
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
 const changes=d.openGain;
 return '<div class="m8-kpis">'+iconStat('Patrimônio representado',money(d.total),'Valores atuais e nominais','blue','portfolio')+
 iconStat('Custo conciliado',money(changes.cost),changes.matched+' posições avaliadas','orange','flow')+
 iconStat('Valorização identificada',changes.matched?money(changes.gain):'—','Ganho em aberto onde calculável','teal','result')+
 iconStat('Renda fixa nominal',money(changes.nominalValue),changes.incomePending+' aplicações sem juros atualizados','violet','portfolio')+'</div>'+
 wealthDashboard(true)+
 (unknown>0?box(header('Valores sem custo conciliado','Posições que ainda exigem base documental')+'<p><strong>'+money(unknown)+'</strong> em '+changes.missing+' posição(ões).</p>'):'');
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
 (!h.fixedIncome?box(header('Cotação do ativo','Preço unitário × quantidade (quando cotação disponível)')+
 '<p><strong>'+(h.origin==='quote'?money(h.unit):h.snapshotPrice>0?money(h.snapshotPrice):'Preço indisponível')+'</strong> / unidade · '+fmt(h.qty)+' unidade(s)</p>'+
 (h.origin==='quote'?'<p>Valor calculado: <b>'+money(h.value)+'</b> · '+(h.quoteStale?'Última cotação salva, desatualizada':'Cotação disponível')+' · '+escape(h.quoteProvider||'')+' · '+escape(E.dateBR(h.quoteDate||''))+'</p>':h.snapshotPrice>0?'<p>Último preço registrado na posição B3: <b>'+money(h.snapshotPrice)+'</b> (data '+escape(E.dateBR(h.date||''))+'). Não é cotação atual.</p>':'<p>Usando o valor de origem até encontrar cotação válida.</p>')+
 '<button class="m8-btn sub" data-quote="'+escape(h.code)+'" '+(U.quoteLoading?'disabled':'')+'>Atualizar cotação</button>'):'');
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
 const holdings=pricedHoldings();
 return box(header('Cotações da carteira','Preço unitário, quantidade, valor e data da fonte')+
 quoteSummary()+quoteUpdateControls()+
 '<p class="m8-hint">Quando a consulta falha, utilizamos a última cotação armazenada ou o último valor B3, priorizando a referência mais recente. Preços antigos não são exibidos como atuais.</p>'+
 (holdings.length?holdings.slice(0,U.limit).map(h=>{
  const fromQuote=h.origin==='quote',isOld=fromQuote&&h.quoteStale,hasB3=h.snapshotPrice>0&&h.origin!=='estimated';
  const price=fromQuote?money(h.unit):hasB3?money(h.snapshotPrice):'—';
  const value=fromQuote?money(h.value):hasB3?money(h.value):'—';
  const date=fromQuote?h.quoteDate:h.date;
  const origin=fromQuote?(isOld?'Última cotação salva (desatualizada)':'Cotação disponível')+' · '+escape(h.quoteProvider||''):(hasB3?'Última posição B3 (histórica)':'Sem cotação ou preço de posição');
  return '<div class="m8-quote-row"><div class="m8-quote-name"><b>'+escape(h.code)+'</b><small>'+escape(me(h.owner))+' · '+fmt(h.qty)+' un.</small><small>'+origin+(date?' · '+escape(E.dateBR(date)):'')+'</small></div>'+
  '<div class="m8-quote-prices'+(isOld?' m8-quote-outdated':'')+'"><b>'+price+'</b><strong>'+value+'</strong></div>'+
  '<button class="m8-btn sub" data-quote="'+escape(h.code)+'" '+(U.quoteLoading?'disabled':'')+'>Consultar</button></div>';
 }).join('')+(holdings.length>U.limit?'<button class="m8-btn sub" data-action="more">Ver mais</button>':''):empty('Nenhum ativo negociado identificado.'))+
 '<p class="m8-hint">Fontes: <a href="https://capitalagora.com.br/api" target="_blank" rel="noopener">Capital Agora</a> (fechamento B3), brapi.dev e Yahoo Finance (.SA, fonte alternativa), quando disponíveis. O valor exibido pode estar desatualizado.</p>');
}

function insightData(){
 const M=root.MoneyTrackerInsights;
 return M?M.evaluate({portfolio:E.portfolio(S,U.owner),quotes:S.quotes||{},scenario:U.planStyle||'balanced',amount:U.planAmount||0}):null;
}
function insightHome(){
 const z=insightData();
 if(!z||!z.total)return '';
 const top=z.segments.filter(x=>x.id!=='other').sort((a,b)=>b.percent-a.percent)[0];
 const head='Análise da carteira com IA';
 const detail=top?top.short+' representa '+top.percent.toFixed(1).replace('.',',')+'% dos investimentos. Consulte o analista de IA para discutir oportunidades concretas.':'Converse com a IA sobre os seus investimentos.';
 return '<section class="m8-ins-home"><div><small>✦ LEITURA DINÂMICA DA CARTEIRA</small><b>'+escape(head)+'</b><p>'+escape(detail)+'</p></div><button class="m8-btn primary" data-nav="insights">Explorar análise ›</button></section>';
}
function pageInsights(){
 const z=insightData();
 if(!z)return box(empty('O módulo de análises não carregou. Atualize o aplicativo para a versão mais recente.'));
 const pct=n=>(Number(n)||0).toFixed(1).replace('.',',')+'%';
 const scenarioNames={protection:'Mais defensivo',balanced:'Equilibrado',growth:'Crescimento'};
 const choices=Object.entries(scenarioNames).map(([id,label])=>
  '<button type="button" data-plan-style="'+id+'" class="'+(z.scenario===id?'active':'')+'" aria-pressed="'+(z.scenario===id)+'">'+escape(label)+'</button>').join('');
 const sections=z.segments.filter(s=>s.value>0||s.target>0);
 const chart=sections.map(s=>{
  const gap=s.percent-s.target;
  return '<div class="m8-ins-segment"><div class="m8-ins-segment-head"><b>'+escape(s.short)+'</b><span>'+money(s.value)+' · '+pct(s.percent)+'</span></div>'+
    '<div class="m8-ins-track"><i style="background:'+s.color+';width:'+Math.min(100,s.percent)+'%"></i></div>'+
    '<div class="m8-ins-segment-target"><small>Referência ilustrativa: '+pct(s.target)+'</small><span class="'+(gap>5?'m8-ins-over':'')+'">'+(gap>=0?'+':'')+Number(gap).toFixed(1).replace('.',',')+' p.p.</span></div></div>';
 }).join('');
 const exposure=z.all.fiis.percent+z.all.brazil.percent+z.all.global.percent+z.all.thematic.percent;
 const quality=z.tradeCount?z.priced+'/'+z.tradeCount+' posições com preço de mercado confirmado':'Sem ativos negociados';
 const summary='<div class="m8-ins-summary"><div><small>Patrimônio analisado</small><strong>'+money(z.total)+'</strong><span>'+z.holdings+' posições</span></div>'+
 '<div><small>Renda variável</small><strong>'+pct(exposure)+'</strong><span>FIIs, Brasil, exterior e temáticos</span></div>'+
 '<div><small>5 maiores ativos</small><strong>'+pct(z.top5Weight)+'</strong><span>Concentração nominal</span></div></div>';
 const risks=z.risks.map(r=>'<div class="m8-ins-risk"><span class="m8-ins-risk-dot '+escape(r.level)+'">'+(r.level==='attention'?'!':r.level==='data'?'i':'↗')+'</span><div><b>'+escape(r.name)+'</b><p>'+escape(r.detail)+'</p></div></div>').join('');
 const contributions=z.allocations.map((r,i)=>{
  const held=r.positions.filter(h=>h.value>0).map(h=>h.code);
  const example=held.length?'Você já possui '+held.slice(0,3).map(x=>escape(x)).join(', ')+'.':'Não há posição atual dessa categoria.';
  return '<div class="m8-ins-idea"><div class="m8-ins-idea-index">'+(i+1)+'</div><div><b>'+escape(r.name)+'</b>'+
  '<p>'+escape(r.why)+'</p><small>'+example+' Produtos para comparar: '+escape(r.study)+'.</small></div><strong>'+money(r.allocation)+'</strong></div>';
 }).join('');
 const presets=[500,1000,5000].map(n=>'<button data-plan-amount="'+n+'" class="m8-ins-chip '+(z.invest===n?'active':'')+'">'+money(n)+'</button>').join('');
 const date=z.quoteDate?E.dateBR(z.quoteDate):'não identificada';
 return '<div class="m8-ins-intro"><span>✦ ANÁLISE PATRIMONIAL</span><h2>O que sua carteira está dizendo?</h2>'+
 '<p>Diagnóstico automático da composição atual, com cenários de diversificação e aportes hipotéticos. Atualiza quando a carteira ou as cotações mudam.</p></div>'+
 summary+
 (root.MoneyTrackerAI?.panel?.()||box('<p>O componente de IA não foi carregado. Atualize o aplicativo.</p>'))+
 box(header('Simulador de alocação sem IA: distribuição atual × cenário','Escolha apenas uma referência de comparação, não um perfil definido para você.')+
 '<div class="m8-ins-toggle" aria-label="Cenário de alocação">'+choices+'</div>'+
 '<div class="m8-ins-chart">'+chart+'</div>'+
 '<p class="m8-hint">Metas ilustrativas configuradas pelo simulador, não um modelo de suitability pessoal. As porcentagens somam 100% e incluem apenas os valores conhecidos.</p>')+
 box(header('Simular próximo aporte','Como o valor hipotético poderia reduzir os desvios do cenário escolhido')+
 '<div class="m8-ins-amount"><div>'+presets+'</div><label>Outro valor (R$) <input type="number" id="m8-ins-amount" min="0" max="1000000000" step="100" inputmode="decimal" class="m8-input" value="'+z.invest+'"></label></div>'+
 (z.invest>0&&z.total>0?'<div class="m8-ins-proposal"><small>SIMULAÇÃO DE APORTE — '+escape(scenarioNames[z.scenario])+'</small><strong>'+money(z.invest)+'</strong><span>Distribuição proporcional aos maiores desvios abaixo da referência, sem exigir venda de ativos</span></div>'+
 '<div class="m8-ins-ideas">'+(contributions||empty('Nenhuma categoria abaixo da referência neste cenário.'))+'</div>':
 '<p class="m8-hint">Informe um valor de aporte e tenha posições importadas para exibir a simulação.</p>')+
 '<p class="m8-hint">Os valores são exemplos para estudo, não ordens de compra ou previsão de retorno. Antes de investir, avalie custos, liquidez, prazo, risco e o seu perfil.</p>')+
 box(header('Pontos de atenção','Leitura automática das exposições e dos dados disponíveis')+
 (risks||empty('Nenhum alerta pelas regras de concentração atuais.')))+
 box(header('Qualidade dos dados','Transparência das referências usadas pelo diagnóstico')+
 '<div class="m8-ins-data"><div><b>'+escape(quality)+'</b><span>Cotações confirmadas na carteira</span></div><div><b>'+escape(date)+'</b><span>Data do pregão mais recente salvo</span></div></div>'+
 '<p class="m8-hint">Tesouro Direto e renda fixa sem atualização não são considerados cotação ao vivo. O simulador usa o último valor confiável disponível. Direitos de subscrição sem preço não geram valor fictício.</p>'+
 '<div class="m8-ins-foot-actions">'+action('Atualizar cotações','quotes',true)+' '+action('Ver diagnóstico de dados','needs',true)+'</div>')+
 '<p class="m8-ins-disclaimer">O diagnóstico é calculado por regras transparentes a partir do seu patrimônio importado, não por uma IA preditiva. Não substitui uma avaliação de suitability, não estima retorno futuro e não executa operações. <a href="https://www.gov.br/investidor/pt-br/investir/antes-de-investir/respeite-o-seu-perfil-de-investidor/entenda-o-suitability" target="_blank" rel="noopener">Entenda o perfil de investidor (CVM)</a>.</p>';
}

function pageMore(){
 return box(header('Configurações e conta','Nomes editáveis, sincronização e segurança')+
 '<div class="m8-theme-settings"><div><b>Aparência</b><small>'+(currentTheme()==='dark'?'Tema escuro ativado':'Tema claro ativado')+'</small></div><button type="button" class="m8-btn sub" data-action="theme-toggle">'+(currentTheme()==='dark'?'☀ Usar tema claro':'☾ Usar tema escuro')+'</button></div>'+
 '<div class="m8-grid m8-two"><div><h3>Identificação dos titulares</h3>'+
 [['me','Carteira individual'],['spouse','Outra carteira'],['family','Visão conjunta']].map(([o,l])=>'<label class="m8-field">'+l+'<input id="m8-name-'+o+'" class="m8-input" maxlength="32" value="'+escape(me(o))+'"></label>').join('')+
 '<button class="m8-btn primary" data-action="save-names">Salvar nomes</button></div>'+
 '<div><h3>Sincronização</h3><p id="mt7-cloud-status">'+escape(root.MoneyTrackerCloudV7?.status||'Verificando…')+'</p><div class="m8-actions"><button class="m8-btn sub" data-action="sync">Sincronizar</button><button class="m8-btn sub" data-action="backup">Exportar backup</button><button class="m8-btn sub" data-action="restore-pick">Restaurar backup</button><button class="m8-btn sub" data-action="logout">Sair da conta</button></div></div></div>'+
 '<input type="file" id="m8-restore" accept=".json,application/json" hidden>')+
 box(header('Ferramentas','Importar e verificar seus dados')+
 '<div class="m8-quick">'+[['compare','⇄','Comparações'],['import','⇧','Importar B3'],['history','≡','Histórico completo'],['income','↓','Proventos'],['quotes','◉','Cotações'],['insights','✦','Análises'],['needs','✓','Diagnóstico']].map(([id,ic,label])=>'<button class="m8-quicklink" data-nav="'+id+'"><span>'+ic+'</span>'+label+' <b>›</b></button>').join('')+'</div>');
}
function layout(content){
 const titles={home:'Visão geral',portfolio:'Carteira e alocação',result:'Resultados e rentabilidade',compare:'Comparações integradas',insights:'Análises e oportunidades',flow:'Origem do patrimônio',needs:'Diagnóstico financeiro',asset:'Detalhe do ativo',sale:'Detalhe da venda',income:'Proventos',history:'Histórico',import:'Importação B3',more:'Configurações',quotes:'Cotações'};
 const nav= id=>U.page===id?' active':'';
 const dark=currentTheme()==='dark';
 const themeButton='<button type="button" class="m8-iconbtn m8-theme-toggle" data-action="theme-toggle" title="'+(dark?'Usar tema claro':'Usar tema escuro')+'" aria-label="'+(dark?'Usar tema claro':'Usar tema escuro')+'" aria-pressed="'+dark+'">'+(dark?'☀':'☾')+'</button>';
 const ownerButtons=[['me',me('me')],['spouse',me('spouse')],['family',me('family')]].map(([o,n])=>'<button data-owner="'+o+'" class="'+(U.owner===o?'active':'')+'" aria-pressed="'+(U.owner===o)+'">'+escape(n)+'</button>').join('');
 const filters='<div class="m8-toolbar"><div class="m8-toggle">'+ownerButtons+'</div><div class="m8-divider"></div><div class="m8-pills">'+[['30','30d'],['90','90d'],['1y','1 ano'],['5y','5 anos'],['all','Tudo'],['custom','Datas']].map(([v,label])=>'<button data-period="'+v+'" class="'+(U.period===v?'sel':'')+'">'+label+'</button>').join('')+'</div>'+
 '<select class="m8-input m8-class-select" data-select="class"><option value="all">Todas as classes</option>'+['Ações','FIIs','ETFs','Tesouro','Renda fixa','Fundos','Outros'].map(c=>'<option value="'+c+'" '+(U.classe===c?'selected':'')+'>'+c+'</option>').join('')+'</select>'+
 '<button class="m8-iconbtn" data-action="filter-more" title="Filtro de datas">⚙</button></div>'+
 (U.period==='custom'||U.showCustom?'<div class="m8-custom"><label>De <input type="date" class="m8-input" data-date="from" value="'+escape(U.from)+'"></label><label>Até <input type="date" class="m8-input" data-date="to" value="'+escape(U.to)+'"></label><button class="m8-btn sub" data-action="clear-filters">Limpar datas</button></div>':'');
 return '<div class="m8-app"><aside class="m8-sidebar"><div class="m8-brand"><span class="m8-brandmark">↗</span><div>money<strong>tracker</strong><small>Seu patrimônio, explicado.</small></div></div>'+
 '<div class="m8-side-label">EXPLORAR</div><nav>'+NAV.map(([id,ico,label])=>'<button data-nav="'+id+'" class="'+nav(id)+'"><span>'+ico+'</span>'+label+'</button>').join('')+'</nav>'+
 '<div class="m8-side-label">FERRAMENTAS</div><nav>'+[['income','↓','Proventos'],['history','≡','Histórico'],['import','⇧','Importar B3'],['quotes','◉','Cotações'],['more','⚙','Configurações']].map(([id,ico,l])=>'<button data-nav="'+id+'" class="'+nav(id)+'"><span>'+ico+'</span>'+l+'</button>').join('')+'</nav>'+
 '<div class="m8-side-foot">MoneyTracker 2.0<small>Dados privados · Supabase</small></div></aside>'+
 '<div class="m8-main"><header class="m8-top"><div><span class="m8-eyebrow">MONEYTRACKER / '+escape(me(U.owner))+'</span><h1>'+escape(titles[U.page]||'Visão geral')+'</h1></div><div class="m8-topright">'+themeButton+'<button class="m8-btn sub" data-nav="import">⇧ Importar</button><button class="m8-iconbtn" data-nav="more" aria-label="Configurações">⚙</button></div></header>'+
(U.page==='insights'?'<div class="m8-toolbar m8-ins-owner"><div class="m8-toggle">'+ownerButtons+'</div><small>Análise da posição completa do titular</small></div>':filters)+'<main class="m8-content">'+content+'</main></div>'+
 '<nav class="m8-bottom">'+[['home','⌂','Início'],['portfolio','▦','Carteira'],['insights','✦','Análise'],['result','↗','Resultados'],['more','☰','Mais']].map(([id,ico,l])=>'<button class="'+nav(id)+'" data-nav="'+id+'"><b>'+ico+'</b><span>'+l+'</span></button>').join('')+'</nav></div>';
}
function render(){
 const target=el('mt7-app');if(!target)return;
 let html;
 try{html=({
  home:pageHome,portfolio:pagePortfolio,insights:pageInsights,result:pageResult,compare:pageCompare,flow:pageFlow,needs:pageNeeds,asset:pageAsset,sale:pageSale,
  income:pageIncome,history:pageHistory,import:pageImport,quotes:pageQuotes,more:pageMore
 })[U.page]?.()||pageHome();}
 catch(err){console.error('Erro ao renderizar a tela',err);html=box('<h2>Não foi possível abrir esta tela</h2><p>'+escape(err.message||'Falha inesperada')+'</p>'+action('Voltar ao início','home',true));}
 target.innerHTML=layout(html);
 if(mobileChart())for(const plot of target.querySelectorAll('.m8-plot')){
  if(plot.scrollWidth>plot.clientWidth+8){plot.scrollLeft=plot.scrollWidth-plot.clientWidth;plot.classList.add('m8-scrollchart');plot.tabIndex=0;plot.setAttribute('aria-label','Gráfico rolável. Deslize horizontalmente para ver outros períodos.');plot.insertAdjacentHTML('afterend','<p class="m8-chart-swipe" aria-hidden="true">← Deslize para ver períodos anteriores</p>');}
 }
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
async function refreshAllQuotes(auto=false,symbols=null){
 if(!auth||U.quoteLoading)return;
 const holdings=E.portfolio(S,'family').holdings.filter(h=>!h.fixedIncome&&h.group!=='Tesouro'&&/^[A-Z][A-Z0-9]{3,11}$/.test(h.code));
 let codes=[...new Set(holdings.map(h=>h.code))];
 if(symbols)codes=codes.filter(x=>symbols.includes(x));
 if(auto){
  const now=Date.now();let last=0;
  try{last=Number(root.localStorage.getItem('moneytracker-quotes-autorefresh-v245')||0);}catch(_){}
  if(now-last<6*3600000)return;
  try{root.localStorage.setItem('moneytracker-quotes-autorefresh-v245',String(now));}catch(_){}
  codes=codes.filter(x=>!quoteMeta(x).fresh||now-Date.parse(S.quotes[x].at)>6*3600000);
 }
 if(!codes.length)return;
 U.quoteLoading=true;U.quoteErrors=[];U.quoteProgress='Consultando 0 de '+codes.length+' ativos…';render();
 const updates={},failures=[];let index=0,done=0;
 async function worker(){
  while(index<codes.length){
   const symbol=codes[index++];
   try{
    const q=await root.MoneyTrackerCloudV7.quote(symbol);
    if(!(Number(q.price)>0)||String(q.symbol||symbol).toUpperCase()!==symbol)throw Error('Preço não corresponde ao ativo');
    const previous=S.quotes?.[symbol];
    const previousDate=String(previous?.marketDate||previous?.at||'').slice(0,10);
    const incomingDate=String(q.marketDate||q.at||new Date().toISOString()).slice(0,10);
    if(previousDate&&previousDate>incomingDate&&Number(previous?.price)>0)throw Error('Fonte retornou cotação anterior à armazenada');
    updates[symbol]={price:Number(q.price),at:q.at||new Date().toISOString(),marketDate:q.marketDate||null,
      provider:q.provider||'Fonte não identificada',changePercent:q.changePercent,type:q.type||'cotacao'};
   }catch(error){failures.push({symbol,message:String(error.message||error)});}
   done++;U.quoteProgress='Consultados '+done+' de '+codes.length+' · '+Object.keys(updates).length+' preços';
   const status=el('m8-quote-progress');if(status)status.textContent=U.quoteProgress;
  }
 }
 await Promise.all(Array.from({length:Math.min(4,codes.length)},()=>worker()));
 U.quoteErrors=failures;U.quoteLoading=false;
 const checked=Object.keys(updates).length;
 const next=checked?E.normalizeState({...S,quotes:{...S.quotes,...updates}}):S;
 // Compare effective asset values, not fetch timestamps or the number of successful requests.
 const valuesByAsset=state=>{
  const map=new Map();
  for(const h of E.portfolio(state,'family').holdings){
   if(h.fixedIncome||h.group==='Tesouro')continue;
   const key=h.owner+'|'+h.code;
   map.set(key,round((map.get(key)||0)+Number(h.value||0)));
  }
  return map;
 };
 const before=valuesByAsset(S),after=valuesByAsset(next);
 const changed=[...after.keys()].filter(k=>Math.abs((after.get(k)||0)-(before.get(k)||0))>=0.005).length;
 const quoteDates=[...new Set(Object.values(updates).map(q=>q.marketDate).filter(Boolean))];
 const reference=quoteDates.length===1?' · pregão '+E.dateBR(quoteDates[0]):'';
 U.quoteProgress=checked
  ?checked+' preço(s) conferido(s) · '+(changed?changed+' posição(ões) com valor alterado':'nenhuma mudança de valor')+reference+
    (failures.length?' · '+failures.length+' sem cotação nova (valor anterior mantido)':'')+'.'
  :'Nenhuma cotação nova disponível. Valores anteriores mantidos'+(failures.length?' · '+failures.length+' consulta(s) sem preço':'')+'.';
 if(checked)save(next);else render();
 if(!auto)notify(U.quoteProgress,checked===0);
}
async function quote(symbol){return refreshAllQuotes(false,[symbol]);}
function listen(){
 document.addEventListener('click',async ev=>{
  const b=ev.target.closest('button,[data-month]');if(!b)return;
  if(b.dataset.nav)return navigate(b.dataset.nav);
  if(b.dataset.owner){U.owner=b.dataset.owner;derivedCache=null;analysis=null;U.classe='all';return render();}
  if(b.dataset.planStyle){U.planStyle=b.dataset.planStyle;return render();}
 if(b.dataset.planAmount){U.planAmount=Number(b.dataset.planAmount);return render();}
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
  if(a==='refresh-quotes')return refreshAllQuotes(false);
  if(a==='theme-toggle')return setTheme(currentTheme()==='dark'?'light':'dark');
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
  if(t.id==='m8-ins-amount'){U.planAmount=Math.min(1000000000,Math.max(0,Number(t.value)||0));return render();}
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
 loginReady:()=>{auth=true;el('mt7-auth').hidden=true;render();setTimeout(()=>refreshAllQuotes(true),900);},
 loginNeeded:()=>{auth=false;el('mt7-auth').hidden=false;},
 getUi:()=>U,notify,render,
 onSyncError:msg=>notify(msg,true),
 loginStatus:msg=>{const t=el('mt7-auth-status');if(t)t.textContent=msg||'';},
 isAuthenticated:()=>auth
};
listen();render();
})(window);