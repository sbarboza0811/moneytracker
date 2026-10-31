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
 root.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js',{scope:'./'}).catch(e=>console.warn('Atualização offline indisponível',e)));
}
})(window);