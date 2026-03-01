import { useState, useEffect, useRef, useMemo, useCallback } from "react";

const FKEY = "d6i7s89r01ql9cif9b10d6i7s89r01ql9cif9b1g";

const store = {
  get: async (k) => { const v = localStorage.getItem(k); return v ? { value: v } : null; },
  set: async (k, v) => { localStorage.setItem(k, String(v)); },
};

const T = {
  bg:"#060d1a", bg2:"#0a1628", panel:"#0d1f35", panel2:"#0f2440",
  border:"#1a3a5c", border2:"#0e2540",
  green:"#00e676", greenDim:"#002d12",
  red:"#ff3d57", redDim:"#2d0010",
  blue:"#00b0ff", blue2:"#0091ea", blueDim:"#001c30",
  yellow:"#ffd600", cyan:"#00e5ff",
  text:"#dff0fd", muted:"#4a7fa5",
  mono:"'Courier New',monospace",
};

const fmt = (n, d=2) => n==null||isNaN(n)?"—":Number(n).toLocaleString("es-AR",{minimumFractionDigits:d,maximumFractionDigits:d});
const fmtPct = (n) => n==null?"—":`${n>=0?"+":""}${Math.abs(n).toFixed(2)}%`;
const pn = (v) => { const n=parseFloat(String(v||"").replace(/[^\d.\-]/g,"")); return isNaN(n)?null:n; };
const sign = (n) => n>0?"+":"";

const CRYPTO_BASES = ["BTC","ETH","BNB","SOL","XRP","ADA","DOGE","MATIC","LINK","AVAX","DOT","LTC","XLM","UNI","ATOM","ETC","TRX","FIL","NEAR","APT","ARB","OP","INJ","SUI","TIA","PEPE","WIF","BONK","SHIB","TON","RENDER","FET","RNDR","STX","RUNE","ALGO","VET","HBAR","QNT"];

const isCrypto = (sym) => {
  const s = sym.toUpperCase();
  return s.endsWith("USDT")||s.endsWith("BUSD")||s.endsWith("USDC")||CRYPTO_BASES.includes(s);
};

const toBinanceSym = (sym) => {
  const s = sym.toUpperCase();
  if (s.endsWith("USDT")||s.endsWith("BUSD")||s.endsWith("USDC")) return s;
  return `${s}USDT`;
};

const toTVSymbol = (sym) => {
  const s = sym.toUpperCase();
  if (isCrypto(s)) return `BINANCE:${toBinanceSym(s)}`;
  const map = {SPX:"SP:SPX",SP500:"SP:SPX",NDX:"NASDAQ:NDX",NQ:"CME_MINI:NQ1!","NQ1!":"CME_MINI:NQ1!",ES:"CME_MINI:ES1!","ES1!":"CME_MINI:ES1!",DAX:"XETR:DAX",DJI:"DJ:DJI",DOW:"DJ:DJI",VIX:"CBOE:VIX",GC:"COMEX:GC1!","GC1!":"COMEX:GC1!",CL:"NYMEX:CL1!","CL1!":"NYMEX:CL1!",GOLD:"TVC:GOLD",OIL:"TVC:USOIL"};
  return map[s] || s;
};

const fetchPrice = async (sym) => {
  try {
    if (isCrypto(sym)) {
      const r = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${toBinanceSym(sym)}`);
      const d = await r.json();
      return d.price ? parseFloat(d.price) : null;
    } else {
      const r = await fetch(`https://finnhub.io/api/v1/quote?symbol=${sym.toUpperCase()}&token=${FKEY}`);
      const d = await r.json();
      return d.c || null;
    }
  } catch { return null; }
};

const PH = ({title, sub, right}) => (
  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 12px",borderBottom:`1px solid ${T.border2}`,background:"#040f1c",flexShrink:0}}>
    <div style={{display:"flex",alignItems:"center",gap:7}}>
      <div style={{width:3,height:13,background:T.blue,borderRadius:2}}/>
      <span style={{fontFamily:T.mono,fontSize:10,fontWeight:700,color:T.blue,letterSpacing:1.5}}>{title}</span>
      {sub && <span style={{fontSize:9,color:T.muted}}>{sub}</span>}
    </div>
    {right}
  </div>
);

