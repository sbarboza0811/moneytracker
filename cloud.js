
/* MoneyTracker: sincronização privada em projeto Supabase EXCLUSIVO. */
(()=>{'use strict';
const $=id=>document.getElementById(id);
let client=null,currentUser=null,saveTimer=null,saving=false,queued=null,saveFailed=false;
const status=(s)=>{const x=$('mt-cloud-status');if(x)x.textContent=s;};
const message=(s)=>{const x=$('mt-auth-status');if(x)x.textContent=s;};
function showLogin(info){const form=$('mt-auth-form');if(form)form.classList.add('mt-auth-ready');const description=$('mt-auth-info');if(description)description.textContent='Entre para acessar seus investimentos.';if(info)message(info);}
function lock(){ $('mt-auth-gate').hidden=false;$('mt-cloud-bar').hidden=true;currentUser=null;showLogin(); }
function unlock(){ $('mt-auth-gate').hidden=true;$('mt-cloud-bar').hidden=false; }
const valid=v=>v&&v.v===3&&Array.isArray(v.records);
async function fetchCloud(){
 if(!currentUser)throw Error('Faça login.');
 const {data,error}=await client.from('moneytracker_snapshots').select('data').eq('user_id',currentUser.id).maybeSingle();
 if(error)throw error;
 if(data){
   if(!valid(data.data))throw Error('Dados remotos em formato inesperado.');
   window.MoneyTrackerBridge.setState(data.data);status('Sincronizado');
 }else{
   window.MoneyTrackerBridge.reset();status('Conta nova · importar B3');
 }
}
async function doSave(){
 if(!currentUser||!queued||saving)return;
 const snapshot=queued;queued=null;saving=true;status('Salvando...');
 try{
   const {error}=await client.from('moneytracker_snapshots').upsert({
     user_id:currentUser.id,data:snapshot,updated_at:new Date().toISOString()
   },{onConflict:'user_id'});
   if(error)throw error;
   saveFailed=false;status('Salvo na nuvem');
 }catch(e){
   if(!queued)queued=snapshot;
   saveFailed=true;status('Não salvo: '+(e.message||e));
 }finally{
   saving=false;
   if(queued&&currentUser&&!saveFailed){
     clearTimeout(saveTimer);saveTimer=setTimeout(doSave,800);
   }
 }
}
function scheduleSave(snapshot){
 if(!currentUser)return;
 queued=JSON.parse(JSON.stringify(snapshot));saveFailed=false;
 clearTimeout(saveTimer);saveTimer=setTimeout(doSave,800);status('Alterações pendentes');
}
async function quote(symbol){
 if(!client||!currentUser)throw Error('Entre na sua conta para consultar preços.');
 const {data,error}=await client.functions.invoke('moneytracker-quotes',{body:{symbol}});
 if(error){let detail=error.message||'Falha na cotação';try{const body=await error.context?.json();if(body?.error)detail=body.error;}catch{}throw Error(detail);}
 if(!data||!Number.isFinite(Number(data.price)))throw Error(data?.error||'Não foi possível encontrar a cotação.');
 return data;
}
window.MoneyTrackerCloud={scheduleSave,quote};
async function enter(user){currentUser=user;status('Carregando...');await fetchCloud();unlock();}
async function auth(action){
 if(!client){message('Configure um projeto Supabase independente no arquivo config.js.');return;}
 const email=$('mt-email').value.trim(),password=$('mt-pass').value;
 if(!email||password.length<6){message('Informe e-mail e senha de pelo menos 6 caracteres.');return;}
 message('Validando...');$('mt-login').disabled=true;$('mt-signup').disabled=true;
 try{
   const result=action==='signup'
     ? await client.auth.signUp({email,password})
     : await client.auth.signInWithPassword({email,password});
   if(result.error)throw result.error;
   if(!result.data.user||!result.data.session){message('Verifique seu e-mail para confirmar a conta e depois entre.');return;}
   await enter(result.data.user);message('');
 }catch(e){lock();message(e.message||String(e));}
 finally{$('mt-login').disabled=false;$('mt-signup').disabled=false;}
}
async function sync(){
 if(!currentUser||saving)return;
 if(queued){await doSave(); if(queued)return;}
 try{await fetchCloud()}catch(e){status('Falha: '+(e.message||e));}
}
async function signout(){
 if(saving)return;
 if(queued){await doSave();if(queued){status('Salve ou exporte backup antes de sair.');return;}}
 const {error}=await client.auth.signOut();
 if(error){status('Falha ao sair');return;}
 window.MoneyTrackerBridge.reset();lock();message('Sessão encerrada.');
}
async function init(){
 $('mt-auth-form').addEventListener('submit',e=>{e.preventDefault();auth('login');});
 $('mt-signup').addEventListener('click',()=>auth('signup'));
 $('mt-cloud-sync').addEventListener('click',sync);
 $('mt-cloud-logout').addEventListener('click',signout);
 const cfg=window.MT_CONFIG;
 if(!cfg?.supabaseUrl||!cfg?.supabasePublishableKey){
   message('Banco de dados independente ainda não configurado.');return;
 }
 if(!window.supabase?.createClient){
   message('Biblioteca de autenticação indisponível. Verifique a internet.');return;
 }
 client=window.supabase.createClient(cfg.supabaseUrl,cfg.supabasePublishableKey,{
   auth:{persistSession:true,autoRefreshToken:true}
 });
 message('Restaurando sua sessão...');
 const {data:sessionData,error:sessionError}=await client.auth.getSession();
 if(sessionError||!sessionData?.session){showLogin('Entre ou crie sua conta.');return;}
 try{
  const {data,error}=await client.auth.getUser();
  if(error||!data?.user)throw Error(error?.message||'Não foi possível validar sua sessão.');
  await enter(data.user);message('');
 }catch(e){message('Não foi possível carregar sua carteira: '+(e.message||e)+'. Verifique sua conexão e atualize a página.');}
}
init();
})();
