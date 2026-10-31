
/* Quotes from authenticated Supabase Edge Function; manual entry is labeled. */
function v3quoteOf(code){const q=S.quotes?.[code];return q&&Number.isFinite(+q.price)&&+q.price>0?q:null;}
function v3quoteValue(r){const q=v3quoteOf(r.code);return q?{...q,total:Math.round(r.qty*(+q.price)*100)/100}:null;}
function v3quotes(D){
 const listed=D.active.filter(r=>r.sourceGroup!=='Tesouro Direto');
 const known=listed.filter(r=>v3quoteOf(r.code));
 const estimated=listed.reduce((a,r)=>a+(v3quoteValue(r)?.total??r.cost),0)+D.active.filter(r=>r.sourceGroup==='Tesouro Direto').reduce((a,r)=>a+r.cost,0);
 return '<section class="v2panel"><div class="v2section"><h2>Cotações consultadas</h2><span class="v2chip">'+known.length+' / '+listed.length+'</span></div><div class="v2value">'+money(estimated)+'</div><p class="v2muted">Estimativa com últimos preços consultados ou informados. Ativos sem cotação usam o valor do último relatório de Posição da B3; não é cotação em tempo real nem saldo bancário.</p><div class="v2callout">Consultas automáticas requerem autorização do provedor brapi para a maioria dos tickers. Não armazenamos a chave no código do aplicativo. O Tesouro Direto continua com o relatório B3.</div></section>'+
 '<section class="v2panel"><div class="v2section"><h2>Atualizar preço manualmente</h2></div><form id="v3-quote-form" class="v3form"><label>Ativo<select class="v2field" name="symbol" required>'+listed.map(r=>'<option value="'+h(r.code)+'">'+h(r.code)+'</option>').join('')+'</select></label><label>Preço por unidade (R$)<input name="price" class="v2field" type="number" min=".00001" step=".00001" required></label><button type="submit" class="v2btn">Salvar preço manual</button></form></section>'+
 '<section class="v2panel"><div class="v2section"><h2>Ativos listados</h2><span class="v2muted">B3 x cotação</span></div>'+listed.map(r=>{
 const q=v3quoteValue(r);
 return '<div class="v2row"><span class="v2bubble">'+h(r.code.slice(0,2))+'</span><span class="v2rowinfo"><b>'+h(r.code)+'</b><small>'+(q?money(q.price)+' / un. · '+h(q.provider)+' · '+v3date(String(q.at).slice(0,10)):'Posição B3 · sem atualização')+'</small></span><div class="v2rowright"><strong>'+money(q?.total??r.cost)+'</strong><small><button type="button" class="muted-link" data-v3-fetch-quote="'+h(r.code)+'">Consultar</button></small></div></div>';
 }).join('')+'</section>';
}
async function v3fetchQuote(symbol){
 const fetcher=window.MoneyTrackerCloud?.quote;
 if(!fetcher){toast('Sincronização de cotações não disponível.',true);return;}
 const label=String(symbol||'').toUpperCase();
 toast('Consultando '+label+'...');
 try{
  const result=await fetcher(label);
  if(!S.quotes||typeof S.quotes!=='object')S.quotes={};
  S.quotes[label]={price:+result.price,at:result.at||new Date().toISOString(),provider:result.provider||'brapi'};
  save();render();toast(label+': '+money(result.price)+' / un. · '+S.quotes[label].provider);
 }catch(e){toast((e.message||String(e)).slice(0,240),true);}
}
