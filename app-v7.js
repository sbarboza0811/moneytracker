(function(root){
'use strict';
const E=root.MoneyTrackerEngine;
if(!E)throw Error('Motor financeiro não carregado');
let S=E.newState(),auth=false,busy=false,saveError=false,toastTimeout;
let analysis=null,analysisOwner=null,analysisState=null;
function invalidateAnalysis(){analysis=null;analysisOwner=null;analysisState=null;}
function analyzeNow(){const result={issues:E.gaps(S,ui.owner),gains:E.gains(S,ui.owner,'all'),portfolio:E.portfolio(S,ui.owner)};analysis=result;analysisOwner=ui.owner;analysisState=S;return result;}
const ui={page:'home',owner:'family',importOwner:'me',period:'all',category:'all',search:'',assetKey:null,historyKind:'all',historyLimit:70,importMessage:''};
const NAV=[['home','⌂','Início'],['portfolio','▤','Carteira'],['profit','↗','Lucro'],['import','⇧','Importar'],['needs','☑','Pendências']];
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=E.money,fmt=E.fmt,num=E.number;
const dollar=n=>'<strong>'+money(n)+'</strong>';
const titlebar=(label,link,label2)=>'<div class="mt7-cardhead"><h2>'+esc(label)+'</h2>'+(link?'<button type="button" data-nav="'+link+'">'+esc(label2||'Ver mais')+' ›</button>':'')+'</div>';
const card=(html,cls='')=>'<section class="mt7-card '+cls+'">'+html+'</section>';
const stat=(label,value,note='',target='')=>(target?'<button type="button" data-nav="'+target+'" class="mt7-stat">':'<div class="mt7-stat">')+
 '<small>'+esc(label)+'</small><strong>'+esc(value)+'</strong>'+(note?'<div class="note">'+esc(note)+'</div>':'')+(target?'</button>':'</div>');
function go(page){
 ui.page=page;
 ui.search='';ui.historyLimit=70;
 if(page==='import'&&ui.owner!=='family')ui.importOwner=ui.owner;
 root.scrollTo?.({top:0,behavior:'instant'});
 render();
}
function ownerButton(o,label){return '<button type="button" data-owner="'+o+'" class="'+(ui.owner===o?'active':'')+'" aria-pressed="'+String(ui.owner===o)+'">'+esc(label)+'</button>';}
function navButton(id,icon,label){return '<button type="button" data-nav="'+id+'" class="'+(ui.page===id?'active':'')+'" aria-current="'+(ui.page===id?'page':'false')+'"><b>'+icon+'</b>'+label+'</button>';}
function layout(content){
 const pages={home:'Visão geral',portfolio:'Carteira',profit:'Resultados',import:'Importar B3',needs:'Pendências',asset:'Ativo',income:'Proventos',history:'Histórico',insights:'Análises',quotes:'Cotações',more:'Mais'};
 return '<div class="mt7-app">'+
 '<aside class="mt7-side"><div class="mt7-brand"><i>↗</i><span>money<span>tracker</span></span></div>'+
 '<nav>'+NAV.map(n=>'<button type="button" data-nav="'+n[0]+'" class="'+(ui.page===n[0]?'active':'')+'"><span class="ico">'+n[1]+'</span>'+n[2]+'</button>').join('')+
 '<button data-nav="more"><span class="ico">☰</span>Mais</button></nav>'+
 '<div class="foot">Seus investimentos, no seu controle.<div class="mt7-version">MoneyTracker 7.8 · Dados privados</div></div></aside>'+
 '<main class="mt7-body"><header class="mt7-top"><div><div class="mt7-eyebrow">MoneyTracker / Versão 7.8</div><h1>'+pages[ui.page]+'</h1></div>'+
 '<div class="mt7-top-actions"><button data-nav="needs" title="O que falta para completar" class="mt7-iconbtn" aria-label="Pendências">☑</button>'+
 '<button data-nav="more" title="Conta, backup e sincronização" class="mt7-iconbtn" aria-label="Mais">☰</button></div></header>'+
 '<div class="mt7-owners" role="group" aria-label="Selecionar carteira">'+ownerButton('family','Família')+ownerButton('me','Minha')+ownerButton('spouse','Esposa')+'</div>'+
 '<div class="mt7-content">'+content+'</div></main>'+
 '<nav class="mt7-bottom" aria-label="Menu principal">'+NAV.map(n=>navButton(...n)).join('')+'</nav></div>';
}
function accountNotice(p){
 if(p.valuation==='mixed')return '<div class="mt7-note warning"><strong>Patrimônio familiar com bases diferentes.</strong> Sua posição de 2026 é um valor de mercado; a da Jessica é reconstruída do histórico, não uma posição atual de 2026. As vendas históricas dela já estão conciliadas. <button data-nav="needs">Detalhes ›</button></div>';
 if(p.valuation==='historical'&&p.holdings.length)return '<div class="mt7-note"><strong>Carteira estimada por custo histórico.</strong> As vendas da Jessica estão conciliadas; o valor de mercado aberto não é uma cotação atual. <button data-nav="needs">Detalhes ›</button></div>';
 return '';
}
function sourceSplit(p){
 const owners=ui.owner==='family'?['me','spouse']:[ui.owner];
 return '<div class="mt7-cards3">'+owners.map(o=>{
  const x=p.byPerson[o]||{},label=o==='me'?'Minha':'Esposa';
  return stat(label+(x.source==='estimated'?' · estimado':' · B3'),money(x.total||0),(x.count||0)+' posições · '+(x.source==='estimated'?'custo histórico':E.dateBR(x.date)||'posição importada'),'portfolio');
 }).join('')+'</div>';
}
function profitCards(g,p){
 const openLabel=ui.period==='all'?(g.openGain===null?'Sem base de custo':money(g.openGain)):'Não incluída';
 return '<div class="mt7-cards3">'+
 stat('Lucro nas vendas · apurado',money(g.realized),g.sales+' vendas com custo verificado','profit')+
 stat('Proventos identificados',money(g.dividends),g.payments+' pagamentos','income')+
 stat('Valorização em aberto'+(ui.period==='all'?(g.partial?' · parcial':''):' · não incluída'),openLabel,ui.period==='all'?g.matched+' posições avaliadas':'Sem preços históricos comparáveis','profit')+
 stat('Valor da posição',money(p.total),p.valuation==='mixed'?'B3 + estimativa histórica':'Valor conforme fontes disponíveis','portfolio')+
 '</div>';
}
function periodFilters(){
 return '<div class="mt7-filter" role="group" aria-label="Período dos resultados">'+
 [['30','30 dias'],['90','90 dias'],['1y','1 ano'],['5y','5 anos'],['all','Todos']].map(([v,label])=>
 '<button type="button" data-period="'+v+'" aria-pressed="'+String(ui.period===v)+'" class="'+(ui.period===v?'active':'')+'">'+label+'</button>').join('')+'</div>';
}
function profitSummary(g){
 const incomplete=!g.complete||g.partial||g.excludedSales>0||g.missing>0;
 const historical=ui.period!=='all';
 const message=historical?'Resultado realizado · parcial':(incomplete?'Resultado parcial':'Resultado total apurado');
 const display=money(g.profit);
 return card(titlebar('Resultados · '+E.periodLabel[ui.period],'profit','Detalhar')+
 periodFilters()+
 '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:12px"><div class="mt7-mainnumber">'+display+'</div><span class="mt7-pill '+(incomplete?'warn':'')+'">'+message+'</span></div>'+
 '<p class="mt7-label">'+(historical?'Vendas e proventos do período, sem valorização de posições abertas.':(incomplete?'Soma das parcelas calculáveis; alguma valorização ou custo ainda não foi confirmado.':'Vendas, proventos e valorização aberta calculados com os dados disponíveis.'))+'</p>'+
 (g.warning?'<div class="mt7-note warning" style="margin-top:13px">'+esc(g.warning)+'</div>':'')+
 (incomplete&&!historical?'<div class="mt7-note warning" style="margin-top:13px">O valor exibido é parcial. Consulte <button type="button" data-nav="needs">Pendências ›</button> para conferir o que impede o total completo.</div>':''));
}
function holdingsRows(p,limit=7){
 const holdings=p.holdings.slice(0,limit);
 return holdings.length?holdings.map(h=>'<button type="button" class="mt7-row" data-asset="'+esc(h.owner+'|'+h.code)+'">'+
 '<span class="mt7-symbol">'+esc(h.group==='Tesouro'?'TD':h.code.slice(0,2))+'</span>'+
 '<span class="info"><b>'+esc(h.product||h.code)+'</b><small>'+esc(h.owner==='me'?'Minha':'Esposa')+
 ' · '+esc(h.group)+' · '+fmt(h.qty)+' un.</small></span><span class="price"><strong>'+money(h.value)+'</strong>'+
 '<small>'+(h.origin==='estimated'?'Custo histórico':h.origin==='quote'?'Cotação consultada':'Posição B3')+'</small></span></button>').join(''):
 '<div class="mt7-chartempty">Nenhuma posição encontrada. Abra Importar e selecione os arquivos da B3.</div>';
}
function allocation(p){
 const groups=Object.entries(p.classes).filter(x=>x[1]>0).sort((a,b)=>b[1]-a[1]);
 if(!groups.length)return '<div class="mt7-chartempty">Sem posições.</div>';
 const max=groups[0][1];
 return '<div class="mt7-barlist">'+groups.map(([name,v])=>'<div class="mt7-barrow"><small>'+esc(name)+'</small><div class="mt7-bartrack"><div class="mt7-barfill" style="width:'+((v/max)*100).toFixed(1)+'%"></div></div><strong>'+((v/p.total)*100).toFixed(1).replace('.',',')+'%</strong></div>').join('')+'</div>';
}
function monthlyChart(g){
 const months=g.monthly;
 if(!months.length)return '<div class="mt7-chartempty">Não existem ganhos realizados nem proventos registrados nesse período. Importe o histórico ou escolha outro intervalo.</div>';
 let acc=0;
 const values=months.map(m=>{acc+=m.realized+m.dividends;return {label:m.month.slice(5)+'/'+m.month.slice(2,4),value:acc};});
 if(values.length===1)return '<div class="mt7-chartempty"><strong>'+money(values[0].value)+'</strong><br>Resultado identificado em '+esc(values[0].label)+'. Para uma curva, são necessários dados em mais de um mês.</div>';
 const width=620,height=185,pad=22;
 const vals=values.map(x=>x.value),min=Math.min(0,...vals),max=Math.max(0,...vals),range=Math.max(1,max-min);
 const x=i=>pad+i*(width-2*pad)/(values.length-1);
 const y=v=>height-pad-(v-min)/range*(height-2*pad);
 const points=values.map((v,i)=>x(i).toFixed(1)+','+y(v.value).toFixed(1)).join(' ');
 return '<svg viewBox="0 0 '+width+' '+height+'" class="mt7-chart" role="img" aria-label="Evolução do lucro realizado e proventos no intervalo">'+
 '<line class="gridline" x1="'+pad+'" y1="'+y(0).toFixed(1)+'" x2="'+(width-pad)+'" y2="'+y(0).toFixed(1)+'"/>'+
 '<polyline class="gain" points="'+points+'"/>'+
 values.map((v,i)=>'<circle r="4" cx="'+x(i).toFixed(1)+'" cy="'+y(v.value).toFixed(1)+'" fill="#118460"><title>'+esc(v.label)+' · '+money(v.value)+'</title></circle>').join('')+
 '<text x="'+pad+'" y="'+(height-3)+'" font-size="11" fill="#7b9282">'+esc(values[0].label)+'</text>'+
 '<text x="'+(width-pad)+'" y="'+(height-3)+'" text-anchor="end" font-size="11" fill="#7b9282">'+esc(values.at(-1).label)+'</text></svg>'+
 '<p class="mt7-footnote">Evolução acumulada das vendas conciliadas e proventos. Não é o gráfico do patrimônio total.</p>';
}
function evolutionChart(owner){
 const list=Array.isArray(S.positionHistory)?S.positionHistory.slice():[];
 for(const [o,field] of [['me','positionSnapshot'],['spouse','spousePositionSnapshot']]){
  const p=S[field];if(p?.rows?.length&&!list.some(x=>x.owner===o&&x.date===p.date))list.push({owner:o,date:p.date,total:+p.total||0});
 }
 const selected=owner==='family'?['me','spouse']:[owner],dated=list.filter(x=>selected.includes(x.owner)&&/^\d{4}-\d\d-\d\d$/.test(x.date)&&Number.isFinite(+x.total));
 const points=[];
 for(const date of [...new Set(dated.map(x=>x.date))].sort()){
  let total=0,known=0;
  for(const o of selected){
   const previous=dated.filter(x=>x.owner===o&&x.date<=date).sort((a,b)=>a.date.localeCompare(b.date)).at(-1);
   if(previous){total+=+previous.total;known++;}
  }
  if(known===selected.length)points.push({date,total});
 }
 if(points.length<2)return '<div class="mt7-chartempty">Ainda não há duas posições B3 comparáveis em datas diferentes. Baixe novamente a Posição B3 nas próximas atualizações. O aplicativo não criará um gráfico fictício.</div>';
 const w=620,h=185,p=24,values=points.map(x=>x.total),low=Math.min(...values),high=Math.max(...values),span=Math.max(1,high-low),
 px=i=>p+(w-2*p)*i/(points.length-1),py=v=>h-p-(v-low)/span*(h-2*p);
 return '<svg class="mt7-chart" viewBox="0 0 '+w+' '+h+'" role="img" aria-label="Patrimônio nas datas de posições B3">'+
 '<polyline class="gain" points="'+points.map((d,i)=>px(i).toFixed(1)+','+py(d.total).toFixed(1)).join(' ')+'"/>'+
 points.map((d,i)=>'<circle cx="'+px(i).toFixed(1)+'" cy="'+py(d.total).toFixed(1)+'" r="4" fill="#118460"><title>'+E.dateBR(d.date)+' · '+money(d.total)+'</title></circle>').join('')+
 '<text x="'+p+'" y="'+(h-2)+'" font-size="11" fill="#82948b">'+E.dateBR(points[0].date)+'</text>'+
 '<text x="'+(w-p)+'" y="'+(h-2)+'" text-anchor="end" font-size="11" fill="#82948b">'+E.dateBR(points.at(-1).date)+'</text></svg>'+
 '<p class="mt7-footnote">Patrimônio informado nos relatórios B3. A variação inclui novos aportes e retiradas: não é rentabilidade.</p>';
}
function home(){
 const p=E.portfolio(S,ui.owner),g=E.gains(S,ui.owner,ui.period);
 // Pendências verificadas somente quando solicitadas.
 return '<section class="mt7-hero"><small>Capital investido · posição da '+(ui.owner==='family'?'família':'carteira')+'</small><h2>'+money(p.total)+'</h2>'+
 '<div class="mt7-herometa"><span>'+p.holdings.length+' posições</span><span>'+S.records.filter(r=>ui.owner==='family'||r.owner===ui.owner).length+' registros</span>'+
 '<span>'+(p.valuation==='mixed'?'Consolidado indicativo':p.valuation==='historical'?'Custo histórico':'Posição B3')+'</span></div>'+
 '<button type="button" data-nav="portfolio">Ver carteira ›</button></section>'+
 accountNotice(p)+sourceSplit(p)+profitSummary(g)+
 '<div class="mt7-col2">'+
 card(titlebar('Onde está investido','portfolio')+allocation(p))+
 card(titlebar('Principais posições','portfolio')+holdingsRows(p,5))+'</div>'+
 card(titlebar('Evolução patrimonial','profit')+evolutionChart(ui.owner))+
 card(titlebar('Evolução do resultado','profit')+monthlyChart(g))+
 '<div class="mt7-actionrow"><button type="button" class="mt7-btn secondary" data-nav="needs">Analisar pendências</button></div>'+
 '<div class="mt7-actionrow"><button class="mt7-btn" data-nav="import">Importar B3</button><button class="mt7-btn secondary" data-nav="income">Proventos</button><button class="mt7-btn ghost" data-nav="insights">Análises</button></div>';
}
function portfolio(){
 const p=E.portfolio(S,ui.owner);
 let rows=p.holdings.filter(h=>ui.category==='all'||h.group===ui.category);
 if(ui.search)rows=rows.filter(h=>(h.code+' '+h.product+' '+h.institution).toUpperCase().includes(ui.search.toUpperCase()));
 const categories=['all',...new Set(p.holdings.map(h=>h.group))];
 return '<section class="mt7-hero"><small>Capital investido · posições</small><h2>'+money(p.total)+'</h2><div class="mt7-herometa"><span>'+p.holdings.length+' posições por titular</span>'+
 '<span>'+(p.valuation==='mixed'?'Fontes diferentes':p.valuation==='historical'?'Custo histórico':'Relatório B3')+'</span></div></section>'+
 accountNotice(p)+sourceSplit(p)+
 card(titlebar('Ativos ('+rows.length+')')+
 '<div class="mt7-filter">'+categories.map(c=>'<button type="button" data-category="'+esc(c)+'" class="'+(ui.category===c?'active':'')+'">'+(c==='all'?'Todos':esc(c))+'</button>').join('')+'</div>'+
 '<input type="search" id="mt7-search" class="mt7-input" placeholder="Buscar ativo ou instituição" value="'+esc(ui.search)+'" aria-label="Buscar ativo">'+
 '<div style="margin-top:10px">'+(rows.length?rows.map(h=>holdingsRows({holdings:[h]},1)).join(''):'<div class="mt7-chartempty">Nenhuma posição encontrada.</div>')+'</div>')+
 '<div class="mt7-actionrow"><button class="mt7-btn secondary" data-nav="import">Atualizar Posição B3</button><button class="mt7-btn ghost" data-nav="quotes">Cotações</button></div>';
}

function reconciliationCard(pendenciesOnly=false){
 if(ui.owner==='me'||!S.reconciliation?.sales?.length||!E.reconciliationReport)return '';
 const a=E.reconciliationReport(S,'spouse',pendenciesOnly?'all':ui.period);
 const rows=a.items.filter(x=>!x.matched||x.status!=='CALCULAVEL_BRUTO');
 const complete=a.verified;
 const auctionCount=a.items.filter(x=>x.event==='Leilão de fração de bonificação'&&x.matched).length;
 const normalCount=complete-auctionCount;
 let html=titlebar('Jessica · conciliação de investimentos')+
 '<p>Os custos reconstruídos só são usados quando o registro importado da B3 corresponde à data, quantidade e valor da venda, inclusive nos leilões de fração de bonificações.</p>'+
 '<div class="mt7-cards3" style="margin-top:15px">'+
 stat('Conferidos',String(complete),normalCount+' grupos de vendas + '+auctionCount+' leilões de fração')+
 stat('Provisórios',String(a.provisional),'Excluídos do lucro')+
 stat('Incompletos',String(a.incomplete+a.unmatched),'Excluídos do lucro')+
 '</div>';
 if(pendenciesOnly&&rows.length)html+='<div class="mt7-checklist">'+rows.map(x=>
 '<article class="mt7-check warning"><span class="mt7-pill warn">'+
 esc(!x.matched?'Divergente':x.status==='PROVISORIO'?'Provisório':'Incompleto')+
 '</span><h3 style="margin-top:10px">'+esc(x.code)+' · '+esc(E.dateBR(x.date))+
 '</h3><p>'+fmt(x.qty)+' unidades · '+esc(x.broker||'corretora')+
 ' · Venda '+money(x.gross)+'</p><div class="action"><b>O que falta</b><p>'+
 esc(x.note||'Revisar custo e eventos societários')+'</p></div></article>').join('')+'</div>';
 if(!pendenciesOnly){
  html+=a.provisional+a.incomplete+a.unmatched?
   '<button class="mt7-btn secondary" data-nav="needs">Ver operações pendentes</button>':
   '<p><b>Todas as vendas históricas auditadas foram conciliadas.</b> Isso não comprova a valorização atual de posições sem extrato de 2026.</p>';
 }
 let out=card(html);
 const historical=S.spouseHistoricalPosition;
 if(historical?.rows?.length&&!S.spousePositionSnapshot?.rows?.length){
  out+=card(titlebar('Posição histórica da Jessica · já recebida')+
   '<p><b>'+esc(E.dateBR(historical.date))+'</b>: '+historical.rows.length+
   ' ativos, com <b>'+money(historical.totals?.all||0)+'</b> no valor da época. Os dados foram recuperados do relatório consolidado da B3 e estão armazenados na sua conta.</p>'+
   '<p>Esse montante é <b>histórico</b> e não é usado como valor de mercado em 2026. Não é necessário reenviar a posição de 2024.</p>');
 }
 const derived=S.reconciliation?.spouseDerivedHoldings;
 if(derived?.positions?.length&&!S.spousePositionSnapshot?.rows?.length){
  out+=card(titlebar('Jessica · posição reconstruída até setembro/2026')+
    '<p>Reconstituí <b>'+derived.positions.length+' ativos</b> usando as posições B3 de 31/12/2024, '+derived.verifiedTrades+' negociações de 2025/2026 e o desdobramento ALZR11 de maio de 2025. <b>As quantidades são estimadas, não um extrato oficial de 2026.</b> Sem cotação e eventos completos, não são somadas ao patrimônio ou ao lucro atual.</p>'+
    '<div class="mt7-checklist">'+derived.positions.map(x=>
      '<article class="mt7-check"><h3>'+esc(x.code)+'</h3><p>'+fmt(x.quantity)+' cotas/ações estimadas'+
      (x.corporateAction?' · '+esc(x.corporateAction):'')+'</p></article>').join('')+'</div>');
 }
 if(!pendenciesOnly&&(ui.period==='all'||ui.period==='5y')){
  const years=S.reconciliation.annualIncome||[];
  const y24=years.find(x=>x.year===2024);
  if(y24&&y24.status==='imported_full'){
   out+=card(titlebar('Rendimentos de 2024 · Jessica')+
    '<p><b>'+money(y24.amount)+'</b> comprovados em 144 pagamentos da Rico, iguais ao total anual da B3. Já fazem parte dos proventos do histórico, nas datas em que foram pagos. <b>Não são adicionados novamente</b> como total anual.</p>');
  }
  const y23=years.find(x=>x.year===2023);
  if(y23){
   out+=card(titlebar('Rendimentos de 2023 · Jessica')+
    '<p><b>'+money(y23.importedAmount)+'</b> confirmados em 113 pagamentos da Rico e incluídos no histórico. A B3 informa '+money(y23.amount)+'; diferença de <b>'+money(y23.missingAmount)+'</b>. '+esc(y23.differenceExplanation||'A diferença anual não é somada sem data individual de pagamento comprovada.')+'</p>');
  }
 }
 return out;
}

function profitDetails(){
 if(!E.profitBreakdown)return card('<p>Detalhamento indisponível nesta versão.</p>');
 const d=E.profitBreakdown(S,ui.owner,ui.period);
 const buyer=x=>x.owner==='spouse'?'Jessica':'Samuel';
 const fmtDate=x=>E.dateBR(x);
 const details=(label,rows)=>'<details class="mt7-card" style="padding:16px;margin-top:12px"><summary style="cursor:pointer;font-weight:700">'+esc(label)+'</summary>'+rows+'</details>';
 const line=(title,small,amount)=>'<div class="mt7-row"><span class="info"><b>'+esc(title)+'</b><small>'+esc(small)+'</small></span><span class="price"><strong>'+esc(amount)+'</strong></span></div>';
 const saleRows=d.assets.map(g=>{
  const sales=g.sales.map(x=>line(fmtDate(x.date)+' · '+fmt(x.qty)+' un.',buyer(x.owner)+' · Venda '+money(x.gross)+' · Custo '+(x.cost===null?'não confirmado':money(x.cost))+' · '+x.source,
    x.recognized?money(x.profit):'Não calculado')).join('');
  const purchaseRows=g.purchases.length?g.purchases.map(x=>line(fmtDate(x.date)+' · Compra '+fmt(x.qty)+' un.',
    buyer(x.owner)+' · '+(x.broker||'Corretora não informada'),money(x.total))).join(''):
    '<p class="mt7-footnote">Nenhuma compra anterior encontrada nos arquivos. O custo conciliado pode ter origem em documento externo ou evento societário.</p>';
  return details(g.code+' · '+buyer(g.owner)+' · '+g.sales.length+' venda(s) · Resultado '+money(g.profit),
   '<p><b>Valor vendido:</b> '+money(g.gross)+' · <b>Custo atribuído:</b> '+money(g.cost)+' · <b>Lucro/prejuízo:</b> '+money(g.profit)+'</p>'+
   '<h3>Vendas que compõem o resultado</h3>'+sales+
   '<h3>Compras históricas relacionadas</h3><p class="mt7-footnote">Compras registradas até a última venda deste ativo. O cálculo usa custo médio e eventos societários, não seleção direta de lotes. A lista pode conter compras já consumidas em vendas anteriores.</p>'+purchaseRows);
 }).join('');
 const payouts=d.payouts.map(x=>line(fmtDate(x.date)+' · '+x.code,buyer(x.owner)+' · '+x.type,money(x.amount))).join('');
 return card(titlebar('De onde veio o resultado do período')+
  '<p>Lucro das vendas: <b>'+money(d.realized)+'</b> · Proventos: <b>'+money(d.dividends)+'</b> · Total realizado: <b>'+money(d.realized+d.dividends)+'</b>.</p>'+
  '<p>'+d.sales.length+' venda(s), '+d.payouts.length+' crédito(s) e '+d.excluded+' venda(s) não apurada(s). Tudo atualizado conforme o titular e o período selecionados.</p>')+
  (saleRows||card('<p>Não houve vendas neste período.</p>'))+
  details('Proventos recebidos · '+d.payouts.length+' lançamentos · '+money(d.dividends),
    payouts||'<p>Não houve proventos neste período.</p>')+
  card('<p class="mt7-footnote">Este detalhamento soma operações realizadas. Em “Todos”, o lucro total da tela pode incluir também valorização em aberto, apresentada separadamente acima. Valores brutos, antes de taxas e impostos não identificados.</p>');
}
function profit(){
 const p=E.portfolio(S,ui.owner),g=E.gains(S,ui.owner,ui.period);
 return profitSummary(g)+profitDetails()+reconciliationCard()+
 '<div class="mt7-cards3">'+stat('Lucro nas vendas',money(g.realized),g.sales+' vendas com custo comprovado')+
 stat('Proventos identificados',money(g.dividends),g.payments+' créditos','income')+
 stat('Valorização em aberto',ui.period==='all'?(g.openGain===null?'—':money(g.openGain)):'Não incluída',ui.period==='all'?g.matched+' de '+g.positions+' posições':'Sem preços históricos comparáveis')+
 stat('Capital investido · posição',money(g.capitalInvested),p.valuation==='mixed'?'Consolidado indicativo':'Total atual das posições','portfolio')+stat('Vendas não conciliadas',String(g.excludedSales),'Fora do lucro exibido','needs')+'</div>'+
 card(titlebar('Gráfico de lucro ao longo do período')+monthlyChart(g))+
 card(titlebar('Evolução do patrimônio')+evolutionChart(ui.owner))+
 card(titlebar('Como o lucro é calculado')+
 '<p><b>Vendas:</b> valor vendido menos custo médio comprovado das unidades. Vendas sem custo suficiente ficam <b>fora</b> do lucro. Resultados de investimentos já encerrados continuam no histórico.</p>'+
 '<p><b>Proventos:</b> créditos identificados como dividendos, juros sobre capital próprio e rendimentos na B3.</p>'+
 '<p><b>Ganho em aberto:</b> valor da posição B3 menos custo conciliado. No Tesouro, valor atualizado menos Valor Aplicado representa ganho <b>bruto</b>. Em períodos curtos, não somamos variação sem preços históricos.</p>'+
 '<p><b>Capital investido:</b> é o total das posições atuais, como solicitado; não é a soma de todos os aportes desde o início.</p>'+
 '<p class="mt7-footnote">Resultado bruto antes de possíveis taxas e impostos. Não é lucro líquido tributário. Sem configuração inicial; informações incompletas são sempre indicadas.</p>')+
 '<div class="mt7-actionrow"><button class="mt7-btn secondary" data-nav="needs">Ver pendências</button><button class="mt7-btn ghost" data-nav="income">Proventos</button></div>';
}
function income(){
 const g=E.gains(S,ui.owner,ui.period),from=E.cutoff(ui.period),rows=E.dividendRows(S,ui.owner).filter(x=>x.date>=from).sort((a,b)=>b.date.localeCompare(a.date));
 const by=new Map();rows.forEach(r=>by.set(r.date.slice(0,7),(by.get(r.date.slice(0,7))||0)+r.amount));
 const monthly=[...by].sort((a,b)=>b[0].localeCompare(a[0]));
 return card(titlebar('Proventos recebidos')+periodFilters()+'<div class="mt7-mainnumber">'+money(g.dividends)+'</div><p>'+rows.length+' créditos identificados no período.</p>')+
 card(titlebar('Recebimentos por mês')+
 (monthly.length?monthly.slice(0,36).map(([m,v])=>'<div class="mt7-row"><span class="mt7-symbol">↓</span><span class="info"><b>'+esc(m.slice(5)+'/'+m.slice(0,4))+'</b></span><span class="price"><strong>'+money(v)+'</strong></span></div>').join(''):'<div class="mt7-chartempty">Nenhum pagamento registrado no intervalo.</div>'))+
 card(titlebar('Últimos pagamentos')+(rows.slice(0,40).map(r=>'<div class="mt7-row"><span class="mt7-symbol">'+esc(r.code.slice(0,2)||'↓')+'</span><span class="info"><b>'+esc(r.code||r.type)+'</b><small>'+esc(r.owner==='spouse'?'Esposa':'Minha')+' · '+E.dateBR(r.date)+' · '+esc(r.type)+'</small></span><span class="price"><strong>'+money(r.amount)+'</strong></span></div>').join('')||'<div class="mt7-chartempty">Sem proventos.</div>'))+
 '<button class="mt7-btn secondary" data-nav="import">Importar Movimentação B3</button>';
}
function asset(){
 const p=E.portfolio(S,ui.owner),item=p.holdings.find(x=>x.owner+'|'+x.code===ui.assetKey);
 if(!item)return card('<h2>Ativo não encontrado</h2><button class="mt7-btn" data-nav="portfolio">Voltar à carteira</button>');
 const rows=S.records.filter(r=>r.owner===item.owner&&(
 r.t==='trade'?E.codeOf(r.v[5])===E.codeOf(item.code):E.codeOf(String(r.v[3]).split(' - ')[0])===E.codeOf(item.code)
 )).sort((a,b)=>E.recordDate(b).localeCompare(E.recordDate(a)));
 const availableQuote=S.quotes?.[item.code]||null;
 return '<button class="mt7-smalllink" data-nav="portfolio">‹ Voltar à carteira</button>'+
 '<section class="mt7-hero"><small>'+esc(item.owner==='me'?'Minha carteira':'Carteira da esposa')+' · '+esc(item.group)+'</small><h2>'+esc(item.code)+'</h2><div class="mt7-herometa"><span>'+money(item.value)+'</span><span>'+fmt(item.qty)+' unidades</span></div></section>'+
 '<div class="mt7-cards3">'+stat('Valor da posição',money(item.value),item.origin==='estimated'?'Custo histórico':'Relatório B3')+
 stat('Preço por unidade',money(item.unit),'No valor registrado')+
 stat('Origem',item.origin==='estimated'?'Histórico':'B3',E.dateBR(item.date)||'Sem data de mercado')+'</div>'+
 (item.origin==='estimated'?'<div class="mt7-note warning">Esta posição foi estimada pelas negociações; confira a quantidade e o preço com a Posição B3.</div>':'')+
 card(titlebar('Cotações e preço')+
 (availableQuote?'<div class="mt7-value">'+money(availableQuote.price)+'</div><p>Última consulta: '+esc(E.dateBR(availableQuote.at)||'Sem data')+' · '+esc(availableQuote.provider||'Informado')+'</p>':'<p>Nenhuma cotação consultada para este ativo. O valor mostrado acima é o da última posição B3 ou do custo histórico.</p>')+
 '<button class="mt7-btn" data-quote="'+esc(item.code)+'">Consultar cotação</button><p class="mt7-footnote">A API pode exigir um token para consultar o ativo. O aplicativo informa quando houver impedimento.</p>')+
 card(titlebar('Operações e pagamentos ('+rows.length+')')+(rows.slice(0,50).map(r=>'<div class="mt7-row"><span class="mt7-symbol">'+(r.t==='trade'?'⇄':'↓')+'</span><span class="info"><b>'+esc(r.t==='trade'?r.v[1]:r.v[2])+'</b><small>'+E.dateBR(E.recordDate(r))+' · '+esc(r.t==='trade'?r.v[4]:r.v[4])+'</small></span><span class="price"><strong>'+money(num(r.v[r.t==='trade'?8:7]))+'</strong></span></div>').join('')||'<div class="mt7-chartempty">Nenhuma operação reconhecida.</div>'));
}
function imported(){
 const owner=ui.importOwner;
 const src=Object.values(S.sources||{}).filter(x=>x?.owner===owner).length;
 return card(titlebar('Importar arquivos da B3')+
 '<p>Escolha o titular. As planilhas são processadas no navegador e salvas apenas na sua conta do MoneyTracker.</p>'+
 '<div class="mt7-field" style="margin:17px 0"><label for="mt7-import-owner">Importar para</label><select id="mt7-import-owner" class="mt7-select">'+
 '<option value="me" '+(owner==='me'?'selected':'')+'>Minha carteira</option>'+
 '<option value="spouse" '+(owner==='spouse'?'selected':'')+'>Carteira da esposa</option></select></div>'+
 '<div class="mt7-import-box"><div class="big">⇧</div><strong>Selecionar planilhas Excel</strong>'+
 '<label for="mt7-file">Toque no campo para escolher um ou vários arquivos</label>'+
 '<input id="mt7-file" type="file" multiple accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" '+(busy?'disabled':'')+' />'+
 '<small>Negociação, Movimentação e Posição B3 · até 20 MB por arquivo</small></div>'+
 (busy?'<div class="mt7-progress" role="status">Lendo e validando os arquivos…</div>':'')+
 (ui.importMessage?'<div class="mt7-progress" role="status" style="margin-top:14px">'+esc(ui.importMessage)+'</div>':'')+
 '<p class="mt7-footnote">A importação valida todos os arquivos antes de gravar. Operações iguais dentro do mesmo extrato são preservadas; reimportar um arquivo não cria duplicações.</p>')+
 card(titlebar('Arquivos necessários')+
 '<div class="mt7-row"><span class="mt7-symbol">1</span><span class="info"><b>Posição</b><small>Quantidade e valor atual por ativo · essencial para o consolidado</small></span></div>'+
 '<div class="mt7-row"><span class="mt7-symbol">2</span><span class="info"><b>Negociação</b><small>Compras e vendas · base do ganho de capital</small></span></div>'+
 '<div class="mt7-row"><span class="mt7-symbol">3</span><span class="info"><b>Movimentação</b><small>Dividendos, proventos, eventos e transferências</small></span></div>'+
 '<p><a href="https://www.b3.com.br/pt_br/produtos-e-servicos/central-depositaria/canal-com-investidores/area-do-investidor/" target="_blank" rel="noopener noreferrer">Abrir Área do Investidor da B3 ↗</a></p>')+
 card(titlebar('Seus arquivos importados')+'<p>Registros de '+esc(owner==='me'?'sua carteira':'sua esposa')+': '+S.records.filter(r=>r.owner===owner).length+'. Fontes registradas: '+src+'.</p>'+
 '<button class="mt7-btn secondary" data-nav="history">Ver histórico</button>');
}

function pendingSalesDetails(){
 if(ui.owner==='spouse')return '';
 const stock=E.ledger(S,'me').sales,treasury=E.treasuryLedger(S,'me').sales;
 const audited=E.reconciliationReport?E.reconciliationReport(S,'me','all'):null;
 const reconciled=new Set((audited?.items||[]).filter(x=>x.matched&&x.status==='CALCULAVEL_BRUTO')
  .map(x=>x.owner+'|'+x.date+'|'+x.code));
 const misses=[...stock,...treasury].filter(x=>!x.recognized&&
  !reconciled.has(x.owner+'|'+x.date+'|'+x.code));
 if(!misses.length)return card(titlebar('Minhas vendas históricas')+
  '<p>Todos os custos de venda estão conciliados para a carteira selecionada.</p>');
 const grouped=new Map();
 for(const x of misses){
  const key=x.date+'|'+x.code;
  if(!grouped.has(key))grouped.set(key,{date:x.date,code:x.code,qty:0,gross:0,count:0,reasons:new Set()});
  const g=grouped.get(key);g.qty+=x.qty;g.gross+=x.gross;g.count++;
  g.reasons.add(x.reason||'Aquisição anterior ou evento societário');
 }
 const arr=[...grouped.values()].sort((a,b)=>b.date.localeCompare(a.date)||a.code.localeCompare(b.code));
 return card(titlebar('Minhas vendas ainda sem custo comprovado')+
  '<p><b>'+misses.length+' registros em '+arr.length+' grupos de ativo e data.</b> Essa pendência é da carteira do Samuel, não da Jessica. A negociação da B3 já foi recebida; é a origem ou o custo das unidades que falta conciliar.</p>'+
  '<div class="mt7-checklist">'+arr.map(x=>
   '<article class="mt7-check warning"><h3>'+esc(x.code)+' · '+esc(E.dateBR(x.date))+
   '</h3><p>'+fmt(x.qty)+' unidades · Valor vendido '+money(x.gross)+
   (x.count>1?' · '+x.count+' negócios':'')+'</p>'+
   '<div class="action"><b>Motivo</b><p>'+esc(S.reconciliation?.pendingDetails?.find(d=>d.date===x.date&&d.code===x.code)?.reason||[...x.reasons].join('; '))+
   '</p></div></article>'
  ).join('')+'</div>');
}

function needs(){
 const report=analysis&&analysisOwner===ui.owner&&analysisState===S?analysis:analyzeNow();
 const p=report.portfolio,issues=report.issues,g=report.gains;
 return card(titlebar('Análise atual dos dados')+
 '<p>Diagnóstico recalculado a partir dos registros atuais; nenhum resultado é salvo como pendência fixa.</p><button type="button" class="mt7-btn secondary" data-action="analyze">Analisar agora</button>')+
 card(titlebar('Diagnóstico: operações e valores de mercado')+
 '<p>Diagnóstico calculado a partir dos arquivos importados. Resultados de vendas são diferentes da avaliação de mercado atual: um pode estar conciliado sem o outro.</p>'+
 '<div class="mt7-cards3" style="margin-top:15px">'+stat('Vendas sem custo',String(g.excludedSales),'Registros a conferir')+
 stat('Avisos de posição',String(issues.filter(i=>i.code==='missing-position'||i.code==='old-position').length),'Valor atual ou posição histórica')+
 stat('Dados B3',String(S.records.filter(r=>ui.owner==='family'||r.owner===ui.owner).length),'Negociações e movimentações')+
 stat('Posições',String(p.holdings.length),'Por titular')+'</div>')+
 '<section class="mt7-checklist">'+issues.map(issue=>'<article class="mt7-check '+esc(issue.level)+'">'+
 '<span class="mt7-pill '+(issue.level==='critical'?'bad':issue.level==='warning'?'warn':'')+'">'+(issue.level==='critical'?'Prioritário':issue.level==='warning'?'Conferir':'Informação')+'</span>'+
 '<h3 style="margin-top:10px">'+esc(issue.title)+'</h3><p>'+esc(issue.why)+'</p>'+
 '<div class="action"><b>O que buscar</b><p>'+esc(issue.action)+'</p></div>'+
 '</article>').join('')+'</section>'+
 card(titlebar('Onde obter os documentos')+
 '<p>Na <a href="https://www.b3.com.br/pt_br/produtos-e-servicos/central-depositaria/canal-com-investidores/area-do-investidor/" target="_blank" rel="noopener noreferrer">Área do Investidor da B3 ↗</a>, entre com a conta do titular e acesse os extratos <b>Posição</b>, <b>Negociação</b> e <b>Movimentação</b>. Exporte no formato Excel (.xlsx).</p>'+
 '<p>Para transferências entre corretoras e bancos ou operações que não estão na B3, consulte também o histórico da XP, Inter e seus bancos.</p>')+
 '<button class="mt7-btn" data-nav="import">Ir para importação</button>';
}
function history(){
 const rows=S.records.filter(r=>(ui.owner==='family'||r.owner===ui.owner)&&(ui.historyKind==='all'||r.t===ui.historyKind))
 .filter(r=>!ui.search||r.v.map(String).join(' ').toUpperCase().includes(ui.search.toUpperCase()))
 .slice().sort((a,b)=>E.recordDate(b).localeCompare(E.recordDate(a)));
 return card(titlebar('Histórico de registros')+
 '<div class="mt7-filter">'+[['all','Todos'],['trade','Negociações'],['mov','Movimentações']].map(([v,t])=>'<button data-history-kind="'+v+'" class="'+(ui.historyKind===v?'active':'')+'">'+t+'</button>').join('')+'</div>'+
 '<input type="search" id="mt7-search" class="mt7-input" placeholder="Buscar código, instituição ou data" value="'+esc(ui.search)+'">'+
 '<p>'+rows.length+' registros encontrados.</p>'+
 rows.slice(0,ui.historyLimit).map(r=>'<div class="mt7-row"><span class="mt7-symbol">'+(r.t==='trade'?'⇄':'↓')+'</span>'+
 '<span class="info"><b>'+esc(r.t==='trade'?r.v[5]:r.v[3])+'</b><small>'+esc(r.owner==='spouse'?'Esposa':'Minha')+' · '+E.dateBR(E.recordDate(r))+' · '+esc(r.t==='trade'?r.v[1]:r.v[2])+'</small></span>'+
 '<span class="price"><strong>'+money(num(r.v[r.t==='trade'?8:7]))+'</strong></span></div>').join('')+
 (rows.length>ui.historyLimit?'<button class="mt7-btn secondary" data-action="more-history">Carregar mais</button>':''));
}
function insights(){
 const p=E.portfolio(S,ui.owner),largest=p.holdings[0],pct=p.total&&largest?100*largest.value/p.total:0;
 return card(titlebar('Concentração por classe')+allocation(p))+
 card(titlebar('Diagnóstico de composição')+
 (largest?'<div class="mt7-row"><span class="mt7-symbol">▤</span><span class="info"><b>Maior posição: '+esc(largest.code)+'</b><small>'+esc(largest.owner==='me'?'Minha':'Esposa')+' · '+pct.toFixed(1).replace('.',',')+'% do total calculado</small></span><span class="price"><strong>'+money(largest.value)+'</strong></span></div>':'<p>Nenhuma posição para analisar.</p>')+
 (pct>=25?'<div class="mt7-note warning">Concentração elevada em um ativo (25% ou mais do total). Confira o risco antes de novos aportes.</div>':'')+
 '<p>Estas análises são regras explicáveis. Não são recomendações de investimento nem consideram sua situação tributária pessoal.</p>')+
 card(titlebar('Comparações de desempenho')+
 '<div class="mt7-note">A comparação com CDI e Ibovespa ainda não foi implementada com séries históricas e aportes comparáveis. Isso não significa que faltem notas de corretagem.</div>'+
 '<button class="mt7-btn secondary" data-nav="profit">Ver lucro realizado</button>');
}
function quotes(){
 const p=E.portfolio(S,ui.owner),items=p.holdings.filter(r=>r.group!=='Tesouro');
 return card(titlebar('Consultar preços')+
 '<p>O preço B3 da posição é sua referência atual. Você pode consultar outro preço quando o serviço estiver disponível. Uma cotação não substitui automaticamente um extrato de Posição.</p>'+
 (items.length?items.map(r=>'<div class="mt7-row"><span class="mt7-symbol">'+esc(r.code.slice(0,2))+'</span><span class="info"><b>'+esc(r.code)+'</b><small>'+esc(r.owner==='me'?'Minha':'Esposa')+' · '+(S.quotes?.[r.code]?money(S.quotes[r.code].price)+' / un.':'Sem cotação nova')+'</small></span><button class="mt7-btn secondary" data-quote="'+esc(r.code)+'">Consultar</button></div>').join(''):'<div class="mt7-chartempty">Nenhum ativo listado.</div>')+
 '<p class="mt7-footnote">Alguns ativos exigem um token de API para cotação. O aplicativo mostra a limitação, não inventa preços.</p>');
}
function more(){
 return card(titlebar('Conta e sincronização')+
 '<div class="mt7-row"><span class="mt7-symbol">☁</span><span class="info"><b>Sincronização Supabase</b><small id="mt7-cloud-status">'+esc(root.MoneyTrackerCloudV7?.status||'Conectado')+'</small></span></div>'+
 '<div class="mt7-actionrow" style="margin-top:15px"><button class="mt7-btn secondary" data-action="sync">Sincronizar</button>'+
 '<button class="mt7-btn ghost" data-action="logout">Sair da conta</button><button class="mt7-btn ghost" data-action="install-app">Instalar app</button></div>')+
 card(titlebar('Ferramentas')+
 [['history','◷','Histórico completo','Compras, vendas e movimentações'],['income','↓','Proventos','Dividendos e rendimentos'],['insights','✧','Análises','Concentração e riscos'],['quotes','◉','Cotações','Consultar preços dos ativos'],['needs','☑','Pendências','Documentos e dados faltantes']].map(([id,icon,label,desc])=>
 '<button data-nav="'+id+'" class="mt7-row" style="width:100%;border:0;border-bottom:1px solid #eef1ec;background:#fff"><span class="mt7-symbol">'+icon+'</span><span class="info"><b>'+label+'</b><small>'+desc+'</small></span><span>›</span></button>').join(''))+
 card(titlebar('Segurança dos dados')+
 '<p>Os registros financeiros estão associados à sua conta autenticada. Você pode exportar um backup completo com identificação dos titulares.</p>'+
 '<div class="mt7-actionrow"><button class="mt7-btn" data-action="backup">Exportar backup JSON</button>'+
 '<button class="mt7-btn ghost" data-action="restore-pick">Restaurar backup</button></div>'+
 '<input type="file" id="mt7-restore-file" accept="application/json,.json" hidden>'+
 '<p class="mt7-footnote">Versão 7.8 · Não altera a conta ou os dados de outros projetos.</p>');
}
function render(){
 const app=document.getElementById('mt7-app');if(!app)return;
 let content;
 try{
  content=({home,portfolio,profit,import:imported,needs,asset,income,history,insights,quotes,more}[ui.page]||home)();
 }catch(err){
  console.error(err);content=card('<h2>Não foi possível abrir esta tela</h2><p>'+esc(err.message||'Erro de carregamento')+'</p><button class="mt7-btn" data-nav="home">Voltar ao início</button>');
 }
 app.innerHTML=layout(content);
}
function showToast(msg,error=false){
 const node=document.getElementById('mt7-toasts');if(!node)return;
 node.innerHTML='<div role="status" class="mt7-toast '+(error?'bad':'')+'">'+esc(msg)+'</div>';
 clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>{node.innerHTML='';},6500);
}
function download(name,body,type='application/json'){
 const blob=new Blob([body],{type});
 const url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);
}
function changeData(next){
 S=E.normalizeState(next);invalidateAnalysis();render();
 root.MoneyTrackerCloudV7?.scheduleSave(S);
}
async function updateQuote(symbol){
 if(!root.MoneyTrackerCloudV7?.quote){showToast('Consulta de cotação indisponível.',true);return;}
 showToast('Consultando '+symbol+'...');
 try{
  const result=await root.MoneyTrackerCloudV7.quote(symbol);
  if(!result||!(+result.price>0))throw Error('Provedor sem preço válido.');
  const next=E.normalizeState(S);next.quotes={...next.quotes,[symbol]:{price:+result.price,at:result.at||new Date().toISOString(),provider:result.provider||'brapi'}};
  changeData(next);showToast(symbol+': '+money(result.price)+' · cotação consultada');
 }catch(err){showToast(err.message||String(err),true);}
}
async function importFiles(files){
 if(!auth){showToast('Entre na conta para importar.',true);return;}
 if(busy)return;
 const selected=Array.from(files||[]);
 if(!selected.length)return;
 busy=true;ui.importMessage='Analisando '+selected.length+' arquivo(s) da '+(ui.importOwner==='spouse'?'esposa':'minha carteira')+'…';render();
 try{
  const result=await E.importXlsx(S,ui.importOwner,selected,root.MoneyTrackerExcel);
  const summary=result.summary;
  ui.importMessage='Importação validada e enviada para sincronização.\n'+summary.files+' arquivos · '+summary.added+' lançamentos novos · '+summary.duplicates+' registros repetidos ignorados · '+summary.positionsChanged+' posições atualizadas.\n'+
  (summary.invalid?summary.invalid+' linhas não válidas ignoradas. Verifique o arquivo.\n':'')+
  summary.details.map(x=>x.name+': '+x.rows+' novos / '+x.positions+' posições').join('\n');
  S=E.normalizeState(result.next);invalidateAnalysis();root.MoneyTrackerCloudV7?.scheduleSave(S);
  showToast(summary.added+' registros e '+summary.positionsChanged+' posições processados. Verifique o status de sincronização.');
 }catch(err){ui.importMessage='Nenhum registro foi alterado. '+(err.message||err);showToast('Importação não concluída: '+(err.message||err),true);}
 finally{busy=false;render();}
}
function listen(){
 document.addEventListener('click',async event=>{
  const t=event.target,nav=t.closest('[data-nav]');
  if(nav){go(nav.dataset.nav);return;}
  const owner=t.closest('[data-owner]');if(owner){ui.owner=owner.dataset.owner;invalidateAnalysis();ui.category='all';ui.search='';if(ui.owner!=='family')ui.importOwner=ui.owner;render();return;}
  const period=t.closest('[data-period]');if(period){ui.period=period.dataset.period;render();return;}
  const group=t.closest('[data-category]');if(group){ui.category=group.dataset.category;render();return;}
  const hist=t.closest('[data-history-kind]');if(hist){ui.historyKind=hist.dataset.historyKind;render();return;}
  const h=t.closest('[data-asset]');if(h){ui.assetKey=h.dataset.asset;go('asset');return;}
  const quote=t.closest('[data-quote]');if(quote){await updateQuote(quote.dataset.quote);return;}
  const action=t.closest('[data-action]');
  if(!action)return;
  const a=action.dataset.action;
  if(a==='more-history'){ui.historyLimit+=70;render();}
   if(a==='analyze'){invalidateAnalysis();analyzeNow();render();showToast('Análise recalculada com os dados atuais.');}
  if(a==='backup')download('moneytracker-v7-backup-'+E.isoNow()+'.json',JSON.stringify({format:'moneytracker-backup',version:7,date:new Date().toISOString(),data:S},null,2));
  if(a==='restore-pick')document.getElementById('mt7-restore-file')?.click();
  if(a==='sync')await root.MoneyTrackerCloudV7?.sync();
  if(a==='install-app')await root.MoneyTrackerInstallV7?.install();
  if(a==='logout')await root.MoneyTrackerCloudV7?.logout();
 });
 document.addEventListener('change',async event=>{
  const target=event.target;
  if(target.id==='mt7-import-owner'){ui.importOwner=target.value==='spouse'?'spouse':'me';return;}
  if(target.id==='mt7-file'){const files=Array.from(target.files||[]);await importFiles(files);return;}
  if(target.id==='mt7-restore-file'){
   const file=target.files?.[0];if(!file)return;
   try{
    const parsed=JSON.parse(await file.text());
    if(parsed.format!=='moneytracker-backup'||!parsed.data||!Array.isArray(parsed.data.records))throw Error('Formato de backup desconhecido.');
    const restored=E.normalizeState(parsed.data);
    const before=S.records.length,after=restored.records.length;
    if(!confirm('Restaurar o backup com '+after+' registros, substituindo os '+before+' atuais? Os titulares serão preservados. Exporte um backup antes de continuar.'))return;
    changeData(restored);showToast('Backup restaurado. Confira a sincronização.');
   }catch(err){showToast('Falha na restauração: '+(err.message||err),true);}
  }
 });
 document.addEventListener('input',event=>{
  if(event.target.id!=='mt7-search')return;
  ui.search=event.target.value;
  const position=event.target.selectionStart;
  render();
  const field=document.getElementById('mt7-search');
  if(field){field.focus();try{field.setSelectionRange(position,position);}catch{}}
 });
}
root.MoneyTrackerAppV7={
 getState:()=>S,
 setState:data=>{S=E.normalizeState(data);invalidateAnalysis();render();},
 loginReady:user=>{auth=true;document.getElementById('mt7-auth').hidden=true;render();},
 loginNeeded:()=>{auth=false;document.getElementById('mt7-auth').hidden=false;},
 getUi:()=>ui,
 notify:showToast,
 render,
 onSyncError:msg=>{saveError=true;showToast(msg,true);},
 loginStatus:msg=>{const e=document.getElementById('mt7-auth-status');if(e)e.textContent=msg||'';},
 isAuthenticated:()=>auth
};
listen();render();
})(window);