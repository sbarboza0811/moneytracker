(function(root){
'use strict';
let installPrompt=null;
function standalone(){return root.matchMedia?.('(display-mode: standalone)').matches||root.navigator?.standalone===true;}
root.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;});
root.addEventListener('appinstalled',()=>{installPrompt=null;});
async function install(){
 if(standalone()){root.MoneyTrackerAppV7?.notify('O aplicativo já está instalado.');return;}
 if(installPrompt){
  const prompt=installPrompt;installPrompt=null;
  await prompt.prompt();
  try{await prompt.userChoice;}catch{}
 }else root.MoneyTrackerAppV7?.notify('No Chrome do Android, toque em ⋮ e escolha Instalar app ou Adicionar à tela inicial. Abra o site fora do ChatGPT.',false);
}
root.MoneyTrackerInstallV7={install};
if('serviceWorker' in navigator){
 let reloading=false;
 const safeToReload=()=>!root.MoneyTrackerAppV7?.isBusy?.()&&!root.MoneyTrackerCloudV7?.hasUnsaved?.();
 navigator.serviceWorker.addEventListener('controllerchange',()=>{
  if(reloading)return;
  if(!safeToReload()){
   root.MoneyTrackerAppV7?.notify('Uma nova versão está disponível. Salve suas alterações e reabra o aplicativo.');
   return;
  }
  reloading=true;
  root.location?.reload?.();
 });
 async function checkUpdate(){
  if(document.visibilityState==='hidden')return;
  try{
   const registration=await navigator.serviceWorker.getRegistration('./');
   await registration?.update();
  }catch(error){console.warn('Verificação da atualização do aplicativo falhou',error);}
 }
 root.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js',{scope:'./'})
  .then(()=>checkUpdate()).catch(e=>console.warn('Atualização offline indisponível',e)));
 root.addEventListener('focus',checkUpdate);
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')checkUpdate();});
 root.setInterval(checkUpdate,60*60*1000);
}
})(window);