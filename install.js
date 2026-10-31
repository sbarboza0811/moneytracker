(()=>{'use strict';let promptEvent=null;
const isInstalled=()=>window.matchMedia('(display-mode: standalone)').matches||window.navigator.standalone;
function showStatus(msg){const t=document.querySelector('#mt-install-feedback');if(t){t.textContent=msg;t.hidden=false;}else alert(msg);}
async function onInstall(){if(isInstalled()){showStatus('O MoneyTracker já está instalado.');return;}
if(promptEvent){const event=promptEvent;promptEvent=null;await event.prompt();try{const choice=await event.userChoice;if(choice?.outcome==='accepted'){document.querySelectorAll('.mt-install-btn').forEach(b=>b.hidden=true);}}catch{}return;}
showStatus('No Chrome do Android, toque em ⋮ no canto superior e escolha “Instalar app” ou “Adicionar à tela inicial”. Se abriu pelo ChatGPT, use “Abrir no Chrome” primeiro.');}
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();promptEvent=event;document.querySelectorAll('.mt-install-btn').forEach(b=>b.hidden=false);});
window.addEventListener('appinstalled',()=>{promptEvent=null;document.querySelectorAll('.mt-install-btn').forEach(b=>b.hidden=true);showStatus('MoneyTracker instalado.');});
document.addEventListener('DOMContentLoaded',()=>{document.querySelectorAll('.mt-install-btn').forEach(b=>{b.addEventListener('click',onInstall);if(isInstalled())b.hidden=true;});});
if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js',{scope:'./'}).catch(err=>console.warn('SW não disponível',err)));
})();
