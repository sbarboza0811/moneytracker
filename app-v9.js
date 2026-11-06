(function(root){
'use strict';
/* MoneyTracker 3.0: interface nova; mantém motores financeiros e snapshot B3 existentes. */
const E=root.MoneyTrackerEngine,C=root.MoneyTrackerCalculations;
if(!E||!C)throw Error('Os motores financeiros não foram carregados.');
let S=E.newState(),authenticated=false,busy=false,toastTimeout=null,lastQuoteRun=0;
const U={page:'home',owner:'family',period:'1y',from:'',to:'',classe:'all',sort:'value',search:'',history:'all',limit:45,asset:'',importOwner:'me',importMessage:'',quoteLoading:false,quoteProgress:'',quoteErrors:[],planAmount:0,grain:'month'};
try{
 const saved=JSON.parse(root.localStorage.getItem('moneytracker-ui-v9')||'{}');
 if(['me','spouse','family'].includes(saved.owner))U.owner=saved.owner;
 if(['30','90','1y','5y','all'].includes(saved.period))U.period=saved.period;
}catch(_){}
const USD=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
const num=x=>Number(x)||0;
const round=x=>Math.round((num(x)+Number.EPSILON)*100)/100;
const money=x=>USD.format(num(x));
const qty=x=>new Intl.NumberFormat('pt-BR',{maximumFractionDigits:6}).format(num(x));
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const name=o=>String(S.displayNames?.[o]||({me:'Samuel',spouse:'Jessica',family:'Família'}[o])||o);
const el=id=>document.getElementById(id);
const day=()=>E.isoNow();
const rdate=d=>E.dateBR(d||'');
const pill=(s,kind='')=>'<span class="mt9-tag '+kind+'">'+esc(s)+'</span>';
const btn=(label,action,sub=false)=>'<button type="button" class="mt9-btn '+(sub?'secondary':'')+'" data-action="'+action+'">'+label+'</button>';
function remember(){try{root.localStorage.setItem('moneytracker-ui-v9',JSON.stringify({owner:U.owner,period:U.period}));}catch(_){}}
function periodRange(){const end=U.period==='custom'?(U.to||day()):day();return{from:U.period==='custom'?(U.from||'1900-01-01'):U.period==='all'?'1900-01-01':E.cutoff(U.period,end),to:end};}
function full(){return C.calculate(S,U.owner);}
function scoped(){const p=periodRange();return C.view(S,{owner:U.owner,from:p.from,to:p.to,className:U.classe});}
function panels(content,extra=''){return '<section class="mt9-panel '+extra+'">'+content+'</section>';}
function heading(title,description='',right=''){return '<div class="mt9-section-header"><div><h2>'+esc(title)+'</h2>'+(description?'<p>'+esc(description)+'</p>':'')+'</div>'+right+'</div>';}
function metric(title,value,detail='',tone=''){return '<div class="mt9-metric"><span>'+esc(title)+'</span><strong class="'+tone+'">'+esc(value)+'</strong>'+(detail?'<small>'+esc(detail)+'</small>':'')+'</div>';}
function row(label,value,detail='',link=''){return '<div class="mt9-simple-row"><div><b>'+esc(label)+'</b>'+(detail?'<small>'+esc(detail)+'</small>':'')+'</div><strong>'+esc(value)+'</strong>'+(link?'<button type="button" class="mt9-linkbutton" data-nav="'+link+'">Ver</button>':'')+'</div>';}
function navButton(page,label,symbol){return '<button type="button" data-nav="'+page+'" class="'+(U.page===page?'active':'')+'" aria-current="'+(U.page===page?'page':'false')+'"><span class="mt9-nav-icon">'+symbol+'</span><span>'+label+'</span></button>';}
function empty(title,detail){return '<div class="mt9-empty"><strong>'+esc(title)+'</strong><p>'+esc(detail||'')+'</p></div>';}
function classOf(h){return C.classLabel(h.code,h.group);}
function byClass(d){const map={};for(const h of d.holdings){const k=classOf(h);map[k]=(map[k]||0)+num(h.value);}return Object.entries(map).map(([key,value])=>({key,value})).sort((a,b)=>b.value-a.value);}
function distribution(list,total){
 if(!list.length||total<=0)return '';
 const colors=['#5b87ff','#24bea6','#b38af1','#e6b264','#fa8595','#7c99b8','#55a8d4'];
 return '<div class="mt9-dist">'+list.map((v,i)=>{
  const percent=v.value/total*100;
  return '<button type="button" data-class="'+esc(v.key)+'" class="mt9-dist-row"><div><b>'+esc(v.key)+'</b><strong>'+percent.toFixed(1).replace('.',',')+'%</strong></div><div class="mt9-track"><span style="width:'+Math.min(100,Math.max(0,percent)).toFixed(2)+'%;background:'+colors[i%colors.length]+'"></span></div><small>'+money(v.value)+'</small></button>';
 }).join('')+'</div>';
}

/* Gráficos de posição: valores atuais, nunca retornos históricos estimados. */
const MT9_COLORS=['#5b87ff','#24bea6','#bc8ef3','#eab564','#f78697','#62b6dc','#b6d078','#d7a8e9','#7ba7a1'];
const compactValue=x=>new Intl.NumberFormat('pt-BR',{notation:'compact',maximumFractionDigits:1}).format(num(x));
function allocationChart(d,title='Alocação por classe'){
 const items=byClass(d).filter(x=>x.value>0),total=items.reduce((n,x)=>n+x.value,0);
 if(!items.length||total<=0)return '';
 let progress=0;
 const slices=items.map((x,i)=>{const start=progress;progress+=100*x.value/total;return MT9_COLORS[i%MT9_COLORS.length]+' '+start.toFixed(4)+'% '+progress.toFixed(4)+'%';});
 const ring='<div class="mt9-donut" style="background:conic-gradient('+slices.join(',')+')" aria-hidden="true"><div class="mt9-donut-hole"><b>'+money(total)+'</b><span>Patrimônio atual</span></div></div>';
 const legend='<div class="mt9-legend">'+items.map((x,i)=>'<button type="button" class="mt9-legend-row" data-class="'+esc(x.key)+'"><i style="background:'+MT9_COLORS[i%MT9_COLORS.length]+'"></i><span>'+esc(x.key)+'</span><strong>'+(x.value/total*100).toFixed(1).replace('.',',')+'%</strong><small>'+money(x.value)+'</small></button>').join('')+'</div>';
 return panels(heading(title,'Participação por classe · toque em uma classe para filtrar a carteira')+'<div class="mt9-chart-layout">'+ring+legend+'</div>');
}
function concentrationChart(holdings,total,title='Concentração por ativo'){
 const list=holdings.filter(h=>num(h.value)>0).slice().sort((a,b)=>b.value-a.value).slice(0,7);
 if(!list.length||total<=0)return '';
 const biggest=list[0].value;
 return panels(heading(title,'Barras relativas à maior posição · percentuais do patrimônio')+
 '<div class="mt9-hbars">'+list.map(h=>'<button type="button" class="mt9-hbar-row" data-asset="'+esc(h.owner+'|'+h.code)+'"><span class="mt9-hbar-heading"><b>'+esc(h.code)+'</b><small>'+esc(name(h.owner))+' · '+(h.value/total*100).toFixed(1).replace('.',',')+'%</small></span><span class="mt9-hbar-track"><i style="width:'+(h.value/biggest*100).toFixed(2)+'%"></i></span><strong>'+money(h.value)+'</strong></button>').join('')+'</div>');
}
function monthLabel(k){if(k.length===4)return k;const months=['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];return months[Math.max(0,Math.min(11,Number(k.slice(5,7))-1))]+'/'+k.slice(2,4);}
function incomeMonthlyChart(payouts){
 const map=new Map();
 for(const p of payouts){const k=String(p.date||'').slice(0,7);if(!/^\d{4}-\d{2}$/.test(k))continue;map.set(k,(map.get(k)||0)+num(p.amount));}
 const items=[...map].map(([date,value])=>({date,value})).filter(x=>x.value>0).sort((a,b)=>a.date.localeCompare(b.date)).slice(-9);
 if(!items.length)return '';
 const peak=Math.max(...items.map(x=>x.value),1);
 return panels(heading('Proventos por mês','Meses com pagamentos registrados · toque na coluna')+
 '<div class="mt9-columns" role="group" aria-label="Proventos mensais">'+items.map(x=>
 '<button type="button" class="mt9-column" data-income-month="'+esc(x.date)+'" aria-label="'+esc(monthLabel(x.date)+' '+money(x.value))+'"><span class="mt9-column-value">'+compactValue(x.value)+'</span><span class="mt9-column-track"><i style="height:'+(x.value/peak*100).toFixed(2)+'%"></i></span><span class="mt9-column-label">'+esc(monthLabel(x.date))+'</span></button>').join('')+'</div>');
}
function incomeTopChart(payouts){
 const sums=new Map();
 for(const p of payouts){const code=String(p.code||'');if(code)sums.set(code,(sums.get(code)||0)+num(p.amount));}
 const top=[...sums].map(([code,value])=>({code,value})).filter(x=>x.value>0).sort((a,b)=>b.value-a.value).slice(0,7);
 if(!top.length)return '';
 const max=top[0].value;
 return panels(heading('Quem mais pagou proventos','Valores recebidos no período, por ativo')+
 '<div class="mt9-hbars">'+top.map((x,i)=>'<button type="button" class="mt9-hbar-row" data-focus-code="'+esc(x.code)+'"><span class="mt9-hbar-heading"><b>'+esc(x.code)+'</b><small>'+String(i+1)+'º em proventos</small></span><span class="mt9-hbar-track"><i class="income" style="width:'+(x.value/max*100).toFixed(2)+'%"></i></span><strong>'+money(x.value)+'</strong></button>').join('')+'</div>');
}


function splitResultChart(points){
 const last=points.filter(x=>Math.abs(x.sales)+Math.abs(x.dividends)>.005).slice(-8);
 if(!last.length)return '';
 const max=Math.max(1,...last.map(x=>Math.max(Math.abs(x.sales),x.dividends)));
 return panels(heading('Vendas x proventos','Resultado bruto de vendas conciliadas e pagamentos, por período')+
 '<div class="mt9-chart-key"><span><i class="sales"></i> Vendas</span><span><i class="income"></i> Proventos</span><span><i class="loss"></i> Prejuízo</span></div>'+
 '<div class="mt9-paired">'+last.map(x=>'<button type="button" class="mt9-paired-row" data-month="'+esc(x.date)+'"><span class="mt9-paired-label">'+esc(monthLabel(x.date))+'</span><span class="mt9-paired-tracks"><i class="'+(x.sales<0?'loss':'sales')+'" style="width:'+(Math.abs(x.sales)/max*100).toFixed(2)+'%" title="Vendas: '+esc(money(x.sales))+'"></i><i class="income" style="width:'+(x.dividends/max*100).toFixed(2)+'%" title="Proventos: '+esc(money(x.dividends))+'"></i></span><strong>'+money(x.sales+x.dividends)+'</strong></button>').join('')+'</div>');
}
function cumulativeResultChart(points){
 const last=points.filter(x=>Math.abs(x.sales)+Math.abs(x.dividends)>.005).slice(-18);
 if(last.length<2)return '';
 let acc=0;
 const series=last.map(x=>({date:x.date,value:acc=round(acc+x.sales+x.dividends)}));
 const low=Math.min(0,...series.map(x=>x.value)),high=Math.max(0,...series.map(x=>x.value)),span=Math.max(1,high-low);
 const left=26,right=650,top=18,bottom=185;
 const dots=series.map((x,i)=>({date:x.date,value:x.value,x:left+(right-left)*i/(series.length-1),y:bottom-(x.value-low)/span*(bottom-top)}));
 const line=dots.map(x=>x.x.toFixed(1)+','+x.y.toFixed(1)).join(' ');
 const zero=(bottom-(0-low)/span*(bottom-top)).toFixed(1);
 const grid=[0,.5,1].map(v=>{const y=(top+(bottom-top)*v).toFixed(1);return '<line x1="'+left+'" x2="'+right+'" y1="'+y+'" y2="'+y+'" stroke="var(--mt9-border)" stroke-dasharray="4 5"/>';}).join('');
 const circles=dots.map(x=>'<circle class="mt9-line-dot" data-month="'+esc(x.date)+'" tabindex="0" role="button" aria-label="'+esc(monthLabel(x.date)+' acumulado '+money(x.value))+'" cx="'+x.x.toFixed(1)+'" cy="'+x.y.toFixed(1)+'" r="6"><title>'+esc(monthLabel(x.date)+' · '+money(x.value))+'</title></circle>').join('');
 return panels(heading('Resultado realizado acumulado','Vendas conciliadas + proventos; não representa evolução patrimonial')+
 '<div class="mt9-line-summary"><span>Primeiro lançamento: '+esc(monthLabel(series[0].date))+'</span><strong class="'+(acc<0?'negative':'positive')+'">'+money(acc)+'</strong></div>'+
 '<svg class="mt9-line-chart" viewBox="0 0 680 215" role="group" aria-label="Resultado acumulado por período, '+esc(money(acc))+'"><title>Resultado realizado acumulado</title>'+grid+
 '<line x1="'+left+'" x2="'+right+'" y1="'+zero+'" y2="'+zero+'" stroke="var(--mt9-muted)" stroke-width="1"/>'+
 '<polyline points="'+line+'" fill="none" stroke="var(--mt9-accent)" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>'+circles+'</svg>'+
 '<div class="mt9-line-labels"><span>'+esc(monthLabel(series[0].date))+'</span><span>'+esc(monthLabel(series[series.length-1].date))+'</span></div>'+
 '<p class="mt9-fineprint">Somente períodos com lançamentos aparecem no eixo; toque em um ponto para consultar as operações.</p>');
}
function ownerClassChart(a,b){
 const listA=byClass(a),listB=byClass(b),mapA=new Map(listA.map(x=>[x.key,x.value])),mapB=new Map(listB.map(x=>[x.key,x.value]));
 const classes=[...new Set([...mapA.keys(),...mapB.keys()])].sort((x,y)=>(num(mapA.get(y))+num(mapB.get(y)))-(num(mapA.get(x))+num(mapB.get(x)))).slice(0,8);
 if(!classes.length)return '';
 return panels(heading('Comparativo por classe','Participação percentual no patrimônio de cada titular')+
 '<div class="mt9-chart-key"><span><i class="sales"></i> '+esc(name('me'))+'</span><span><i class="income"></i> '+esc(name('spouse'))+'</span></div>'+
 '<div class="mt9-compare-classes">'+classes.map(k=>{
 const av=num(mapA.get(k)),bv=num(mapB.get(k)),pa=a.total>0?100*av/a.total:0,pb=b.total>0?100*bv/b.total:0;
 return '<button type="button" class="mt9-compare-class" data-class="'+esc(k)+'"><b>'+esc(k)+'</b><span class="mt9-compare-bars"><i class="sales" style="width:'+pa.toFixed(2)+'%"></i><i class="income" style="width:'+pb.toFixed(2)+'%"></i></span><small>'+pa.toFixed(1).replace('.',',')+'% / '+pb.toFixed(1).replace('.',',')+'%</small></button>';
 }).join('')+'</div>');
}
function assetValueChart(h){
 const calc=h.calculation||{},value=num(h.value),cost=num(calc.cost);
 if(!calc.verified||!(cost>0)||!(value>=0))return '';
 const peak=Math.max(cost,value,1),pct=(value-cost)/cost*100;
 return panels(heading('Preço de mercado x custo','Apenas custo comprovado, sem estimativa fiscal')+
 '<div class="mt9-value-compare">'+
 [['Custo de aquisição',cost,'sales'],['Valor atual',value,value>=cost?'income':'loss']].map(x=>
 '<div class="mt9-value-row"><span>'+x[0]+'</span><span class="mt9-hbar-track"><i class="'+x[2]+'" style="width:'+(x[1]/peak*100).toFixed(2)+'%"></i></span><b>'+money(x[1])+'</b></div>').join('')+
 '</div><p class="mt9-fineprint">Diferença não realizada: '+money(value-cost)+' ('+pct.toFixed(1).replace('.',',')+'%).</p>');
}

function statusText(d){
 const older=d.holdings.filter(h=>h.quoteStale||h.origin==='estimated').length;
 const unverified=d.openGain?.missing||0;
 return older||unverified?older+' posição(ões) com preços antigos ou estimados · '+unverified+' sem valorização comprovada':'Posições com valores e custos disponíveis conforme as fontes cadastradas';
}
function dataNotices(d){
 let s='';
 if(!d.valid)s+='<div class="mt9-warning">Há divergências nos totais internos. Confira o Diagnóstico antes de interpretar o resultado.</div>';
 const x=d.holdings.filter(h=>h.quoteStale).length;
 if(x)s+='<div class="mt9-softwarning">'+x+' posição(ões) usam a última cotação salva. O valor pode não refletir o mercado de hoje.</div>';
 return s;
}
function assetLine(h){
 const g=h.calculation||{},verified=!!g.verified;
 return '<button type="button" class="mt9-asset" data-asset="'+esc(h.owner+'|'+h.code)+'"><span class="mt9-asset-symbol">'+esc(h.code.slice(0,2))+'</span><span class="mt9-asset-main"><b>'+esc(h.code)+'</b><small>'+esc(classOf(h))+' · '+esc(name(h.owner))+'</small></span><span class="mt9-asset-value"><b>'+money(h.value)+'</b><small class="'+(verified?(g.openGain<0?'negative':'positive'):'dim')+'">'+(verified?money(g.openGain):'Custo não apurado')+'</small></span><span class="mt9-chevron">›</span></button>';
}
function sectionLinks(){
 return '<div class="mt9-actions">'+
 '<button type="button" data-nav="portfolio">Ver carteira <span>›</span></button>'+
 '<button type="button" data-nav="result">Ver resultados <span>›</span></button>'+
 '<button type="button" data-nav="import">Importar B3 <span>›</span></button></div>';
}
function ownerCompare(){
 const a=C.calculate(S,'me'),b=C.calculate(S,'spouse'),sum=a.total+b.total;
 if(sum<=0)return '';
 return panels(heading('Samuel e Jessica','Patrimônio individual, sem misturar as posições')+
 [['me',a],['spouse',b]].map(([o,d])=>'<button type="button" class="mt9-person" data-owner="'+o+'"><div><b>'+esc(name(o))+'</b><small>'+d.holdings.length+' posição(ões)</small></div><strong>'+money(d.total)+'</strong><div class="mt9-track"><span style="width:'+Math.max(0,Math.min(100,d.total/Math.max(1,sum)*100))+'%"></span></div></button>').join(''));
}
function pageHome(){
 const d=full(),v=scoped(),alloc=byClass(d),g=d.openGain,verified=g.matched>0;
 const currentDate=U.owner==='me'?S.positionSnapshot?.date:U.owner==='spouse'?S.spousePositionSnapshot?.date:null;
 const detail=currentDate?'Posição B3 de '+rdate(currentDate)+' + últimas cotações válidas':'Composição da posição registrada e das cotações disponíveis';
 const hero='<section class="mt9-hero"><div class="mt9-eyebrow">PATRIMÔNIO REPRESENTADO</div><div class="mt9-hero-value">'+money(d.total)+'</div><p>'+esc(detail)+'. Não é o somatório de todas as compras.</p><div class="mt9-hero-foot"><span>'+d.holdings.length+' posições</span><button type="button" data-action="refresh">↻ '+(U.quoteLoading?'Atualizando':'Atualizar preços')+'</button></div></section>';
 const performance='<div class="mt9-metrics">'+
 metric('Resultado realizado · período',money(v.realized+v.dividends),'Vendas conciliadas + proventos',v.realized+v.dividends<0?'negative':'positive')+
 metric('Valorização comprovada',verified?money(g.gain):'Não apurada',g.missing+' posição(ões) fora deste cálculo',verified?(g.gain<0?'negative':'positive'):'')+
 metric('Proventos · período',money(v.dividends),v.payouts.length+' pagamentos')+
 metric('Custo conciliado',verified?money(g.cost):'Não disponível','Apenas posições com custo confirmado')+
 '</div>';
 const dist=allocationChart(d,'Onde seu dinheiro está');
 const tops=d.holdings;
 return hero+periodChips()+dataNotices(d)+performance+dist+
 (tops.length?concentrationChart(tops,d.total,'Maiores posições'):'')+
 (v.payouts.length?incomeMonthlyChart(v.payouts):'')+
 (U.owner==='family'?ownerCompare():'')+
 (v.excluded||g.missing?'<button type="button" class="mt9-alertlink" data-nav="needs"><span>◉</span><div><strong>Dados para conferir</strong><small>'+v.excluded+' vendas sem custo apurado · '+g.missing+' posições sem valorização completa</small></div><span>›</span></button>':'')+
 sectionLinks();
}
function classSelect(holdings){
 const classes=[...new Set(holdings.map(classOf))].sort();
 return '<select id="mt9-class" aria-label="Classe de ativo"><option value="all">Todas as classes</option>'+classes.map(x=>'<option value="'+esc(x)+'" '+(U.classe===x?'selected':'')+'>'+esc(x)+'</option>').join('')+'</select>';
}
function pagePortfolio(){
 const base=full(),d=scoped();
 let holdings=d.holdings.slice(),q=U.search.toUpperCase().trim();
 if(q)holdings=holdings.filter(h=>(h.code+' '+(h.product||'')+' '+classOf(h)+' '+name(h.owner)).toUpperCase().includes(q));
 if(U.sort==='name')holdings.sort((a,b)=>a.code.localeCompare(b.code));
 else if(U.sort==='gain')holdings.sort((a,b)=>num(b.calculation?.openGain)-num(a.calculation?.openGain));
 else holdings.sort((a,b)=>b.value-a.value);
 const total=d.total;
 return '<div class="mt9-page-intro"><h2>Seus ativos</h2><p>Posição atual com cotação mais recente disponível; o filtro de período se aplica aos resultados, não à quantidade atual.</p></div>'+
 '<div class="mt9-mini-summary">'+metric('Total selecionado',money(total),d.holdings.length+' posições')+metric('Sem custo comprovado',String(d.openGain.missing),'Não entra na valorização')+'</div>'+
 panels('<div class="mt9-formbar"><input id="mt9-search" type="search" placeholder="Buscar código, ativo ou classe" value="'+esc(U.search)+'" aria-label="Pesquisar investimentos">'+classSelect(base.holdings)+'<select id="mt9-sort" aria-label="Ordenar carteira"><option value="value" '+(U.sort==='value'?'selected':'')+'>Maior valor</option><option value="gain" '+(U.sort==='gain'?'selected':'')+'>Maior lucro apurado</option><option value="name" '+(U.sort==='name'?'selected':'')+'>Código A–Z</option></select></div>'+
 (holdings.length?holdings.slice(0,U.limit).map(assetLine).join(''):empty('Nenhum ativo encontrado','Altere os filtros ou importe a posição B3.'))+
 (holdings.length>U.limit?'<button class="mt9-widebtn" data-action="more">Exibir mais '+(holdings.length-U.limit)+'</button>':'') )+
 (base.holdings.length?concentrationChart(d.holdings,d.total):'')+
 (base.holdings.length?allocationChart(base,'Distribuição da carteira'):'')+
 dataNotices(d);
}
function resultSeries(sales,payouts){
 const by=new Map();
 function add(date,col,val){if(!date)return;const key=U.grain==='year'?date.slice(0,4):date.slice(0,7);if(!by.has(key))by.set(key,{date:key,sales:0,dividends:0});by.get(key)[col]+=num(val);}
 for(const x of sales)if(x.recognized&&Number.isFinite(Number(x.profit)))add(x.date,'sales',x.profit);
 for(const x of payouts)add(x.date,'dividends',x.amount);
 return [...by.values()].sort((a,b)=>a.date.localeCompare(b.date));
}
function resultBars(points){
 const nonzero=points.filter(x=>Math.abs(x.sales)+Math.abs(x.dividends)>.005);
 if(!nonzero.length)return '';
 const last=nonzero.slice(-12),peak=Math.max(1,...last.map(x=>Math.abs(x.sales+x.dividends)));
 return panels(heading('Resultado por '+(U.grain==='year'?'ano':'mês'),'Lucro/prejuízo bruto de vendas com custo + proventos')+
 '<div class="mt9-switch"><button data-grain="month" class="'+(U.grain==='month'?'selected':'')+'">Mensal</button><button data-grain="year" class="'+(U.grain==='year'?'selected':'')+'">Anual</button></div>'+
 '<div class="mt9-bars">'+last.map(x=>{
  const v=round(x.sales+x.dividends),p=Math.min(100,Math.abs(v)/peak*100);
  return '<button class="mt9-bar-row" data-month="'+esc(x.date)+'"><span>'+esc(x.date)+'</span><div class="mt9-track"><i class="'+(v<0?'loss':'')+'" style="width:'+p.toFixed(2)+'%"></i></div><strong class="'+(v<0?'negative':'')+'">'+money(v)+'</strong></button>';
 }).join('')+'</div><p class="mt9-fineprint">Toque em um período para conferir as operações. Não inclui valorização ainda não realizada.</p>');
}
function periodChips(){
 return '<div class="mt9-periods">'+[['30','30d'],['90','90d'],['1y','1 ano'],['5y','5 anos'],['all','Tudo']].map(([value,label])=>
 '<button type="button" data-period="'+value+'" aria-pressed="'+(U.period===value)+'" class="'+(U.period===value?'selected':'')+'">'+label+'</button>').join('')+
 (U.period==='custom'?'<span class="mt9-custom-period">'+esc(rdate(U.from)+' – '+rdate(U.to))+'</span>':'')+'</div>';
}
function saleLine(s){
 const known=s.recognized&&Number.isFinite(Number(s.profit));
 return '<button type="button" class="mt9-event" data-sale="'+esc([s.owner,s.code,s.date,s.qty,s.gross].join('|'))+'"><span><b>'+esc(s.code)+'</b><small>'+rdate(s.date)+' · '+esc(name(s.owner))+' · Venda '+money(s.gross)+'</small></span><strong class="'+(known?(s.profit<0?'negative':'positive'):'dim')+'">'+(known?money(s.profit):'Sem custo')+'</strong></button>';
}
function pageResult(){
 const d=scoped(),series=resultSeries(d.sales,d.payouts),net=d.realized+d.dividends;
 const scope=periodRange();
 return '<div class="mt9-page-intro"><h2>Resultados</h2><p>Lucro realizado comprovado e proventos, separados da variação de preço da carteira.</p></div>'+
 periodChips()+
 '<div class="mt9-feature-total"><span>Resultado realizado · '+rdate(scope.from)+' a '+rdate(scope.to)+'</span><strong class="'+(net<0?'negative':'positive')+'">'+money(net)+'</strong><small>'+d.excluded+' venda(s) não entram no resultado por falta de custo confirmado.</small></div>'+
 '<div class="mt9-mini-summary">'+metric('Vendas conciliadas',money(d.realized),'Lucro ou prejuízo bruto')+metric('Proventos recebidos',money(d.dividends),d.payouts.length+' eventos')+'</div>'+
 (series.length?resultBars(series)+splitResultChart(series)+cumulativeResultChart(series):'')+
 panels(heading('Operações que formam o resultado',d.sales.length+' vendas encontradas no intervalo')+
 (d.sales.length?d.sales.slice().sort((a,b)=>b.date.localeCompare(a.date)).slice(0,U.limit).map(saleLine).join(''):empty('Sem vendas neste intervalo','Experimente outro período.'))+
 (d.sales.length>U.limit?'<button class="mt9-widebtn" data-action="more">Carregar mais operações</button>':''))+
 (d.payouts.length?panels(heading('Proventos do período','Valores efetivamente registrados','<button class="mt9-textbutton" data-nav="income">Ver todos ›</button>')+
 d.payouts.slice().sort((a,b)=>b.date.localeCompare(a.date)).slice(0,5).map(p=>row(p.code,money(p.amount),rdate(p.date)+' · '+name(p.owner))).join('')):'')+
 '<button class="mt9-alertlink" data-nav="needs"><span>ⓘ</span><div><strong>Como o lucro é validado?</strong><small>Compras, vendas, custos, proventos e dados ausentes.</small></div><span>›</span></button>';
}
function pageAI(){
 return '<div class="mt9-page-intro"><h2>Analise com IA</h2><p>O Gemini recebe os códigos e valores da carteira selecionada para responder perguntas específicas. A IA não executa ordens.</p></div>'+
 (root.MoneyTrackerAI?.panel?.()||panels(empty('IA indisponível','O módulo ainda não foi carregado.')));
}
function pageAsset(){
 const h=full().holdings.find(x=>x.owner+'|'+x.code===U.asset);
 if(!h)return panels(empty('Ativo não encontrado','Volte à carteira e tente novamente.'));
 const g=h.calculation||{};
 const records=(S.records||[]).filter(r=>r.owner===h.owner&&E.codeOf(r.t==='trade'?r.v[5]:String(r.v[3]||'').split(' - ')[0])===E.codeOf(h.code)).sort((a,b)=>E.recordDate(b).localeCompare(E.recordDate(a))).slice(0,40);
 const source=h.origin==='quote'?'Última cotação disponível · '+rdate(h.quoteDate):h.origin==='position'?'Última posição B3 · '+rdate(h.date):'Fonte '+(h.source||'registrada');
 return '<button class="mt9-back" data-nav="portfolio">‹ Voltar à carteira</button>'+
 '<div class="mt9-feature-total"><span>'+esc(name(h.owner))+' · '+esc(classOf(h))+'</span><strong>'+esc(h.code)+'</strong><small>'+esc(h.product||source)+'</small></div>'+
 '<div class="mt9-mini-summary">'+metric('Valor da posição',money(h.value),source)+
 metric('Custo de aquisição',g.verified?money(g.cost):'Não comprovado',g.reason||'Não usar preço de mercado como custo')+
 metric('Valorização',g.verified?money(g.openGain):'Não apurada',g.verified?'Ganho em aberto, bruto':'Falta custo validado',g.openGain<0?'negative':'positive')+
 metric('Quantidade',qty(h.qty),h.institution||'')+'</div>'+
 assetValueChart(h)+panels(heading('Histórico deste ativo',records.length+' registros recentes')+
 (records.length?records.map(r=>row(r.t==='trade'?r.v[1]:r.v[2],money(r.v[r.t==='trade'?8:7]),rdate(E.recordDate(r))+' · '+(r.source||'B3'))).join(''):empty('Nenhuma movimentação vinculada','Posição pode ter sido importada de um relatório de custódia.')))+
 (!h.fixedIncome&&h.group!=='Tesouro'?'<button class="mt9-widebtn" data-quote="'+esc(h.code)+'">↻ Atualizar cotação deste ativo</button>':'');
}
function pageSale(){
 const d=full(),sale=(d.d?.sales||[]).find(s=>[s.owner,s.code,s.date,s.qty,s.gross].join('|')===U.sale);
 if(!sale)return panels(empty('Venda não encontrada','A fonte histórica pode ter mudado.'));
 return '<button class="mt9-back" data-nav="result">‹ Voltar aos resultados</button>'+
 '<div class="mt9-feature-total"><span>'+esc(sale.code)+' · '+rdate(sale.date)+'</span><strong>'+ (sale.recognized?money(sale.profit):'Lucro não apurado') +'</strong><small>'+qty(sale.qty)+' unidades · '+esc(name(sale.owner))+'</small></div>'+
 panels(heading('Apuração da venda','Dados brutos, sem estimativas de custo')+
 row('Valor bruto da venda',money(sale.gross))+
 row('Custo reconhecido',sale.recognized?money(sale.cost):'Não comprovado')+
 row('Resultado bruto',sale.recognized?money(sale.profit):'Excluído')+
 '<p class="mt9-fineprint">'+esc(sale.source||sale.reason||'Apurado conforme registros B3 disponíveis.')+'</p>');
}
function pageIncome(){
 const d=scoped();
 return '<button class="mt9-back" data-nav="more">‹ Voltar</button><div class="mt9-page-intro"><h2>Proventos</h2><p>Dividendos, rendimentos e juros efetivamente registrados.</p></div>'+
 periodChips()+'<div class="mt9-feature-total"><span>Total recebido no período</span><strong>'+money(d.dividends)+'</strong><small>'+d.payouts.length+' pagamento(s)</small></div>'+
 incomeMonthlyChart(d.payouts)+incomeTopChart(d.payouts)+
 panels(heading('Pagamentos','Detalhamento por data')+
 (d.payouts.length?d.payouts.slice().sort((a,b)=>b.date.localeCompare(a.date)).slice(0,U.limit).map(p=>row(p.code,money(p.amount),rdate(p.date)+' · '+name(p.owner)+' · '+(p.type||''))).join(''):empty('Sem proventos','Não há pagamentos neste período.'))+
 (d.payouts.length>U.limit?'<button class="mt9-widebtn" data-action="more">Carregar mais</button>':''));
}
function pageCompare(){
 const p=periodRange(),a=C.calculate(S,'me'),b=C.calculate(S,'spouse');
 const av=C.view(S,{owner:'me',from:p.from,to:p.to}),bv=C.view(S,{owner:'spouse',from:p.from,to:p.to});
 return '<button class="mt9-back" data-nav="more">‹ Voltar</button><div class="mt9-page-intro"><h2>Comparar carteiras</h2><p>Patrimônio atual e resultados no mesmo período; comparações não são rentabilidade percentual.</p></div>'+
 periodChips()+panels(heading('Patrimônio hoje','Valores atuais por titular')+
 row(name('me'),money(a.total),a.holdings.length+' posições')+row(name('spouse'),money(b.total),b.holdings.length+' posições')+
 row('Família',money(a.total+b.total)))+
 panels(heading('Resultado realizado no período','Vendas conciliadas + proventos, sem valorização em aberto')+
 row(name('me'),money(av.realized+av.dividends),'Vendas '+money(av.realized)+' · proventos '+money(av.dividends))+
 row(name('spouse'),money(bv.realized+bv.dividends),'Vendas '+money(bv.realized)+' · proventos '+money(bv.dividends))+
 row('Família',money(av.realized+av.dividends+bv.realized+bv.dividends)))+
 ownerClassChart(a,b);
}
function pageNeeds(){
 const issues=E.gaps(S,U.owner)||[],d=scoped(),g=full().openGain;
 return '<button class="mt9-back" data-nav="more">‹ Voltar</button><div class="mt9-page-intro"><h2>Diagnóstico</h2><p>Pendências calculadas em tempo real; nenhuma é cadastrada manualmente como resolvida.</p></div>'+
 '<div class="mt9-mini-summary">'+metric('Alertas',String(issues.length),'Regras sobre os dados existentes')+metric('Vendas excluídas',String(d.excluded),'Sem custo comprovado')+metric('Posições sem valorização',String(g.missing),'Sem preço ou custo rastreável')+'</div>'+
 (!full().valid?panels(heading('Conferência de totais','Há divergências no motor de cálculo')+
 full().issues.map(i=>row(i.title,money(i.difference))).join('')):'')+
 panels(heading('O que falta conferir','Cada item indica a evidência necessária')+
 (issues.length?issues.map(i=>'<article class="mt9-issue"><div>'+pill(i.level==='critical'?'Prioridade alta':i.level==='warning'?'Atenção':'Informação',i.level==='critical'?'error':'')+'</div><h3>'+esc(i.title)+'</h3><p>'+esc(i.why||'')+'</p><small>'+esc(i.action||'')+'</small></article>').join(''):empty('Sem pendências detectadas','As regras atuais não encontraram registros incompletos.')))+
 '<button class="mt9-widebtn" data-nav="import">Importar documentos B3</button>';
}
function pageHistory(){
 const {from,to}=periodRange();
 const r=(S.records||[]).filter(x=>(U.owner==='family'||x.owner===U.owner)&&E.recordDate(x)>=from&&E.recordDate(x)<=to&&(U.history==='all'||x.t===U.history)&&
 !E.isSubscriptionRight(x.t==='trade'?x.v[5]:String(x.v[3]||'').split(' - ')[0],'',x.t==='mov'?x.v[3]:'')&&
 !(x.t==='mov'&&E.isSubscriptionEvent(x.v[2])))
 .map(x=>({date:E.recordDate(x),owner:x.owner,label:x.t==='trade'?x.v[5]:x.v[3],kind:x.t==='trade'?x.v[1]:x.v[2],amount:num(x.v[x.t==='trade'?8:7])}));
 const fixed=(S.fixedIncomeTransactions||[]).filter(x=>(U.owner==='family'||x.owner===U.owner)&&x.date>=from&&x.date<=to&&(U.history==='all'||U.history==='fixed'))
 .map(x=>({date:x.date,owner:x.owner,label:x.assetCode,kind:x.operation==='sell'?'Resgate':'Aplicação',amount:num(x.amount)}));
 const list=r.concat(fixed).sort((a,b)=>b.date.localeCompare(a.date)),query=U.search.toUpperCase();
 const filtered=query?list.filter(x=>(x.label+' '+x.kind).toUpperCase().includes(query)):list;
 return '<button class="mt9-back" data-nav="more">‹ Voltar</button><div class="mt9-page-intro"><h2>Histórico B3</h2><p>Compras, vendas, movimentações e aplicações sem duplicações artificiais.</p></div>'+periodChips()+
 panels('<div class="mt9-formbar"><input id="mt9-search" placeholder="Buscar ativo ou operação" value="'+esc(U.search)+'"><select id="mt9-history"><option value="all">Todas</option><option value="trade" '+(U.history==='trade'?'selected':'')+'>Negociações</option><option value="mov" '+(U.history==='mov'?'selected':'')+'>Movimentações</option><option value="fixed" '+(U.history==='fixed'?'selected':'')+'>Renda fixa</option></select></div><p class="mt9-fineprint">'+filtered.length+' lançamentos encontrados</p>'+
 (filtered.length?filtered.slice(0,U.limit).map(x=>row(x.label,money(x.amount),rdate(x.date)+' · '+name(x.owner)+' · '+x.kind)).join(''):empty('Nenhum lançamento encontrado','Altere o período ou termo de busca.'))+
 (filtered.length>U.limit?'<button class="mt9-widebtn" data-action="more">Carregar mais</button>':''));
}
function pageImport(){
 return '<button class="mt9-back" data-nav="more">‹ Voltar</button><div class="mt9-page-intro"><h2>Importar dados da B3</h2><p>Negociação, Movimentação e Posição em arquivos .xlsx. Novas operações são conciliadas com as existentes antes de salvar.</p></div>'+
 panels(heading('Escolha o titular','A importação não mistura Samuel e Jessica')+
 '<label class="mt9-field">Carteira<select id="mt9-import-owner"><option value="me" '+(U.importOwner==='me'?'selected':'')+'>'+esc(name('me'))+'</option><option value="spouse" '+(U.importOwner==='spouse'?'selected':'')+'>'+esc(name('spouse'))+'</option></select></label>'+
 '<label class="mt9-upload" for="mt9-files"><span>⇧</span><strong>Selecionar arquivos B3</strong><small>Somente .xlsx · pode selecionar vários</small><input type="file" id="mt9-files" multiple accept=".xlsx" '+(busy?'disabled':'')+'></label>'+
 (U.importMessage?'<div class="mt9-softwarning">'+esc(U.importMessage)+'</div>':'')+
 '<p class="mt9-fineprint">Os arquivos são analisados no navegador. Operações repetidas são ignoradas e nenhuma posição existente é apagada por uma importação de histórico.</p>')+
 panels(heading('Arquivos já registrados',Object.keys(S.sources||{}).length+' fontes')+
 Object.entries(S.sources||{}).slice(-12).reverse().map(([k,v])=>row(k,(v.accepted||0)+' registros',name(v.owner||'me'))).join(''));
}
function pageQuotes(){
 const holdings=C.calculate(S,'family').holdings.filter(h=>!h.fixedIncome&&h.group!=='Tesouro');
 const unique=[...new Set(holdings.map(h=>h.code))];
 return '<button class="mt9-back" data-nav="more">‹ Voltar</button><div class="mt9-page-intro"><h2>Cotações</h2><p>Atualize preços sem alterar custos de aquisição e veja a data real de cada fonte.</p></div>'+
 panels(heading('Preços da carteira',unique.length+' símbolos distintos')+
 '<button class="mt9-widebtn" data-action="refresh" '+(U.quoteLoading?'disabled':'')+'>↻ '+(U.quoteLoading?'Atualizando…':'Atualizar todas as cotações')+'</button>'+
 (U.quoteProgress?'<p class="mt9-fineprint" id="mt9-progress">'+esc(U.quoteProgress)+'</p>':'')+
 (U.quoteErrors.length?'<div class="mt9-softwarning">'+U.quoteErrors.length+' ativos sem cotação nova. Valor anterior preservado.</div>':'')+
 (holdings.length?holdings.slice(0,U.limit).map(h=>'<div class="mt9-quote-row"><div><b>'+esc(h.code)+'</b><small>'+esc(name(h.owner))+' · '+qty(h.qty)+' un. · '+money(h.origin==='quote'?h.unit:h.snapshotPrice||h.unit||0)+'/un. · '+esc(h.origin==='quote'?(h.quoteStale?'Cotação salva antiga':'Cotação salva'):'Posição B3')+' '+rdate(h.quoteDate||h.date)+'</small></div><strong>'+money(h.value)+'</strong><button data-quote="'+esc(h.code)+'" aria-label="Atualizar '+esc(h.code)+'">↻</button></div>').join(''):empty('Sem posições para cotar','Importe uma posição B3.'))+
 (holdings.length>U.limit?'<button class="mt9-widebtn" data-action="more">Carregar mais</button>':'') )+
 '<p class="mt9-fineprint">Quando uma cotação falha, a última fonte válida é mantida e identificada pela data. Tesouro e renda fixa não recebem preços fictícios.</p>';
}
function pageMore(){
 const sourceCount=Object.keys(S.sources||{}).length,recordCount=(S.records||[]).filter(r=>!E.isSubscriptionRight(r.t==='trade'?r.v[5]:String(r.v[3]||'').split(' - ')[0],'',r.t==='mov'?r.v[3]:'')).length;
 const links=[['import','⇧','Importar B3','Adicionar arquivos e atualizar posições'],['quotes','↻','Cotações','Ver fontes e atualizar preços'],['history','≡','Histórico completo','Negociações e movimentações'],['income','↓','Proventos','Dividendos e rendimentos'],['compare','⇄','Comparar carteiras','Samuel, Jessica e Família'],['needs','◉','Diagnóstico','Conferência dos dados e custos']];
 return '<div class="mt9-page-intro"><h2>Mais ferramentas</h2><p>Gestão dos dados e funcionalidades ocasionais, sem complicar o dia a dia.</p></div>'+
 panels(links.map(([id,sym,title,sub])=>'<button type="button" class="mt9-menu-item" data-nav="'+id+'"><span class="mt9-menu-icon">'+sym+'</span><span><b>'+title+'</b><small>'+sub+'</small></span><span>›</span></button>').join(''))+
 panels(heading('Conta e segurança','Seu histórico continua no Supabase autenticado')+
 row('Registros exibidos',String(recordCount))+
 row('Fontes registradas',String(sourceCount))+
 '<div class="mt9-status" id="mt7-cloud-status">'+esc(root.MoneyTrackerCloudV7?.status||'Verificando sincronização…')+'</div>'+
 '<div class="mt9-button-grid">'+btn('Sincronizar','sync',true)+btn('Exportar backup','backup',true)+btn('Restaurar backup','restore',true)+btn('Alternar tema','theme',true)+btn('Sair da conta','logout',true)+'</div>'+
 '<input type="file" id="mt9-restore-file" accept=".json,application/json" hidden>')+
 panels(heading('Nomes exibidos','Ajuste os nomes sem alterar a titularidade dos lançamentos')+
 ['me','spouse','family'].map(o=>'<label class="mt9-field">'+esc(o==='me'?'Primeira carteira':o==='spouse'?'Segunda carteira':'Visão conjunta')+'<input class="mt9-name-input" id="mt9-name-'+o+'" maxlength="32" value="'+esc(name(o))+'"></label>').join('')+
 '<button class="mt9-widebtn" data-action="save-names">Salvar nomes</button>');
}
const TITLES={home:'Visão geral',portfolio:'Carteira',result:'Resultados',ai:'IA',more:'Mais',asset:'Detalhes do ativo',sale:'Venda',income:'Proventos',compare:'Comparação',history:'Histórico',needs:'Diagnóstico',import:'Importar B3',quotes:'Cotações'};
function shell(html){
 const topnav=[['home','Início','⌂'],['portfolio','Carteira','▦'],['result','Resultados','↗'],['ai','IA','✦'],['more','Mais','☰']];
 return '<div class="mt9-app"><aside class="mt9-sidebar"><div class="mt9-logo"><span>↗</span><div>MoneyTracker<small>Seu patrimônio, explicado.</small></div></div><nav>'+topnav.map(x=>navButton(...x)).join('')+'</nav><div class="mt9-side-footer">Versão 3.0 · B3 + Supabase</div></aside>'+
 '<div class="mt9-main"><header class="mt9-header"><div><div class="mt9-eyebrow">MONEYTRACKER</div><h1>'+TITLES[U.page]+'</h1></div><button class="mt9-sync-button" data-action="refresh" title="Atualizar cotações" '+(U.quoteLoading?'disabled':'')+'>↻ <span>'+ (U.quoteLoading?'Atualizando':'Cotações')+'</span></button></header>'+
 '<div class="mt9-filterline"><label for="mt9-owner" class="sr-only">Titular</label><select id="mt9-owner"><option value="family" '+(U.owner==='family'?'selected':'')+'>'+esc(name('family'))+'</option><option value="me" '+(U.owner==='me'?'selected':'')+'>'+esc(name('me'))+'</option><option value="spouse" '+(U.owner==='spouse'?'selected':'')+'>'+esc(name('spouse'))+'</option></select>'+
 (['home','result','income','compare','history'].includes(U.page)?'<span class="mt9-context-period">'+(U.period==='all'?'Todo histórico':U.period==='30'?'30 dias':U.period==='90'?'90 dias':U.period==='1y'?'1 ano':U.period==='5y'?'5 anos':'Período')+'</span>':'')+
 '<span class="mt9-filter-info">'+(authenticated?'Conta conectada':'Conectando…')+'</span></div>'+
 '<main class="mt9-content">'+html+'</main></div>'+
 '<nav class="mt9-bottom" aria-label="Navegação principal">'+topnav.map(x=>navButton(...x)).join('')+'</nav></div>';
}
function render(){
 const target=el('mt7-app');if(!target)return;
 try{
  const pages={home:pageHome,portfolio:pagePortfolio,result:pageResult,ai:pageAI,more:pageMore,asset:pageAsset,sale:pageSale,income:pageIncome,compare:pageCompare,needs:pageNeeds,history:pageHistory,import:pageImport,quotes:pageQuotes};
  target.innerHTML=shell((pages[U.page]||pageHome)());
 }catch(e){
  console.error('MoneyTracker: falha na interface',e);
  target.innerHTML=shell(panels(empty('Não foi possível exibir esta tela',e.message||'Erro inesperado.')+'<button data-nav="home" class="mt9-widebtn">Voltar ao início</button>'));
 }
}
function go(page){if(!['portfolio','asset'].includes(page))U.classe='all';U.page=page;U.limit=45;U.search='';if(page==='import'&&U.owner!=='family')U.importOwner=U.owner;root.scrollTo?.(0,0);render();}
function toast(msg,error=false){
 const box=el('mt7-toasts');if(!box)return;
 box.innerHTML='<div class="mt9-toast '+(error?'error':'')+'" role="status">'+esc(msg)+'</div>';
 clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>{box.innerHTML='';},6500);
}
function save(next){
 C.invalidate(S);S=E.normalizeState(next);render();root.MoneyTrackerCloudV7?.scheduleSave(S);
}
function backup(){
 const url=URL.createObjectURL(new Blob([JSON.stringify({format:'moneytracker-backup',version:9,date:new Date().toISOString(),data:S},null,2)],{type:'application/json'}));
 const a=document.createElement('a');a.href=url;a.download='moneytracker-backup-'+day()+'.json';document.body.appendChild(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),4000);
}
async function importFiles(files){
 if(!authenticated||busy||U.quoteLoading||!files?.length)return;
 busy=true;U.importMessage='Conferindo '+files.length+' arquivo(s)…';render();
 try{
  const result=await E.importXlsx(S,U.importOwner,files,root.MoneyTrackerExcel);
  const {added,duplicates,positionsChanged,invalid}=result.summary;
  U.importMessage=added+' operações novas · '+duplicates+' já registradas · '+positionsChanged+' posições atualizadas'+(invalid?' · '+invalid+' linhas ignoradas':'')+'.';
  if(added||positionsChanged)save(result.next);
  toast(added||positionsChanged?'Importação concluída, sem duplicar operações.':'Arquivos conferidos: nenhuma operação nova.');
 }catch(e){U.importMessage='Importação interrompida. Nenhum registro alterado: '+(e.message||e);toast(U.importMessage,true);}
 finally{busy=false;render();}
}
function quoteCodes(symbols){
 const d=C.calculate(S,'family');
 const codes=[...new Set(d.holdings.filter(h=>!h.fixedIncome&&h.group!=='Tesouro'&&/^[A-Z][A-Z0-9]{3,11}$/.test(h.code)).map(h=>h.code))];
 return symbols?codes.filter(x=>symbols.includes(x)):codes;
}
async function refresh(auto=false,symbols=null){
 if(!authenticated||busy||U.quoteLoading)return;
 const now=Date.now();
 if(auto&&now-lastQuoteRun<20*60*1000)return;
 let codes=quoteCodes(symbols);
 if(auto)codes=codes.filter(code=>!S.quotes?.[code]||!Number.isFinite(Date.parse(S.quotes[code].at))||now-Date.parse(S.quotes[code].at)>20*60*1000);
 if(!codes.length){if(!auto)toast('Nenhum ativo elegível para cotação.');return;}
 lastQuoteRun=now;U.quoteLoading=true;U.quoteErrors=[];U.quoteProgress='Consultando 0 de '+codes.length+'…';render();
 let index=0,done=0;const updates={},failures=[];
 async function worker(){
  while(index<codes.length){
   const code=codes[index++];
   try{
    const data=await root.MoneyTrackerCloudV7.quote(code);
    const price=Number(data.price);
    if(!Number.isFinite(price)||price<=0||String(data.symbol||code).toUpperCase()!==code)throw Error('Cotação inválida');
    const old=S.quotes?.[code],oldDate=String(old?.marketDate||old?.at||'').slice(0,10);
    const marketDate=String(data.marketDate||data.at||new Date().toISOString()).slice(0,10);
    if(oldDate&&oldDate>marketDate&&Number(old?.price)>0)throw Error('Cotação anterior à armazenada');
    updates[code]={price,marketDate,at:data.at||new Date().toISOString(),provider:data.provider||'Fonte sem identificação',changePercent:data.changePercent,type:data.type||'cotacao'};
   }catch(e){failures.push({symbol:code,message:String(e.message||e)});}
   done++;U.quoteProgress='Consultados '+done+' de '+codes.length+' · '+Object.keys(updates).length+' com preço válido.';
   const txt=el('mt9-progress');if(txt)txt.textContent=U.quoteProgress;
  }
 }
 try{await Promise.all(Array.from({length:Math.min(4,codes.length)},()=>worker()));}
 finally{
  U.quoteErrors=failures;U.quoteLoading=false;
  const n=Object.keys(updates).length;
  U.quoteProgress=n?n+' cotações conferidas; '+failures.length+' indisponíveis.':'Nenhuma cotação nova disponível.';
  if(n)save({...S,quotes:{...S.quotes,...updates}});else render();
  if(!auto)toast(U.quoteProgress,!n);
 }
}
function theme(){
 const next=document.documentElement.dataset.theme==='dark'?'light':'dark';
 document.documentElement.dataset.theme=next;
 try{root.localStorage.setItem('moneytracker-theme-v1',next);}catch(_){}
 const meta=document.querySelector('meta[name="theme-color"]');if(meta)meta.content=next==='dark'?'#0a1120':'#f3f6fc';
 render();
}

function drillPeriod(date,page){
 if(!/^\d{4}(?:-\d{2})?$/.test(date))return;
 U.period='custom';U.from=date.length===4?date+'-01-01':date+'-01';
 if(date.length===4)U.to=date+'-12-31';
 else{const d=new Date(+date.slice(0,4),+date.slice(5,7),0);
  U.to=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
 go(page);
}
function listeners(){
 document.addEventListener('click',ev=>{
  const b=ev.target.closest('[data-nav],[data-asset],[data-sale],[data-period],[data-grain],[data-class],[data-month],[data-income-month],[data-focus-code],[data-quote],[data-action]');
  if(!b)return;
  if(b.dataset.nav){go(b.dataset.nav);return;}
  if(b.dataset.asset){U.asset=b.dataset.asset;go('asset');return;}
   if(b.dataset.focusCode){go('portfolio');U.search=b.dataset.focusCode;render();return;}
  if(b.dataset.sale){U.sale=b.dataset.sale;go('sale');return;}
  if(b.dataset.period){U.period=b.dataset.period;U.limit=45;remember();render();return;}
  if(b.dataset.grain){U.grain=b.dataset.grain;render();return;}
  if(b.dataset.class){U.classe=b.dataset.class;go('portfolio');return;}
  if(b.dataset.month||b.dataset.incomeMonth){drillPeriod(b.dataset.month||b.dataset.incomeMonth,b.dataset.incomeMonth?'income':'result');return;}
  if(b.dataset.quote){refresh(false,[b.dataset.quote]);return;}
  const action=b.dataset.action;
  if(action==='refresh')refresh(false);
  if(action==='more'){U.limit+=45;render();}
  if(action==='sync')root.MoneyTrackerCloudV7?.sync();
  if(action==='backup')backup();
  if(action==='restore')el('mt9-restore-file')?.click();
  if(action==='logout')root.MoneyTrackerCloudV7?.logout();
  if(action==='theme')theme();
  if(action==='save-names'){
   const next={...S.displayNames};
   for(const o of ['me','spouse','family'])next[o]=String(el('mt9-name-'+o)?.value||name(o)).trim().slice(0,32)||name(o);
   save({...S,displayNames:next});toast('Nomes atualizados.');
  }
 });
 document.addEventListener('keydown',ev=>{if((ev.key==='Enter'||ev.key===' ')&&ev.target.closest?.('.mt9-line-dot[data-month]')){ev.preventDefault();drillPeriod(ev.target.dataset.month,'result');}});
 document.addEventListener('change',async ev=>{
  const t=ev.target;
  if(t.id==='mt9-owner'){U.owner=t.value;U.classe='all';U.limit=45;remember();render();}
  if(t.id==='mt9-class'){U.classe=t.value;render();}
  if(t.id==='mt9-sort'){U.sort=t.value;render();}
  if(t.id==='mt9-history'){U.history=t.value;render();}
  if(t.id==='mt9-import-owner'){U.importOwner=t.value;}
  if(t.id==='mt9-files'){const files=Array.from(t.files||[]);await importFiles(files);}
  if(t.id==='mt9-restore-file'&&t.files?.[0]){
   try{
    const doc=JSON.parse(await t.files[0].text());
    if(doc.format!=='moneytracker-backup'||!Array.isArray(doc.data?.records))throw Error('Backup inválido.');
    if(!root.confirm('Restaurar este backup substitui o snapshot atual. Recomenda-se baixar um backup da versão existente. Continuar?'))return;
    save(doc.data);toast('Backup restaurado e sincronização solicitada.');
   }catch(e){toast('Falha ao restaurar: '+(e.message||e),true);}
  }
 });
 document.addEventListener('input',ev=>{
  if(ev.target.id!=='mt9-search')return;
  U.search=ev.target.value;const p=ev.target.selectionStart;render();
  const input=el('mt9-search');if(input){input.focus();try{input.setSelectionRange(p,p);}catch(_){}}
 });
}
root.MoneyTrackerAppV7={
 getState:()=>S,
 setState:next=>{C.invalidate(S);S=E.normalizeState(next);render();},
 getUi:()=>U,isBusy:()=>busy||U.quoteLoading,notify:toast,render,
 loginReady:()=>{authenticated=true;el('mt7-auth').hidden=true;render();setTimeout(()=>{root.MoneyTrackerCloudV7?.refreshIfChanged?.();refresh(true);},1000);},
 loginNeeded:()=>{authenticated=false;el('mt7-auth').hidden=false;},
 onSyncError:msg=>toast(msg,true),loginStatus:msg=>{const e=el('mt7-auth-status');if(e)e.textContent=msg||'';},
 isAuthenticated:()=>authenticated
};
listeners();render();
document.addEventListener('visibilitychange',()=>{if(document.visibilityState!=='hidden'&&authenticated){root.MoneyTrackerCloudV7?.refreshIfChanged?.();refresh(true);}});
})(window);
