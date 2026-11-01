(function(root){
'use strict';
const E=root.MoneyTrackerEngine,A=root.MoneyTrackerAppV7;
let client=null,user=null,remoteRevision=null,queued=null,saveTimer=null,saving=false,saveBlocked=false;
const el=id=>document.getElementById(id);
const info=(msg)=>{A?.loginStatus(msg);};
const cloud={status:'Verificando sessão…'};
function setStatus(msg,error=false){
 cloud.status=msg;
 const span=el('mt7-cloud-status');if(span)span.textContent=msg;
 if(error)A?.onSyncError(msg);
}
function authForm(show){
 const form=el('mt7-auth-form');if(form)form.hidden=!show;
 const busy=el('mt7-auth-wait');if(busy)busy.hidden=show;
 const retry=el('mt7-auth-retry');if(retry)retry.hidden=show;
}
function loginNeeded(reason=''){
 A?.loginNeeded();authForm(true);
 info(reason||'Entre para acessar seus investimentos.');
}
function validateState(data){return data&&data.v===3&&Array.isArray(data.records);}
async function remoteRead(){
 if(!user||!client)throw Error('Faça login para acessar a nuvem.');
 const result=await client.from('moneytracker_snapshots').select('data,updated_at').eq('user_id',user.id).maybeSingle();
 if(result.error)throw result.error;
 const row=result.data;
 if(row&&!validateState(row.data))throw Error('A carteira na nuvem está em formato não reconhecido. Não substituímos seus dados.');
 remoteRevision=row?.updated_at||null;
 if(row)A.setState(row.data);else A.setState(E.newState());
 setStatus(row?'Sincronizado · '+new Date(row.updated_at).toLocaleString('pt-BR'):'Conta nova · importar B3');
}
async function enter(u){
 root.MoneyTrackerAI?.reset?.();
 user=u;queued=null;saveBlocked=false;setStatus('Carregando dados…');
 await remoteRead();
 A.loginReady(u);
 if(el('mt7-user-email'))el('mt7-user-email').textContent=u.email||'Conta conectada';
}
async function sendPending(){
 if(saving||saveBlocked||!queued||!user)return;
 saving=true;
 const snapshot=queued;
 queued=null;setStatus('Salvando na nuvem…');
 try{
  const newRevision=new Date().toISOString();
  let result;
  if(remoteRevision){
   result=await client.from('moneytracker_snapshots').update({
     data:snapshot,updated_at:newRevision
   }).eq('user_id',user.id).eq('updated_at',remoteRevision).select('updated_at').maybeSingle();
  }else{
   result=await client.from('moneytracker_snapshots').insert({
     user_id:user.id,data:snapshot,updated_at:newRevision
   }).select('updated_at').single();
  }
  if(result.error)throw result.error;
  if(!result.data?.updated_at){
   saveBlocked=true;throw Error('A carteira foi alterada em outra aba ou dispositivo. Não substituímos a versão mais nova. Exporte seu backup antes de recarregar.');
  }
  remoteRevision=result.data.updated_at;
  setStatus('Salvo na nuvem');
 }catch(err){
  if(!queued)queued=snapshot;
  const conflict=saveBlocked||err.code==='23505';
  if(conflict)saveBlocked=true;
  setStatus((conflict?'Conflito de sincronização: ':'Não foi possível salvar: ')+(err.message||String(err)),true);
 }finally{
  saving=false;
  if(queued&&!saveBlocked&&user){
   clearTimeout(saveTimer);saveTimer=setTimeout(sendPending,2400);
  }
 }
}
function scheduleSave(snapshot){
 if(!user){A.notify('Entre para salvar os dados.',true);return;}
 queued=JSON.parse(JSON.stringify(snapshot));setStatus('Alterações pendentes…');
 if(!saveBlocked){clearTimeout(saveTimer);saveTimer=setTimeout(sendPending,650);}
 else setStatus('Alterações locais não sincronizadas. Exporte backup.',true);
}
async function sync(){
 if(!user)return loginNeeded();
 if(queued){
  if(saveBlocked){A.notify('Conflito de versão. Exporte backup e recarregue os dados antes de importar novamente.',true);return;}
  await sendPending();
  if(queued)return;
 }
 if(saving){A.notify('Sincronização em andamento.');return;}
 try{await remoteRead();A.notify('Dados sincronizados.');}
 catch(err){setStatus('Falha ao sincronizar: '+(err.message||err),true);}
}
async function reloadCloud(){
 if(!user)return;
 if(queued&&!confirm('Existem alterações que NÃO estão salvas. Se recarregar, perderá as alterações locais. Exporte um backup antes de prosseguir.'))return;
 queued=null;saveBlocked=false;
 await remoteRead();A.notify('Carteira recarregada da nuvem.');
}
async function logout(){
 if(saving){A.notify('Salvamento em andamento.');return;}
 if(queued){
  if(saveBlocked){A.notify('Exporte um backup antes de sair; as alterações não foram salvas.',true);return;}
  await sendPending();
  if(queued){A.notify('Dados não salvos. Exporte backup antes de sair.',true);return;}
 }
 const result=await client.auth.signOut();
 if(result.error){A.notify('Não foi possível sair: '+result.error.message,true);return;}
 root.MoneyTrackerAI?.reset?.();
 user=null;remoteRevision=null;A.setState(E.newState());loginNeeded('Você saiu da conta.');
 setStatus('Sessão encerrada');
}
async function login(signup){
 if(!client){info('Serviço de autenticação não configurado.');return;}
 const email=el('mt7-email')?.value.trim()||'',password=el('mt7-password')?.value||'';
 if(!email||password.length<6){info('Preencha um e-mail válido e senha de no mínimo 6 caracteres.');return;}
 const b=el('mt7-login'),s=el('mt7-signup');b.disabled=true;s.disabled=true;
 info('Validando acesso…');
 try{
  const {data,error}=signup?await client.auth.signUp({email,password}):await client.auth.signInWithPassword({email,password});
  if(error)throw error;
  if(!data?.session||!data?.user){info('Confira o e-mail de confirmação antes de entrar.');return;}
  await enter(data.user);info('');
 }catch(err){info(err.message||String(err));}
 finally{b.disabled=false;s.disabled=false;}
}
async function quote(symbol){
 if(!user||!client)throw Error('Entre na conta para obter preços.');
 const {data,error}=await client.functions.invoke('moneytracker-quotes',{body:{symbol}});
 if(error){
  let msg=error.message||'Serviço de cotação indisponível';
  try{const details=await error.context?.json();if(details?.error)msg=details.error;}catch{}
  throw Error(msg);
 }
 if(!data||!(Number(data.price)>0))throw Error(data?.error||'Preço não encontrado.');
 return data;
}
async function ai(body){
 if(!user||!client)throw Error('Entre na conta para usar a análise por IA.');
 const {data,error}=await client.functions.invoke('moneytracker-ai',{body});
 if(error){
  let message=error.message||'Não foi possível acessar a IA.';
  let code='';
  try{const details=await error.context?.json();if(details?.error)message=details.error;if(details?.code)code=details.code;}catch(_){}
  const exception=new Error(message);exception.code=code;throw exception;
 }
 if(!data)throw Error('A IA não retornou uma resposta.');
 return data;
}
async function init(){
 const form=el('mt7-auth-form');if(form)form.addEventListener('submit',event=>{event.preventDefault();login(false);});
 el('mt7-signup')?.addEventListener('click',()=>login(true));
 el('mt7-auth-retry')?.addEventListener('click',()=>init());
 const cfg=root.MT_CONFIG;
 if(!cfg?.supabaseUrl||!cfg?.supabasePublishableKey){
  loginNeeded('Configuração de acesso indisponível. Verifique o arquivo config.js.');return;
 }
 if(!root.supabase?.createClient){
  loginNeeded('Biblioteca Supabase não carregada. Abra no Chrome com internet.');return;
 }
 if(!client){
  client=root.supabase.createClient(cfg.supabaseUrl,cfg.supabasePublishableKey,{
   auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}
  });
 }
 authForm(false);info('Restaurando sua sessão salva…');
 try{
  const {data,error}=await client.auth.getSession();
  if(error)throw error;
  if(!data?.session){loginNeeded();return;}
  const verified=await client.auth.getUser();
  if(verified.error||!verified.data?.user)throw verified.error||Error('Sessão inválida.');
  await enter(verified.data.user);
 }catch(err){
  const hasSaved=await client.auth.getSession().then(r=>!!r.data?.session).catch(()=>false);
  if(hasSaved){
    A.loginNeeded();authForm(false);
    info('Não foi possível conectar à sua carteira: '+(err.message||err)+'. Toque em Tentar novamente. Sua sessão não foi descartada.');
    if(el('mt7-auth-retry'))el('mt7-auth-retry').hidden=false;
  }else loginNeeded(err.message||'Faça login novamente.');
 }
}
root.MoneyTrackerCloudV7=Object.assign(cloud,{scheduleSave,sync,logout,quote,ai,reloadCloud});
init();
})(window);