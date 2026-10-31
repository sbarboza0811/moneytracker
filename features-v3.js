
/* V3: comparativos e fluxo de capital, sem inventar rentabilidade histórica. */
const V3_DAY=86400000;
function v3owner(){return ui.owner||'me';}
function v3history(owner=v3owner()){
  let all=Array.isArray(S.positionHistory)?S.positionHistory.slice():[];
  const add=(o,snap)=>{if(snap?.rows?.length&&!all.some(p=>p.owner===o&&p.date===snap.date))all.push({owner:o,date:snap.date,total:Number(snap.total)||0,source:snap.source});};
  add('me',S.positionSnapshot);add('spouse',S.spousePositionSnapshot);
  all=all.filter(x=>Number.isFinite(+x.total)&&/^\d{4}-\d\d-\d\d$/.test(x.date)).sort((a,b)=>a.date.localeCompare(b.date));
  if(owner!=='family')return all.filter(x=>x.owner===owner);
  const dates=[...new Set(all.map(x=>x.date))].sort();
  return dates.map(date=>{
    const me=all.filter(x=>x.owner==='me'&&x.date<=date).at(-1),sp=all.filter(x=>x.owner==='spouse'&&x.date<=date).at(-1);
    return{date,owner:'family',total:Number(me?.total||0)+Number(sp?.total||0),partial:!me||!sp};
  }).filter(x=>x.total>0);
}
function v3moneyChart(points,{title='Evolução do patrimônio'}={}){
  const d=points.filter(p=>Number.isFinite(+p.total));
  if(d.length<2)return '<div class="v3emptychart"><div style="font-size:32px">▥</div><b>Histórico em construção</b><p>O gráfico aparecerá após importar pelo menos duas posições em datas diferentes. Não inventamos valores passados.</p></div>';
  const w=620,ht=206,pad=27,vals=d.map(p=>+p.total),low=Math.min(...vals),high=Math.max(...vals),span=Math.max(1,high-low),min=low-span*.18,max=high+span*.18;
  const x=i=>pad+(w-pad*2)*i/(d.length-1),y=v=>ht-pad-((v-min)/(max-min))*(ht-pad*2);
  const list=d.map((p,i)=>x(i).toFixed(1)+','+y(p.total).toFixed(1)).join(' ');
  const start=d[0],end=d.at(-1);
  return '<svg class="v3linechart" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+w+' '+ht+'" role="img" aria-label="'+h(title)+' de '+v3date(start.date)+' a '+v3date(end.date)+'">'+
  [0,1,2,3].map(i=>'<line x1="'+pad+'" y1="'+(pad+(ht-2*pad)*i/3)+'" x2="'+(w-pad)+'" y2="'+(pad+(ht-2*pad)*i/3)+'" stroke="#e6efe9" stroke-width="1"/>').join('')+
  '<polyline points="'+list+'" fill="none" stroke="#128465" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>'+
  d.map((p,i)=>'<circle cx="'+x(i)+'" cy="'+y(+p.total)+'" r="5" stroke="white" stroke-width="2" fill="#128465"><title>'+h(v3date(p.date)+' — '+money(p.total))+'</title></circle>').join('')+
  '<text x="'+pad+'" y="'+(ht-3)+'" font-size="13" fill="#71847b">'+h(v3date(start.date))+'</text><text x="'+(w-pad)+'" y="'+(ht-3)+'" font-size="13" text-anchor="end" fill="#71847b">'+h(v3date(end.date))+'</text></svg><p class="v3chartfoot">'+money(start.total)+' → '+money(end.total)+' · Variação patrimonial inclui aportes e retiradas (não é rentabilidade).</p>';
}
const v3date=d=>d?String(d).split('-').reverse().join('/'):'—';
function v3flows(owner=v3owner(),since='0000'){
 const arr=Array.isArray(S.cashflows)?S.cashflows:[];
 const selected=arr.filter(f=>f.date>=since&&Number.isFinite(Number(f.amount))&&Number(f.amount)>0);
 const total=(whom)=>selected.reduce((n,f)=>{
   const value=+f.amount;
   if(f.type==='deposit'&&f.owner===whom)return n+value;
   if(f.type==='withdraw'&&f.owner===whom)return n-value;
   if(f.type==='transfer'&&f.owner!==f.toOwner){if(f.owner===whom)return n-value;if(f.toOwner===whom)return n+value;}
   return n;
 },0);
 return owner==='family'?selected.reduce((n,f)=>n+(f.type==='deposit'?+f.amount:f.type==='withdraw'?-f.amount:0),0):total(owner);
}
function v3profit(D){
 const owner=v3owner(),bases=S.performanceBase||{},balance=S.cashBalances||{};
 const history=v3history(owner),cash=(o)=>Math.max(0,Number(balance[o]||0));
 const calculate=o=>{
   const b=bases[o],pos=o==='me'?S.positionSnapshot:S.spousePositionSnapshot;
   if(!b||!b.confirmed||!pos?.rows?.length||!Number.isFinite(+b.amount))return null;
   const net=v3flows(o,b.date),c=cash(o),position=+pos.total;
   return{date:b.date,base:+b.amount,capital:+b.amount+net,net,cash:c,total:position+c,profit:position+c-(+b.amount)-net};
 };
 if(owner==='family'){const a=calculate('me'),b=calculate('spouse');if(!a||!b)return null;return{base:a.base+b.base,capital:a.capital+b.capital,net:a.net+b.net,cash:a.cash+b.cash,total:a.total+b.total,profit:a.profit+b.profit};}
 return calculate(owner);
}
function v3realized(){
 const trades=groupRecords('trade').slice().sort((a,b)=>dateOf(a).localeCompare(dateOf(b)));
 const cost=new Map();let realized=0,unmatched=0,sales=0;
 for(const r of trades){
  const code=stripFrac(r.v[5]),q=num(r.v[6]),value=num(r.v[8]),act=norm(r.v[1]);
  if(!code||!Number.isFinite(q)||q<=0||!Number.isFinite(value)||value<0)continue;
  const t=cost.get(code)||{qty:0,value:0};
  if(act==='COMPRA'){t.qty+=q;t.value+=value;}
  if(act==='VENDA'){
    sales++;const covered=Math.min(q,t.qty);
    if(covered>0){const basis=t.value/t.qty*covered;realized+=value*covered/q-basis;t.qty-=covered;t.value-=basis;}
    if(q>covered)unmatched+=q-covered;
  }
  cost.set(code,t);
 }
 return{realized,unmatched,sales,cost};
}
function v3calc(){
 const profit=v3profit(activity()),returns=v3realized();
 return{profit,returns,points:v3history()};
}
function v3performance(D){
 const owner=v3owner(),calc=v3profit(D),tr=v3realized(),history=v3history(),base=S.performanceBase?.[owner],account=S.cashBalances?.[owner]||0;
 const divs=groupRecords('mov').filter(r=>norm(r.v[0])==='CREDITO'&&['DIVIDENDO','RENDIMENTO','JUROS SOBRE CAPITAL PROPRIO'].includes(norm(r.v[2]))).reduce((n,r)=>n+(Number.isFinite(num(r.v[7]))?num(r.v[7]):0),0);
 const flows=(S.cashflows||[]).filter(f=>owner==='family'||f.owner===owner||f.toOwner===owner).slice().sort((a,b)=>b.date.localeCompare(a.date));
 return '<section class="v2panel"><div class="v2section"><h2>Resultado acumulado</h2><span class="v2chip">Desde o início</span></div>'+
 '<div class="v2value">'+(calc?money(calc.profit):'A configurar')+'</div><p class="v2muted">Patrimônio atual + saldo em contas − capital inicial − aportes líquidos. Transferências entre contas não zeram lucro.</p>'+
 (calc?'<div class="v2summary" style="margin-top:18px"><div class="v2stat"><small>Capital próprio</small><strong>'+money(calc.capital)+'</strong></div><div class="v2stat"><small>Saldo em contas</small><strong>'+money(calc.cash)+'</strong></div><div class="v2stat"><small>Patrimônio total</small><strong>'+money(calc.total)+'</strong></div></div>':'<div class="v2callout">Informe o saldo inicial e registre os aportes e retiradas desde essa data. Sem isso, o lucro total seria enganoso.</div>')+'</section>'+
 '<div class="v2summary"><div class="v2stat"><small>Vendas realizadas*</small><strong>'+money(tr.realized)+'</strong></div><div class="v2stat"><small>Proventos registrados</small><strong>'+money(divs)+'</strong></div><div class="v2stat"><small>Vendas sem custo*</small><strong>'+nfmt(tr.unmatched,2)+' un.</strong></div></div>'+
 '<p class="v2note">*Estimativas pelo histórico recebido; desdobramentos, transferências e compras não importadas podem alterar o lucro realizado. O resultado acumulado acima não soma esses componentes novamente.</p>'+
 '<section class="v2panel"><div class="v2section"><h2>Evolução da carteira</h2><span class="v2muted">'+history.length+' posições históricas</span></div>'+v3moneyChart(history)+'</section>'+
 '<section class="v2panel"><div class="v2section"><h2>Comparar com índices</h2><span class="v2chip">CDI · Ibovespa</span></div><div class="v2quick"><button class="v2btn outline" data-act="v3-benchmark">Buscar referências</button></div><div id="v3-benchmark-result">'+(ui.benchmark||'<p class="v2muted">Comparação somente quando houver pelo menos duas posições e os aportes do período forem conhecidos. CDI: Banco Central; Ibovespa: B3 via provedor externo.</p>')+'</div></section>'+
 (owner==='family'?'<div class="v2callout">Para configurar o resultado familiar, registre primeiro o ponto de partida e o caixa de cada pessoa separadamente.</div>':
 '<section class="v2panel"><div class="v2section"><h2>Capital e contas</h2></div><form id="v3-base-form" class="v3form"><label>Data inicial<input class="v2field" name="date" type="date" required value="'+h(base?.date||new Date().toISOString().slice(0,10))+'"></label><label>Patrimônio inicial (R$)<input class="v2field" name="amount" type="number" step=".01" min="0" required value="'+h(base?.amount??'')+'" placeholder="0,00"></label><label>Saldo atual em contas (R$)<input class="v2field" name="cash" type="number" step=".01" min="0" required value="'+h(account)+'"></label><label class="v3check"><input type="checkbox" name="confirmed" '+(base?.confirmed?'checked':'')+' required> Todos os aportes e saques desde essa data estão registrados</label><button class="v2btn" type="submit">Salvar ponto de partida</button></form></section>'+
 '<section class="v2panel"><div class="v2section"><h2>Movimentar dinheiro</h2></div><form id="v3-flow-form" class="v3form"><label>Data<input class="v2field" type="date" name="date" value="'+new Date().toISOString().slice(0,10)+'" required></label><label>Movimentação<select name="type" class="v2field"><option value="deposit">Aporte de fora</option><option value="withdraw">Retirada definitiva</option><option value="transfer">Transferência entre contas</option></select></label><label>Valor (R$)<input class="v2field" name="amount" type="number" min=".01" step=".01" required></label><label>Conta de origem<input class="v2field" name="from" placeholder="XP, Inter, Banco..." maxlength="80"></label><label>Conta de destino<input class="v2field" name="to" placeholder="Inter, XP, Banco..." maxlength="80"></label><label>Destino da transferência<select class="v2field" name="toOwner"><option value="'+owner+'">Da mesma pessoa</option><option value="'+(owner==='me'?'spouse':'me')+'">Da outra pessoa</option></select></label><button class="v2btn" type="submit">Registrar movimento</button></form></section>')+
 '<section class="v2panel"><div class="v2section"><h2>Movimentos registrados</h2><span class="v2chip">'+flows.length+'</span></div>'+flows.slice(0,40).map(f=>'<div class="v2row"><span class="v2bubble">'+(f.type==='transfer'?'⇄':f.type==='deposit'?'＋':'−')+'</span><span class="v2rowinfo"><b>'+(f.type==='transfer'?'Transferência':f.type==='deposit'?'Aporte':'Retirada')+'</b><small>'+v3date(f.date)+' · '+h(f.from||'Externo')+' → '+h(f.to||'Externo')+'</small></span><div class="v2rowright"><strong>'+money(f.amount)+'</strong><small><button type="button" class="muted-link" data-v3-delete-flow="'+h(f.id)+'">Excluir</button></small></div></div>').join('')+'</section>';
}
async function v3benchmarks(){
 const points=v3history(),calc=v3profit(activity());
 if(points.length<2||!calc){toast('Para comparar, registre o capital e tenha duas posições em datas diferentes.',true);return;}
 const first=points[0],last=points.at(-1),start=new Date(first.date+'T12:00:00Z'),end=new Date(last.date+'T12:00:00Z');
 if(start>=end){toast('São necessárias duas datas distintas.',true);return;}
 const net=v3flows(v3owner(),first.date),modified=first.total+net/2;
 const pct=modified>0?(last.total-first.total-net)/modified*100:null;
 ui.benchmark='<p class="v2muted">Consultando referências…</p>';render();
 let parts=['<div class="v2row"><span class="v2rowinfo"><b>Sua carteira*</b><small>'+v3date(first.date)+' a '+v3date(last.date)+'</small></span><strong>'+(pct===null?'—':pcent(pct))+'</strong></div>'];
 const dd=d=>('0'+d.getUTCDate()).slice(-2)+'/'+('0'+(d.getUTCMonth()+1)).slice(-2)+'/'+d.getUTCFullYear();
 try{
  const url='https://api.bcb.gov.br/dados/serie/bcdata.sgs.12/dados?formato=json&dataInicial='+encodeURIComponent(dd(start))+'&dataFinal='+encodeURIComponent(dd(end));
  const res=await fetch(url);if(!res.ok)throw Error('HTTP '+res.status);const data=await res.json();
  const idx=data.reduce((a,r)=>a*(1+Number(String(r.valor).replace(',','.'))/100),1);
  parts.push('<div class="v2row"><span class="v2rowinfo"><b>CDI</b><small>Banco Central · SGS série 12</small></span><strong>'+pcent((idx-1)*100)+'</strong></div>');
 }catch(e){parts.push('<p class="v2note">CDI indisponível nesta consulta.</p>');}
 try{
  const r=await fetch('https://brapi.dev/api/quote/%5EBVSP?range=1y&interval=1d');
  if(!r.ok)throw Error('HTTP '+r.status);
  const data=await r.json(),cand=data.results?.[0]?.historicalDataPrice||data.results?.[0]?.data?.historicalDataPrice||[];
  const history=cand.map(x=>({time:new Date(x.date*1000).toISOString().slice(0,10),price:Number(x.close||x.adjustedClose)})).filter(x=>x.time>=first.date&&x.time<=last.date&&x.price>0);
  if(history.length<2)throw Error('Sem observações suficientes');
  parts.push('<div class="v2row"><span class="v2rowinfo"><b>Ibovespa</b><small>brapi · período disponível</small></span><strong>'+pcent((history.at(-1).price/history[0].price-1)*100)+'</strong></div>');
 }catch(e){parts.push('<p class="v2note">Ibovespa indisponível (plano, histórico ou rede).</p>');}
 parts.push('<p class="v2note">*Rentabilidade estimada usando aportes líquidos e capital médio; não é TWR/IRR. Comparações são indicativas; diferenças de datas de fechamento afetam o resultado.</p>');
 ui.benchmark=parts.join('');render();
}
