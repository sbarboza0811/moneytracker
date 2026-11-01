(function(root){
'use strict';
// Scenario-based allocation diagnostics. No trade execution and no prediction of returns.
const SEG=[
 {id:'bonds',name:'Tesouro e renda fixa',short:'Renda fixa',color:'#4b82e7',study:'Tesouro Selic / IMAB11',why:'Amortecer a oscilação da parcela de renda variável; avaliar prazo e marcação a mercado.'},
 {id:'fiis',name:'Fundos imobiliários',short:'FIIs',color:'#ba8aee',study:'FIIs já existentes',why:'Risco de imóveis, crédito e taxas de juros; comparar qualidade, liquidez e concentração.'},
 {id:'brazil',name:'Ações brasileiras',short:'Brasil',color:'#36bda3',study:'BOVA11 / DIVO11',why:'Exposição ampla ao mercado brasileiro; verificar sobreposição de índices e custos.'},
 {id:'global',name:'Ações no exterior',short:'Exterior amplo',color:'#f3a968',study:'WRLD11 / IVVB11',why:'Diversificação geográfica; WRLD11 é global e IVVB11 concentra-se nos EUA.'},
 {id:'thematic',name:'Tecnologia e temáticos',short:'Temáticos',color:'#e9879a',study:'TECK11 / CHIP11',why:'Segmentos concentrados e voláteis; podem se sobrepor a índices internacionais.'},
 {id:'gold',name:'Ouro',short:'Ouro',color:'#dcc169',study:'GOLD11',why:'Possível diversificador, com riscos próprios e exposição cambial.'},
 {id:'other',name:'Não classificados',short:'Outros',color:'#96a1b5',study:'Verificar classificação',why:'Identificar o produto antes de atribuir objetivo ou risco.'}
];
const TARGETS={
 protection:{bonds:60,fiis:15,brazil:10,global:10,thematic:2,gold:3,other:0},
 balanced:{bonds:35,fiis:20,brazil:20,global:20,thematic:2,gold:3,other:0},
 growth:{bonds:20,fiis:15,brazil:20,global:30,thematic:10,gold:5,other:0}
};
const Brazil=new Set('BOVA11 BOVV11 IBOV11 PIBB11 DIVO11 BEST11 AUVP11'.split(' '));
const Global=new Set('WRLD11 IVVB11 ACWI11 SPXI11 SPXR11'.split(' '));
const Thematic=new Set('TECK11 CHIP11 NASD11'.split(' '));
const Gold=new Set('GOLD11'.split(' '));
const Bonds=new Set('IMAB11 LFTS11'.split(' '));
const ETF=new Set([...Brazil,...Global,...Thematic,...Gold,...Bonds]);
const num=x=>Number.isFinite(+x)?+x:0;
const round=x=>Math.round(x*100)/100;
function segment(h){
 const code=String(h.code||'').trim().toUpperCase(),grp=String(h.group||'').toLowerCase();
 if(h.fixedIncome||/tesouro/.test(code)||/tesouro|renda fixa/.test(grp)||Bonds.has(code))return 'bonds';
 if(Gold.has(code))return 'gold';
 if(Thematic.has(code))return 'thematic';
 if(Global.has(code))return 'global';
 if(Brazil.has(code))return 'brazil';
 if(ETF.has(code)||grp==='etf'||grp==='etfs')return 'other';
 if(/12$/.test(code)&&num(h.value)===0)return 'other'; // subscription rights are not FIIs with market prices
 if(/^(fiis?|fundos?)$/.test(grp)||/fii|imobili[aá]r/i.test(String(h.product||'')))return 'fiis';
 if(/11$/.test(code))return 'fiis';
 if(/a[çc][oõ]es|bdrs?/.test(grp))return 'brazil';
 return 'other';
}
function evaluate({portfolio,quotes={},scenario='balanced',amount=1000,now=new Date()}){
 const holds=(portfolio?.holdings||[]).filter(h=>num(h.value)>=0);
 const all=Object.fromEntries(SEG.map(s=>[s.id,{...s,value:0,positions:[],percent:0,target:(TARGETS[scenario]||TARGETS.balanced)[s.id]||0}]));
 const total=round(holds.reduce((a,h)=>a+num(h.value),0));
 const traded=holds.filter(h=>!h.fixedIncome && !/tesouro/i.test(h.code||'')&&!/tesouro/i.test(h.group||''));
 let priced=0,stale=0,unquoted=[];
 const marketDates=[];
 const weights=new Map();
 for(const h of holds){
  const name=segment(h),v=num(h.value);
  all[name].value+=v;all[name].positions.push(h);
  const k=String(h.code||'');
  weights.set(k,(weights.get(k)||0)+v);
 }
 for(const k of Object.keys(all)){
  all[k].value=round(all[k].value);
  all[k].percent=total?100*all[k].value/total:0;
 }
 for(const h of traded){
  const code=String(h.code||'').trim().toUpperCase(),q=quotes[code],p=Number(q?.price);
  if(q&&p>0&&h.origin==='quote'){
   priced++;
   const date=String(q.marketDate||q.at||'').slice(0,10);
   if(date)marketDates.push(date);
   const t=Date.parse(date+'T12:00:00Z');
   if(!Number.isFinite(t)||now.getTime()-t>8*86400000)stale++;
  }else{unquoted.push(code);}
 }
 const compared=[...weights.entries()].filter(([k,v])=>v>0).sort((a,b)=>b[1]-a[1]);
 const top=compared[0]||null,top5=compared.slice(0,5).reduce((a,x)=>a+x[1],0);
 const invest=Math.max(0,Math.min(1e9,Number(amount)||0)),targets=TARGETS[scenario]||TARGETS.balanced;
 const deficits=SEG.filter(x=>x.id!=='other').map(x=>({
   ...all[x.id],
   need:Math.max(0,total&&invest?((total+invest)*targets[x.id]/100-all[x.id].value):0)
 })).filter(x=>x.need>0).sort((a,b)=>b.need-a.need);
 const parts=deficits.slice(0,4);
 const sum=parts.reduce((n,p)=>n+p.need,0);
 let assigned=0;
 const allocations=parts.map((p,i)=>{
  let value=i===parts.length-1?Math.max(0,invest-assigned):Math.round((invest*p.need/Math.max(1,sum))/10)*10;
  value=Math.min(value,invest-assigned);
  assigned+=value;
  return {...p,allocation:round(value)};
 }).filter(x=>x.allocation>0);
 const risks=[];
 if(total>0){
  if(all.fiis.percent>35)risks.push({level:'attention',name:'Peso relevante em fundos imobiliários',detail:all.fiis.percent.toFixed(1).replace('.',',')+'% do patrimônio analisado está em FIIs. Compare concentração por setor e risco de juros/crédito.'});
  if(all.thematic.percent>10)risks.push({level:'attention',name:'Exposição temática elevada',detail:all.thematic.percent.toFixed(1).replace('.',',')+'% está em tecnologia/temáticos, com potencial sobreposição a índices globais.'});
  if(top&&100*top[1]/total>15)risks.push({level:'attention',name:'Ativo com peso elevado',detail:top[0]+' representa '+(100*top[1]/total).toFixed(1).replace('.',',')+'% da carteira. O risco depende do conteúdo do ativo.'});
  if(all.global.percent<10)risks.push({level:'study',name:'Baixa participação internacional ampla',detail:'A exposição em índices internacionais amplos é inferior a 10%. Avalie diversificação geográfica e riscos cambiais.'});
  if(all.bonds.percent<15)risks.push({level:'study',name:'Pouca parcela defensiva',detail:'A participação de Tesouro e renda fixa é inferior a 15%. Revise horizonte, liquidez e reserva de emergência.'});
  if(all.other.percent>3)risks.push({level:'data',name:'Ativos sem categorização suficiente',detail:'Parte relevante do patrimônio não foi classificada com segurança; corrija antes de usar metas como decisão.'});
 }
 if(unquoted.length)risks.push({level:'data',name:'Cotações incompletas',detail:[...new Set(unquoted)].slice(0,6).join(', ')+(unquoted.length>6?' e outros':'')+'. Usados os valores previamente importados quando disponíveis.'});
 if(stale)risks.push({level:'data',name:'Cotações antigas',detail:stale+' posição(ões) usam preço salvo com referência superior a oito dias.'});
 if(!total)risks.push({level:'data',name:'Carteira sem valores',detail:'Importe uma posição B3 válida para começar a análise.'});
 const quoteDate=marketDates.sort().at(-1)||null;
 return {total,assets:compared.length,holdings:holds.length,all,segments:SEG.map(s=>all[s.id]),
  scenario,invest,targets,allocations,risks,top,top5Weight:total?100*top5/total:0,
  priced,tradeCount:traded.length,missing:[...new Set(unquoted)],quoteDate,models:TARGETS};
}
root.MoneyTrackerInsights={evaluate,segment,segments:SEG,models:TARGETS};
})(window);