const Blink = ({color}) => {
  const [on, setOn] = useState(true);
  useEffect(()=>{ const t=setInterval(()=>setOn(x=>!x),500); return()=>clearInterval(t); },[]);
  return <span style={{color:on?color:"transparent",fontSize:8}}>●</span>;
};

const EMPTY = {symbol:"",direction:"Long",entryPrice:"",quantity:"",stopLoss:"",takeProfit:"",strategy:"",notes:""};

export default function App() {
  const [positions, setPositions] = useState([]);
  const [history, setHistory] = useState([]);
  const [prices, setPrices] = useState({});
  const [flash, setFlash] = useState({});
  const [selected, setSelected] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [tab, setTab] = useState("live");
  const [time, setTime] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [fetchingPrice, setFetchingPrice] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);
  const prevPrices = useRef({});

  useEffect(()=>{ const t=setInterval(()=>setTime(new Date()),1000); return()=>clearInterval(t); },[]);

  useEffect(()=>{
    (async()=>{
      try {
        const p = await store.get("rt_pos"); if(p) setPositions(JSON.parse(p.value));
        const h = await store.get("rt_hist"); if(h) setHistory(JSON.parse(h.value));
      } catch(_){}
      setLoading(false);
    })();
  },[]);

  const savePos = useCallback(async(p)=>{ setPositions(p); try{await store.set("rt_pos",JSON.stringify(p));}catch(_){} },[]);
  const saveHist = useCallback(async(h)=>{ setHistory(h); try{await store.set("rt_hist",JSON.stringify(h));}catch(_){} },[]);

  useEffect(()=>{
    if (!positions.length) return;
    const symbols = [...new Set(positions.map(p=>p.symbol))];
    const update = async () => {
      for (const sym of symbols) {
        const price = await fetchPrice(sym);
        if (price != null) {
          setPrices(prev=>{
            const old = prevPrices.current[sym];
            if (old && price !== old) {
              const dir = price > old ? "up" : "down";
              setFlash(f=>({...f,[sym]:dir}));
              setTimeout(()=>setFlash(f=>({...f,[sym]:null})),800);
            }
            prevPrices.current[sym] = price;
            return {...prev,[sym]:price};
          });
        }
        await new Promise(r=>setTimeout(r,250));
      }
      setLastUpdate(new Date());
    };
    update();
    const iv = setInterval(update, 5000);
    return ()=>clearInterval(iv);
  },[positions]);

  const livePos = useMemo(()=>positions.map(p=>{
    const price = prices[p.symbol];
    if (!price) return {...p,currentPrice:null,pnl:null,pnlPct:null,value:null};
    const dir = p.direction==="Long" ? 1 : -1;
    const pnl = (price-p.entryPrice)*p.quantity*dir;
    const pnlPct = (price-p.entryPrice)/p.entryPrice*100*dir;
    return {...p,currentPrice:price,pnl,pnlPct,value:price*p.quantity};
  }),[positions,prices]);

  const totalPnl = useMemo(()=>livePos.reduce((a,b)=>a+(b.pnl||0),0),[livePos]);
  const totalCap = useMemo(()=>positions.reduce((a,b)=>a+(b.entryPrice*b.quantity||0),0),[positions]);
  const totalPct = totalCap>0 ? totalPnl/totalCap*100 : 0;

  const selPos = livePos.find(p=>p.id===selected) || livePos[0] || null;
  const tvSym = selPos ? toTVSymbol(selPos.symbol) : "BINANCE:BTCUSDT";
  const tvUrl = `https://www.tradingview.com/widgetembed/?frameElementId=tv_chart&symbol=${encodeURIComponent(tvSym)}&interval=15&theme=dark&style=1&locale=es&toolbar_bg=%23040f1c&hide_side_toolbar=0&allow_symbol_change=1&withdateranges=1&hideideas=1&saveimage=0`;

  const autoFetchEntry = async () => {
    if (!form.symbol) return;
    setFetchingPrice(true);
    const price = await fetchPrice(form.symbol);
    if (price) setForm(f=>({...f,entryPrice:String(price)}));
    setFetchingPrice(false);
  };

  const addPosition = () => {
    const entry = pn(form.entryPrice), qty = pn(form.quantity);
    if (!form.symbol||!entry||!qty) return alert("Símbolo, precio y cantidad son obligatorios.");
    const pos = {
      id:Date.now(), symbol:form.symbol.toUpperCase(), direction:form.direction,
      entryPrice:entry, quantity:qty, stopLoss:pn(form.stopLoss), takeProfit:pn(form.takeProfit),
      strategy:form.strategy, notes:form.notes, openDate:new Date().toISOString(),
    };
    const np = [...positions, pos];
    savePos(np);
    setSelected(pos.id);
    setForm(EMPTY);
    setShowForm(false);
  };

  const closePosition = async (pos) => {
    const price = prices[pos.symbol];
    if (!price) return alert(`Sin precio en vivo para ${pos.symbol}. Esperá unos segundos.`);
    if (!window.confirm(`Cerrar ${pos.symbol} a $${fmt(price)}?`)) return;
    const dir = pos.direction==="Long" ? 1 : -1;
    const finalPnl = (price-pos.entryPrice)*pos.quantity*dir;
    const finalPnlPct = (price-pos.entryPrice)/pos.entryPrice*100*dir;
    const closed = {...pos, exitPrice:price, closeDate:new Date().toISOString(), finalPnl, finalPnlPct};
    const nh = [closed, ...history];
    const np = positions.filter(p=>p.id!==pos.id);
    savePos(np);
    saveHist(nh);
    if (selected===pos.id) setSelected(np[0]?.id||null);
  };

  const deletePosition = (id) => {
    if (!window.confirm("¿Eliminar posición?")) return;
    const np = positions.filter(p=>p.id!==id);
    savePos(np);
    if (selected===id) setSelected(np[0]?.id||null);
  };

  const setF = k => v => setForm(f=>({...f,[k]:v}));

  if (loading) return (
    <div style={{background:T.bg,height:"100vh",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:T.mono,color:T.blue,letterSpacing:3}}>
      INICIALIZANDO TERMINAL...
    </div>
  );

  return (
    <div style={{background:T.bg,height:"100vh",color:T.text,fontFamily:T.mono,display:"flex",flexDirection:"column",fontSize:12,overflow:"hidden"}}>

      {/* TOP BAR */}
      <div style={{background:"#020a14",borderBottom:`2px solid ${T.blue}`,display:"flex",alignItems:"stretch",height:40,flexShrink:0}}>
        <div style={{background:T.blue2,padding:"0 16px",display:"flex",alignItems:"center",gap:8,borderRight:`2px solid ${T.blue}`,flexShrink:0}}>
          <Blink color={T.green}/>
          <span style={{fontWeight:900,fontSize:13,letterSpacing:3,color:"#fff"}}>TERMINAL</span>
          <span style={{fontSize:9,color:"rgba(255,255,255,0.6)",letterSpacing:1}}>LIVE</span>
        </div>
        <div style={{display:"flex",alignItems:"center",flex:1,overflowX:"auto"}}>
          {[
            ["PORTAFOLIO P&L", `${sign(totalPnl)}$${fmt(totalPnl)}`, totalPnl],
            ["RENDIMIENTO", fmtPct(totalPct), totalPct],
            ["POSICIONES ABIERTAS", positions.length, null],
            ["CAPITAL EXPUESTO", `$${fmt(totalCap)}`, null],
          ].map(([lbl,val,pos])=>(
            <div key={lbl} style={{display:"flex",alignItems:"center",gap:5,padding:"0 16px",borderRight:`1px solid ${T.border}`,height:"100%",flexShrink:0}}>
              <span style={{fontSize:9,color:T.muted,letterSpacing:1}}>{lbl}</span>
              <span style={{fontSize:12,color:pos==null?T.text:pos>=0?T.green:T.red,fontWeight:700}}>{val}</span>
            </div>
          ))}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8,padding:"0 12px",borderLeft:`1px solid ${T.border}`,flexShrink:0}}>
          {lastUpdate && <span style={{fontSize:9,color:T.muted}}>UPD {lastUpdate.toLocaleTimeString("es-AR")}</span>}
          <span style={{fontSize:9,color:T.muted}}>{time.toLocaleTimeString("es-AR")}</span>
          <button onClick={()=>{ setShowForm(s=>!s); setTab("live"); }}
            style={{background:T.greenDim,border:`1px solid ${T.green}`,color:T.green,borderRadius:3,padding:"4px 12px",cursor:"pointer",fontFamily:T.mono,fontSize:9,fontWeight:700,letterSpacing:1}}>
            + POSICIÓN
          </button>
        </div>
      </div>

      {/* NAV */}
      <div style={{background:"#030e1c",borderBottom:`1px solid ${T.border}`,display:"flex",flexShrink:0}}>
        {[["live","📡 EN VIVO"],["history","📋 HISTORIAL"]].map(([k,l])=>(
          <button key={k} onClick={()=>setTab(k)}
            style={{background:tab===k?T.panel:"transparent",border:"none",borderBottom:tab===k?`2px solid ${T.blue}`:"2px solid transparent",color:tab===k?T.blue:T.muted,padding:"7px 18px",cursor:"pointer",fontFamily:T.mono,fontSize:10,fontWeight:700,letterSpacing:1.2}}>
            {l}
          </button>
        ))}
      </div>

      {/* MAIN */}
      <div style={{flex:1,display:"flex",overflow:"hidden"}}>

        {/* LEFT PANEL */}
        <div style={{width:360,flexShrink:0,display:"flex",flexDirection:"column",borderRight:`1px solid ${T.border}`,overflow:"hidden"}}>

          {/* Form */}
          {showForm && tab==="live" && (
            <div style={{background:T.panel,borderBottom:`1px solid ${T.blue}`,padding:12,flexShrink:0}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                <span style={{fontSize:10,color:T.blue,fontWeight:700,letterSpacing:1}}>NUEVA POSICIÓN</span>
                <button onClick={()=>setShowForm(false)} style={{background:"transparent",border:"none",color:T.muted,cursor:"pointer",fontSize:16}}>×</button>
              </div>
              <div style={{display:"flex",gap:6,marginBottom:8}}>
                <div style={{flex:1}}>
                  <div style={{fontSize:9,color:T.muted,marginBottom:3}}>SÍMBOLO</div>
                  <input value={form.symbol} onChange={e=>setF("symbol")(e.target.value.toUpperCase())}
                    placeholder="BTCUSDT, AAPL, NQ1!..."
                    style={{width:"100%",background:T.bg2,border:`1px solid ${T.border}`,color:T.text,borderRadius:3,padding:"5px 8px",fontFamily:T.mono,fontSize:11}}/>
                </div>
                <div>
                  <div style={{fontSize:9,color:T.muted,marginBottom:3}}>TIPO</div>
                  <select value={form.direction} onChange={e=>setF("direction")(e.target.value)}
                    style={{background:T.bg2,border:`1px solid ${T.border}`,color:form.direction==="Long"?T.green:T.red,borderRadius:3,padding:"5px 8px",fontFamily:T.mono,fontSize:11,fontWeight:700}}>
                    <option>Long</option>
                    <option>Short</option>
                  </select>
                </div>
              </div>
              <div style={{display:"flex",gap:6,marginBottom:8}}>
                <div style={{flex:1}}>
                  <div style={{fontSize:9,color:T.muted,marginBottom:3}}>PRECIO ENTRADA</div>
                  <input type="number" value={form.entryPrice} onChange={e=>setF("entryPrice")(e.target.value)}
                    placeholder="0.00"
                    style={{width:"100%",background:T.bg2,border:`1px solid ${T.border}`,color:T.text,borderRadius:3,padding:"5px 8px",fontFamily:T.mono,fontSize:11}}/>
                </div>
                <div style={{alignSelf:"flex-end"}}>
                  <button onClick={autoFetchEntry} disabled={!form.symbol||fetchingPrice}
                    style={{background:T.blueDim,border:`1px solid ${T.blue}`,color:T.blue,borderRadius:3,padding:"5px 10px",cursor:"pointer",fontFamily:T.mono,fontSize:9,fontWeight:700,height:29}}>
                    {fetchingPrice?"...":"LIVE ↓"}
                  </button>
                </div>
              </div>
              <div style={{marginBottom:8}}>
                <div style={{fontSize:9,color:T.muted,marginBottom:3}}>CANTIDAD</div>
                <input type="number" value={form.quantity} onChange={e=>setF("quantity")(e.target.value)}
                  placeholder="0.00"
                  style={{width:"100%",background:T.bg2,border:`1px solid ${T.border}`,color:T.text,borderRadius:3,padding:"5px 8px",fontFamily:T.mono,fontSize:11}}/>
              </div>
              <div style={{display:"flex",gap:6,marginBottom:8}}>
                <div style={{flex:1}}>
                  <div style={{fontSize:9,color:T.red,marginBottom:3}}>STOP LOSS</div>
                  <input type="number" value={form.stopLoss} onChange={e=>setF("stopLoss")(e.target.value)}
                    placeholder="Opcional"
                    style={{width:"100%",background:T.bg2,border:`1px solid ${T.border}`,color:T.text,borderRadius:3,padding:"5px 8px",fontFamily:T.mono,fontSize:11}}/>
                </div>
                <div style={{flex:1}}>
                  <div style={{fontSize:9,color:T.green,marginBottom:3}}>TAKE PROFIT</div>
                  <input type="number" value={form.takeProfit} onChange={e=>setF("takeProfit")(e.target.value)}
                    placeholder="Opcional"
                    style={{width:"100%",background:T.bg2,border:`1px solid ${T.border}`,color:T.text,borderRadius:3,padding:"5px 8px",fontFamily:T.mono,fontSize:11}}/>
                </div>
              </div>
              <div style={{marginBottom:10}}>
                <div style={{fontSize:9,color:T.muted,marginBottom:3}}>ESTRATEGIA</div>
                <input value={form.strategy} onChange={e=>setF("strategy")(e.target.value)}
                  placeholder="Opcional"
                  style={{width:"100%",background:T.bg2,border:`1px solid ${T.border}`,color:T.text,borderRadius:3,padding:"5px 8px",fontFamily:T.mono,fontSize:11}}/>
              </div>
              <button onClick={addPosition}
                style={{width:"100%",background:T.green,border:"none",color:"#000",borderRadius:3,padding:"8px",cursor:"pointer",fontFamily:T.mono,fontSize:12,fontWeight:900,letterSpacing:1}}>
                ABRIR POSICIÓN ↗
              </button>
            </div>
          )}

          {/* Live positions */}
          {tab==="live" && (
            <div style={{flex:1,overflow:"auto"}}>
              <PH title="POSICIONES ABIERTAS" sub={`${positions.length} activas`}
                right={positions.length>0 && <span style={{fontSize:9,color:T.green}}><Blink color={T.green}/> LIVE</span>}
              />
              {livePos.length===0 ? (
                <div style={{padding:"40px 20px",textAlign:"center",color:T.muted}}>
                  <div style={{fontSize:24,marginBottom:10}}>📡</div>
                  <div style={{fontSize:11,marginBottom:6}}>SIN POSICIONES ABIERTAS</div>
                  <div style={{fontSize:9}}>USÁ "+ POSICIÓN" PARA EMPEZAR</div>
                </div>
              ) : livePos.map(p=>{
                const isSel = selected===p.id || (!selected && livePos[0]?.id===p.id);
                const flashColor = flash[p.symbol]==="up"?T.green:flash[p.symbol]==="down"?T.red:null;
                const pnlColor = p.pnl==null?T.muted:p.pnl>=0?T.green:T.red;
                const slDist = p.stopLoss&&p.currentPrice ? ((p.currentPrice-p.stopLoss)/p.currentPrice*100) : null;
                const tpDist = p.takeProfit&&p.currentPrice ? ((p.takeProfit-p.currentPrice)/p.currentPrice*100) : null;
                return (
                  <div key={p.id} onClick={()=>setSelected(p.id)}
                    style={{padding:"10px 12px",borderBottom:`1px solid ${T.border2}`,cursor:"pointer",background:isSel?T.panel2:"transparent",borderLeft:isSel?`3px solid ${T.blue}`:"3px solid transparent",transition:"all .15s"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                      <div style={{display:"flex",alignItems:"center",gap:6}}>
                        <span style={{color:T.cyan,fontWeight:700,fontSize:13}}>{p.symbol}</span>
                        <span style={{background:p.direction==="Long"?T.greenDim:T.redDim,color:p.direction==="Long"?T.green:T.red,borderRadius:2,padding:"1px 5px",fontSize:9,fontWeight:700}}>{p.direction.toUpperCase()}</span>
                        {p.strategy && <span style={{color:T.yellow,fontSize:9}}>{p.strategy}</span>}
                      </div>
                      <span style={{fontSize:13,fontWeight:700,color:flashColor||T.text,transition:"color .3s"}}>
                        {p.currentPrice ? `$${fmt(p.currentPrice)}` : <span style={{color:T.muted,fontSize:10}}>...</span>}
                      </span>
                    </div>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                      <span style={{fontSize:9,color:T.muted}}>ENT: ${fmt(p.entryPrice)} · QTY: {fmt(p.quantity,4)}</span>
                      {p.pnl!=null ? (
                        <span style={{background:p.pnl>=0?T.greenDim:T.redDim,color:pnlColor,borderRadius:3,padding:"2px 7px",fontSize:11,fontWeight:700}}>
                          {sign(p.pnl)}${fmt(p.pnl)} ({fmtPct(p.pnlPct)})
                        </span>
                      ) : <span style={{color:T.muted,fontSize:10}}>calculando...</span>}
                    </div>
                    {(p.stopLoss||p.takeProfit)&&p.currentPrice && (
                      <div style={{marginBottom:6,fontSize:9}}>
                        {p.stopLoss && <span style={{color:T.red,marginRight:8}}>SL ${fmt(p.stopLoss)} <span style={{color:T.muted}}>({slDist!=null?`${slDist.toFixed(1)}%`:"—"})</span></span>}
                        {p.takeProfit && <span style={{color:T.green}}>TP ${fmt(p.takeProfit)} <span style={{color:T.muted}}>({tpDist!=null?`+${tpDist.toFixed(1)}%`:"—"})</span></span>}
                      </div>
                    )}
                    <div style={{display:"flex",gap:6}}>
                      <button onClick={e=>{e.stopPropagation();closePosition(p);}}
                        style={{flex:1,background:T.greenDim,border:`1px solid ${T.green}`,color:T.green,borderRadius:3,padding:"4px",cursor:"pointer",fontFamily:T.mono,fontSize:9,fontWeight:700}}>
                        CERRAR ✓
                      </button>
                      <button onClick={e=>{e.stopPropagation();deletePosition(p.id);}}
                        style={{background:T.redDim,border:`1px solid ${T.red}`,color:T.red,borderRadius:3,padding:"4px 8px",cursor:"pointer",fontFamily:T.mono,fontSize:9}}>
                        ✕
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* History */}
          {tab==="history" && (
            <div style={{flex:1,overflow:"auto"}}>
              <PH title="OPERACIONES CERRADAS" sub={`${history.length} trades`}
                right={history.length>0 && <button onClick={()=>{if(window.confirm("¿Limpiar historial?"))saveHist([]);}} style={{background:"transparent",border:`1px solid ${T.red}`,color:T.red,borderRadius:3,padding:"2px 8px",cursor:"pointer",fontFamily:T.mono,fontSize:9}}>LIMPIAR</button>}
              />
              {history.length===0 ? (
                <div style={{padding:"40px 20px",textAlign:"center",color:T.muted,fontSize:11}}>SIN TRADES CERRADOS AÚN</div>
              ) : history.map((t,i)=>(
                <div key={t.id} style={{padding:"10px 12px",borderBottom:`1px solid ${T.border2}`,background:i%2===0?"transparent":"#ffffff03"}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                    <span style={{color:T.cyan,fontWeight:700}}>{t.symbol}</span>
                    <span style={{background:t.finalPnl>=0?T.greenDim:T.redDim,color:t.finalPnl>=0?T.green:T.red,borderRadius:3,padding:"1px 6px",fontSize:10,fontWeight:700}}>
                      {sign(t.finalPnl)}${fmt(t.finalPnl)} ({fmtPct(t.finalPnlPct)})
                    </span>
                  </div>
                  <div style={{fontSize:9,color:T.muted}}>{t.direction} · ENT ${fmt(t.entryPrice)} → SAL ${fmt(t.exitPrice)} · {t.strategy||"—"}</div>
                  <div style={{fontSize:9,color:T.muted,marginTop:2}}>{t.closeDate ? new Date(t.closeDate).toLocaleString("es-AR") : "—"}</div>
                </div>
              ))}
              {history.length>0 && (
                <div style={{padding:12,borderTop:`1px solid ${T.border}`,background:T.panel}}>
                  {[
                    ["P&L TOTAL", history.reduce((a,b)=>a+(b.finalPnl||0),0), true],
                    ["WIN RATE", history.length ? history.filter(t=>t.finalPnl>0).length/history.length*100 : 0, false],
                    ["TRADES", history.length, null],
                  ].map(([lbl,val,isPnl])=>(
                    <div key={lbl} style={{display:"flex",justifyContent:"space-between",padding:"3px 0",fontSize:10}}>
                      <span style={{color:T.muted}}>{lbl}</span>
                      <span style={{fontWeight:700,color:isPnl==null?T.text:isPnl?val>=0?T.green:T.red:val>=50?T.green:T.yellow}}>
                        {isPnl==null?val:isPnl?`${sign(val)}$${fmt(val)}`:`${fmt(val,1)}%`}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* RIGHT: TradingView */}
        <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
          <PH
            title={selPos?`GRÁFICO — ${selPos.symbol}`:"GRÁFICO"}
            sub={selPos?`${selPos.direction} · ENT $${fmt(selPos.entryPrice)}`:""}
            right={selPos&&selPos.pnl!=null && (
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:11,color:selPos.pnl>=0?T.green:T.red,fontWeight:700}}>
                  {sign(selPos.pnl)}${fmt(selPos.pnl)} ({fmtPct(selPos.pnlPct)})
                </span>
                <span style={{fontSize:10,color:T.cyan,fontWeight:700}}>PRECIO: ${fmt(selPos.currentPrice)}</span>
              </div>
            )}
          />
          {selPos ? (
            <iframe
              key={tvSym}
              src={tvUrl}
              style={{flex:1,border:"none",background:T.bg}}
              allow="clipboard-write"
            />
          ) : (
            <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",color:T.muted,flexDirection:"column",gap:10}}>
              <div style={{fontSize:30}}>📊</div>
              <div style={{fontSize:11,letterSpacing:2}}>AGREGÁ UNA POSICIÓN PARA VER EL GRÁFICO</div>
            </div>
          )}
        </div>
      </div>

      {/* STATUS BAR */}
      <div style={{background:"#020a14",borderTop:`1px solid ${T.border}`,padding:"3px 14px",display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0}}>
        <div style={{display:"flex",gap:16}}>
          <span style={{color:T.muted,fontSize:9}}>ABIERTAS: <span style={{color:T.cyan}}>{positions.length}</span></span>
          <span style={{color:T.muted,fontSize:9}}>CERRADAS: <span style={{color:T.text}}>{history.length}</span></span>
          <span style={{color:T.muted,fontSize:9}}>P&L: <span style={{color:totalPnl>=0?T.green:T.red,fontWeight:700}}>{sign(totalPnl)}${fmt(totalPnl)}</span></span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          <span style={{fontSize:9,color:T.muted}}>FINNHUB + BINANCE</span>
          <span style={{color:T.green,fontSize:9,fontWeight:700}}><Blink color={T.green}/> CONECTADO</span>
        </div>
      </div>
    </div>
  );
}
