(function(root){
'use strict';
// Chat state is intentionally ephemeral: no conversation content is stored in the B3 database.
const sessions={me:[],spouse:[],family:[]};
let running=false,error='',connected=null,statusLoading=false,statusChecked=false,reportedModel='';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','"':'&quot;',"'":'&#39;'}[c]));
const own=()=>{const o=root.MoneyTrackerAppV7?.getUi?.()?.owner;return sessions[o]?o:'family';};
const messages=()=>sessions[own()];
const safeText=s=>esc(s).replace(/\*\*([^*\n]{1,200})\*\*/g,'<strong>$1</strong>').replace(/\n/g,'<br>');
const examples=[
 ['Diagnóstico completo','Analise as posições reais da minha carteira. Identifique 3 riscos específicos, concentrações e 3 oportunidades concretas de diversificação, usando valores e percentuais.'],
 ['Próximo aporte','Para meu próximo aporte, compare 3 ativos ou ETFs específicos que façam sentido com minha carteira atual, indicando tese, sobreposições, pontos contra e riscos.'],
 ['O que evitar?','Considerando o que eu já tenho, quais ativos ou setores eu deveria evitar aumentar por concentração ou sobreposição? Cite os códigos e percentuais reais.'],
 ['Comparar meus ETFs','Compare BOVA11, DIVO11, BEST11, IVVB11, TECK11 e CHIP11 em relação à minha carteira, explicando sobreposição e possíveis lacunas.']
];
function panel(){
 if(!statusChecked&&!statusLoading){statusChecked=true;Promise.resolve().then(()=>status(true));}
 const list=messages();
 const actionButtons=examples.map((x,i)=>'<button type="button" class="m8-ai-example" data-ai-example="'+i+'">'+esc(x[0])+'</button>').join('');
 const badge=connected===true?'<span class="m8-ai-status is-ready">Chave do Gemini salva</span>':
  connected===false?'<span class="m8-ai-status is-off">Chave Gemini pendente</span>':
  '<span class="m8-ai-status">Conexão a verificar</span>';
 const info=connected===false?
   '<div class="m8-ai-config"><b>Ativação do Gemini</b><p>Crie uma chave gratuita no <a href="https://aistudio.google.com/api-keys" target="_blank" rel="noopener noreferrer">Google AI Studio</a> e salve como <code>GEMINI_API_KEY</code> em <a href="https://supabase.com/dashboard/project/xdpdmcihbqjerduxhagm/functions/secrets" target="_blank" rel="noopener noreferrer">Secrets do Supabase</a>. Nunca compartilhe a chave ou publique no GitHub.</p></div>':'';
 const history=list.length?'<div class="m8-ai-messages">'+list.map(m=>
  '<article class="m8-ai-message '+(m.role==='assistant'?'assistant':'user')+'"><div class="m8-ai-message-head">'+(m.role==='assistant'?'✦ MoneyTracker IA':'Você')+'</div><div class="m8-ai-message-text">'+safeText(m.text)+'</div></article>').join('')+'</div>':
  '<div class="m8-ai-start"><span>✦</span><b>Seu analista de investimentos com IA</b><p>Analisa a carteira real, compara ativos e responde perguntas específicas. As respostas são geradas por um modelo de IA, não por regras fixas.</p></div>';
 const waiting=running?'<div class="m8-ai-thinking" role="status"><span class="m8-ai-pulse"></span> Analisando suas posições e cotações…</div>':'';
 const errorInfo=error?'<p class="m8-ai-error" role="alert">'+esc(error)+'</p>':'';
 return '<section class="m8-panel m8-ai-panel" id="m8-ai-panel"><div class="m8-ai-header"><div><div class="m8-ai-kicker">✦ INTEGRADO AO APP</div><h2>Consultor IA</h2><p>Pergunte sobre aportes, riscos, alternativas e sua carteira atual.</p></div><div class="m8-ai-connect">'+badge+'<button type="button" class="m8-btn sub" data-ai-action="status" '+(statusLoading?'disabled':'')+'>'+(statusLoading?'Verificando…':'Verificar configuração')+'</button></div></div>'+
 info+history+waiting+errorInfo+
 '<div class="m8-ai-quick">'+actionButtons+'</div>'+
 '<form id="m8-ai-form" class="m8-ai-form"><label for="m8-ai-input">Pergunte à IA sobre seus investimentos</label><textarea id="m8-ai-input" rows="3" maxlength="700" placeholder="Ex.: Tenho R$ 3.000 para aportar. O que faz sentido estudar hoje na minha carteira?" '+(running?'disabled':'')+' required></textarea>'+
 '<div class="m8-ai-form-actions"><small>A IA usa seus ativos e valores salvos. Não realiza ordens.</small><button type="submit" class="m8-btn primary" '+(running?'disabled':'')+'>'+(running?'Analisando…':'✦ Analisar com IA')+'</button></div></form>'+
 '<p class="m8-ai-foot">Quando você pergunta, o Gemini recebe códigos e valores das posições, além da pergunta. No plano gratuito, o Google pode usar o conteúdo enviado para melhorar seus produtos. Não envie dados pessoais no chat. As cotações podem estar desatualizadas. Não é aconselhamento financeiro profissional.</p>'+
 (list.length?'<button type="button" class="m8-ai-clear" data-ai-action="clear">Limpar conversa desta sessão</button>':'')+
 '</section>';
}
function redraw(){root.MoneyTrackerAppV7?.render?.();}
async function status(silent=false){
 if(statusLoading)return;
 statusLoading=true;redraw();
 try{const data=await root.MoneyTrackerCloudV7.ai({action:'status'});
  connected=!!data.configured;reportedModel=String(data.model||'');
  if(!silent&&connected)error='';
 }catch(e){connected=null;if(!silent)error=String(e.message||e);}
 finally{statusLoading=false;redraw();}
}
async function ask(question){
 const owner=own(),text=String(question||'').trim().slice(0,700);
 if(running||!text)return;
 if(connected===false){error='A IA ainda não está ativada. Configure GEMINI_API_KEY nas Secrets do Supabase.';redraw();return;}
 running=true;error='';const history=sessions[owner].slice(-6);
 sessions[owner].push({role:'user',text});redraw();
 try{
  const amount=Number(root.MoneyTrackerAppV7?.getUi?.()?.planAmount)||0;
  const result=await root.MoneyTrackerCloudV7.ai({owner,question:text,amount,history});
  if(!result?.reply)throw Error('A IA retornou uma resposta vazia.');
  sessions[owner].push({role:'assistant',text:String(result.reply)});
  connected=true;reportedModel=String(result.model||reportedModel);
 }catch(e){
  const code=String(e.code||'');
  if(code==='AI_NOT_CONFIGURED')connected=false;
  error=String(e.message||e);
  sessions[owner].pop(); // failed questions should not become conversation history
 }finally{running=false;redraw();}
}
function reset(){
 for(const o of Object.keys(sessions))sessions[o]=[];
 running=false;error='';connected=null;statusLoading=false;statusChecked=false;reportedModel='';
}
document.addEventListener('submit',ev=>{
 if(ev.target?.id!=='m8-ai-form')return;
 ev.preventDefault();
 const prompt=document.getElementById('m8-ai-input')?.value||'';
 ask(prompt);
});
document.addEventListener('click',ev=>{
 const b=ev.target?.closest?.('[data-ai-example],[data-ai-action]');
 if(!b)return;
 if(b.dataset.aiExample!==undefined){
  const index=Number(b.dataset.aiExample),example=examples[index];if(!example)return;
  const input=document.getElementById('m8-ai-input');
  if(input){input.value=example[1];input.focus();}
  return;
 }
 if(b.dataset.aiAction==='status')status();
 if(b.dataset.aiAction==='clear'){sessions[own()]=[];error='';redraw();}
});
root.MoneyTrackerAI={panel,ask,status,reset,ready:()=>connected};
})(window);