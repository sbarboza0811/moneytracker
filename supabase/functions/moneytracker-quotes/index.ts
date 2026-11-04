// MoneyTracker quote proxy (authenticated). Never expose private provider tokens in the browser.
const cors = {
  "Access-Control-Allow-Origin": "https://sbarboza0811.github.io",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status, headers: {...cors, "Content-Type":"application/json; charset=utf-8", "Cache-Control":"no-store"}
});
const opened = new Set(["PETR4","MGLU3","VALE3","ITUB4"]);
type Quote = {symbol:string;price:number;at:string;marketDate:string|null;provider:string;changePercent:number|null;type:string};
async function request(url:string, headers:HeadersInit = {}) {
  const res=await fetch(url,{headers,signal:AbortSignal.timeout(9000)});
  if(!res.ok)throw Error("HTTP "+res.status);
  return res.json();
}
function isoDate(value:unknown):string|null {
  if(typeof value==="number"&&Number.isFinite(value)){
    const d=new Date(value<100000000000?value*1000:value);
    return Number.isFinite(d.getTime())?d.toISOString().slice(0,10):null;
  }
  if(typeof value!=="string"||!value)return null;
  const t=Date.parse(value);
  return Number.isFinite(t)?new Date(t).toISOString().slice(0,10):null;
}
function validMarketDate(date:string|null,maxDays=16){
  if(!date)return false;
  const t=Date.parse(date+"T12:00:00Z");
  return Number.isFinite(t)&&t<=Date.now()+86400000&&Date.now()-t<=maxDays*86400000;
}
async function brapi(ticker:string,token:string|undefined):Promise<Quote> {
  const payload=await request("https://brapi.dev/api/v2/stocks/quote?symbols="+encodeURIComponent(ticker),token?{Authorization:"Bearer "+token}:{});
  const item=payload?.results?.[0];
  const symbol=String(item?.requestedSymbol||item?.symbol||"").toUpperCase();
  const record=item?.data||item, price=Number(record?.regularMarketPrice);
  if(symbol!==ticker||!Number.isFinite(price)||price<=0)throw Error("BRAPI_NO_PRICE");
  const date=isoDate(record?.regularMarketTime??record?.regularMarketDate??record?.quoteDate);
  if(!validMarketDate(date))throw Error("BRAPI_STALE");
  const change=Number(record?.regularMarketChangePercent);
  return {symbol:ticker,price,at:new Date().toISOString(),marketDate:date,
    provider:"brapi.dev",changePercent:Number.isFinite(change)?change:null,type:"cotacao"};
}
async function closingPrice(ticker:string):Promise<Quote> {
  const result=await request("https://capitalagora.com.br/api/ativo/"+encodeURIComponent(ticker),{"Accept":"application/json"});
  const symbol=String(result?.ticker||"").toUpperCase();
  const price=Number(result?.preco),date=isoDate(result?.data);
  if(symbol!==ticker||!Number.isFinite(price)||price<=0||!validMarketDate(date))throw Error("CAPITAL_NO_VALID_PRICE");
  const rawChange=result?.variacoes?.dia, change=rawChange===null||rawChange===undefined?null:Number(rawChange);
  return {symbol:ticker,price,at:new Date().toISOString(),marketDate:date,provider:"Capital Agora · fechamento B3",
    changePercent:change!==null&&Number.isFinite(change)?change:null,type:"fechamento"};
}
async function yahoo(ticker:string):Promise<Quote> {
  // Best-effort secondary source for ETFs and other B3 tickers absent from free primary sources.
  // Yahoo chart is not an official contracted quote feed; validate the returned exchange, currency and symbol.
  const expected=ticker+".SA";
  const payload=await request("https://query1.finance.yahoo.com/v8/finance/chart/"+encodeURIComponent(expected)+"?interval=1d&range=5d",
    {"Accept":"application/json","User-Agent":"Mozilla/5.0 (compatible; MoneyTracker/2.4)"});
  const result=payload?.chart?.result?.[0],meta=result?.meta;
  if(String(meta?.symbol||"").toUpperCase()!==expected ||
     String(meta?.currency||"").toUpperCase()!=="BRL")throw Error("YAHOO_MISMATCH");
  const exchange=String(meta?.exchangeName||meta?.fullExchangeName||"").toUpperCase();
  if(exchange&&!/SAO|B3|BOV|BRAZIL/.test(exchange))throw Error("YAHOO_NOT_B3");
  const prices=result?.indicators?.quote?.[0]?.close||[],ts=result?.timestamp||[];
  let lastClose=null,lastTs=null;
  for(let i=0;i<Math.min(prices.length,ts.length);i++){
    const n=Number(prices[i]);
    if(Number.isFinite(n)&&n>0&&Number.isFinite(+ts[i])){lastClose=n;lastTs=+ts[i];}
  }
  const live=Number(meta?.regularMarketPrice);
  const liveDate=isoDate(meta?.regularMarketTime);
  const price=Number.isFinite(live)&&live>0&&validMarketDate(liveDate)?live:lastClose;
  const date=Number.isFinite(live)&&live>0&&validMarketDate(liveDate)?liveDate:isoDate(lastTs);
  if(!(Number(price)>0)||!validMarketDate(date))throw Error("YAHOO_NO_VALID_PRICE");
  return {symbol:ticker,price:Number(price),at:new Date().toISOString(),marketDate:date,
    provider:"Yahoo Finance · B3 (.SA)",changePercent:null,type:"cotacao"};
}
Deno.serve(async (req:Request)=>{
  if(req.method==="OPTIONS")return new Response(null,{headers:cors});
  if(req.method!=="POST")return json({error:"Método inválido"},405);
  try {
    const body=await req.json(),ticker=String(body?.symbol||"").trim().toUpperCase();
    if(!/^[A-Z][A-Z0-9]{3,11}$/.test(ticker))return json({error:"Código de ativo inválido"},400);
    // Fetch independent sources concurrently: a source returning an older close must not
    // hide a newer quote from another validated provider.
    const token=Deno.env.get("BRAPI_API_TOKEN")||undefined;
    const sources:{name:string;query:Promise<Quote>}[]=[
      {name:"Capital Agora",query:closingPrice(ticker)},
      {name:"Yahoo Finance",query:yahoo(ticker)}
    ];
    if(token||opened.has(ticker))sources.push({name:"brapi",query:brapi(ticker,token)});
    const responses=await Promise.allSettled(sources.map(s=>s.query));
    const offers:Quote[]=[],errors:string[]=[];
    for(let i=0;i<responses.length;i++){
      const res=responses[i];
      if(res.status==="fulfilled"&&res.value.symbol===ticker&&validMarketDate(res.value.marketDate))
        offers.push(res.value);
      else errors.push(sources[i].name+": "+(res.status==="rejected"?String(res.reason):"preço inválido"));
    }
    // Dates are verified by each provider. Prefer newer dates, then quotes over older
    // closing-feed values; never create prices or imply real-time if the source is stale.
    const providerRank=(q:Quote)=>q.provider==="brapi.dev"?3:q.provider.includes("Yahoo Finance")?2:1;
    offers.sort((a,b)=>String(b.marketDate).localeCompare(String(a.marketDate))||
      providerRank(b)-providerRank(a));
    if(offers.length)return json(offers[0]);
    return json({error:"Não foi encontrada cotação recente e confirmada para "+ticker+". Último valor conhecido será mantido.",
      code:"PRICE_UNAVAILABLE",symbol:ticker},404);
  }catch(e){return json({error:"Falha ao consultar preço: "+String((e as Error)?.message||"indisponível").slice(0,100)},503);}
});