import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";

const FKEY = "d6i7s89r01ql9cif9b10d6i7s89r01ql9cif9b1g";

// ─── Storage ──────────────────────────────────────────────────────────────────
const store = {
  get: async (k) => { const v = localStorage.getItem(k); return v ? { value: v } : null; },
  set: async (k, v) => { localStorage.setItem(k, String(v)); },
};

// ─── Theme: Dark Navy Blue ────────────────────────────────────────────────────
const T = {
  bg:"#060d1a", bg2:"#0a1628", panel:"#0d1f35", panel2:"#0f2440",
  border:"#1a3a5c", border2:"#0e2540",
  orange:"#00b0ff", orange2:"#0091ea", orangeDim:"#001c30",
  green:"#00e676", greenDim:"#002d12",
  red:"#ff3d57", redDim:"#2d0010",
  amber:"#ffd600", amberDim:"#2a2000",
  text:"#dff0fd", muted:"#4a7fa5", muted2:"#1e3a50",
  mono:"'Courier New',monospace",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt  = (n,d=2) => n==null||isNaN(n)?"—":Number(n).toLocaleString("es-AR",{minimumFractionDigits:d,maximumFractionDigits:d});
const fmtK = (n) => Math.abs(n)>=1e6?`${(n/1e6).toFixed(2)}M`:Math.abs(n)>=1e3?`${(n/1e3).toFixed(1)}K`:fmt(n);
const fmtP = (n) => n==null||isNaN(n)?"—":`${n>=0?"+":""}${Math.abs(n).toFixed(2)}%`;
const sign = (n) => n>0?"+":"";
const pn   = (v) => { const n=parseFloat(String(v||"").replace(/[^\d.\-]/g,"")); return isNaN(n)?null:n; };

// ─── Crypto detection ─────────────────────────────────────────────────────────
const CRYPTOS = new Set(["BTC","ETH","BNB","SOL","XRP","ADA","DOGE","MATIC","LINK","AVAX","DOT","LTC","XLM","UNI","ATOM","ETC","TRX","FIL","NEAR","APT","ARB","OP","INJ","SUI","TIA","PEPE","WIF","BONK","SHIB","TON","FET","RNDR","STX","RUNE","ALGO","VET","HBAR","QNT"]);
const isCrypto = (s) => { const u=s.toUpperCase(); return u.endsWith("USDT")||u.endsWith("BUSD")||u.endsWith("USDC")||CRYPTOS.has(u); };
const toBin    = (s) => { const u=s.toUpperCase(); return (u.endsWith("USDT")||u.endsWith("BUSD")||u.endsWith("USDC"))?u:`${u}USDT`; };
const toTV     = (s) => {
  const u=s.toUpperCase();
  if(isCrypto(u)) return `BINANCE:${toBin(u)}`;
  const m={"NQ1!":"CME_MINI:NQ1!","ES1!":"CME_MINI:ES1!","NQ":"CME_MINI:NQ1!","ES":"CME_MINI:ES1!","DAX":"XETR:DAX","SPX":"SP:SPX","SP500":"SP:SPX","NDX":"NASDAQ:NDX","GC1!":"COMEX:GC1!","GC":"COMEX:GC1!","CL1!":"NYMEX:CL1!","CL":"NYMEX:CL1!","GOLD":"TVC:GOLD","OIL":"TVC:USOIL","VIX":"CBOE:VIX","DXY":"TVC:DXY","EURUSD":"FX:EURUSD","GBPUSD":"FX:GBPUSD"};
  return m[u]||u;
};

// ─── Price fetch ──────────────────────────────────────────────────────────────
const fetchPrice = async (sym) => {
  const u = sym.toUpperCase();
  try {
    if (isCrypto(u)) {
      const ctrl = new AbortController();
      const tid = setTimeout(()=>ctrl.abort(),5000);
      const r = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${toBin(u)}`,{signal:ctrl.signal});
      clearTimeout(tid);
      const d = await r.json();
      return d.lastPrice ? { price:parseFloat(d.lastPrice), change:parseFloat(d.priceChangePercent), volume:parseFloat(d.quoteVolume), high:parseFloat(d.highPrice), low:parseFloat(d.lowPrice) } : null;
    } else {
      const ctrl = new AbortController();
      const tid = setTimeout(()=>ctrl.abort(),6000);
      const r = await fetch(`https://finnhub.io/api/v1/quote?symbol=${u}&token=${FKEY}`,{signal:ctrl.signal});
      clearTimeout(tid);
      const d = await r.json();
      if (!d.c) return null;
      return { price:d.c, change:d.dp||0, high:d.h, low:d.l, prevClose:d.pc };
    }
  } catch { return null; }
};

// ─── Sparkline ────────────────────────────────────────────────────────────────
const Sparkline = ({data, color, width=80, height=28}) => {
  if (!data||data.length<2) return <span style={{color:T.muted,fontSize:9}}>—</span>;
  const mn=Math.min(...data), mx=Math.max(...data), rng=mx-mn||1;
  const pts = data.map((v,i)=>`${(i/(data.length-1))*width},${height-((v-mn)/rng)*height}`).join(" ");
  return <svg width={width} height={height} style={{display:"block"}}><polyline points={pts} fill="none" stroke={color} strokeWidth={1.5}/></svg>;
};

// ─── Alert badge ──────────────────────────────────────────────────────────────
const AlertBadge = ({msg}) => (
  <div style={{position:"fixed",top:50,right:16,background:T.orangeDim,border:`2px solid ${T.orange}`,color:T.orange,borderRadius:4,padding:"10px 16px",fontFamily:T.mono,fontSize:11,fontWeight:700,zIndex:999,letterSpacing:1}}>
    ⚠ {msg}
  </div>
);

// ─── Panel header ─────────────────────────────────────────────────────────────
const PH = ({title,sub,right}) => (
  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"5px 12px",borderBottom:`1px solid ${T.border2}`,background:"#040f1c",flexShrink:0}}>
    <div style={{display:"flex",alignItems:"center",gap:7}}>
      <div style={{width:3,height:12,background:T.orange,borderRadius:1}}/>
      <span style={{fontFamily:T.mono,fontSize:10,fontWeight:700,color:T.orange,letterSpacing:2}}>{title}</span>
      {sub&&<span style={{fontSize:9,color:T.muted}}>{sub}</span>}
    </div>
    {right}
  </div>
);

// ─── Blink dot ────────────────────────────────────────────────────────────────
const Blink = ({color}) => {
  const [on,setOn]=useState(true);
  useEffect(()=>{const t=setInterval(()=>setOn(x=>!x),600);return()=>clearInterval(t);},[]);
  return <span style={{color:on?color:"transparent",fontSize:8,transition:"color 0.1s"}}>●</span>;
};

// ─── Metric row ───────────────────────────────────────────────────────────────
const MRow = ({label,value,color}) => (
  <div style={{display:"flex",justifyContent:"space-between",padding:"3px 12px",borderBottom:`1px solid ${T.border2}`}}>
    <span style={{fontSize:10,color:T.muted,fontFamily:T.mono}}>{label}</span>
    <span style={{fontSize:10,color:color||T.text,fontFamily:T.mono,fontWeight:700}}>{value}</span>
  </div>
);

const EMPTY = {symbol:"",direction:"Long",capital:"",entryPrice:"",quantity:"",stopLoss:"",takeProfit:"",strategy:"",notes:""};
const MONTHS = ["ENE","FEB","MAR","ABR","MAY","JUN","JUL","AGO","SEP","OCT","NOV","DIC"];
const DAYS   = ["DOM","LUN","MAR","MIE","JUE","VIE","SAB"];
const PIE_COLORS = ["#00e676","#ff3d57","#00b0ff","#ffd600","#e040fb","#ff6d00"];

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [positions, setPositions] = useState([]);
  const [history,   setHistory]   = useState([]);
  const [priceData, setPriceData] = useState({});
  const [priceHist, setPriceHist] = useState({});
  const [flash,     setFlash]     = useState({});
  const [selected,  setSelected]  = useState(null);
  const [showForm,  setShowForm]  = useState(false);
  const [form,      setForm]      = useState(EMPTY);
  const [tab,       setTab]       = useState("live");
  const [time,      setTime]      = useState(new Date());
  const [loading,   setLoading]   = useState(true);
  const [fetchingP, setFetchingP] = useState(false);
  const [lastUpd,   setLastUpd]   = useState(null);
  const [alerts,    setAlerts]    = useState([]);
  const [histTab,   setHistTab]   = useState("weekly");
  const alertedRef = useRef(new Set());
  const prevRef    = useRef({});

  useEffect(()=>{const t=setInterval(()=>setTime(new Date()),1000);return()=>clearInterval(t);},[]);

  useEffect(()=>{
    (async()=>{
      try {
        const p=await store.get("bbg_pos");  if(p) setPositions(JSON.parse(p.value));
        const h=await store.get("bbg_hist"); if(h) setHistory(JSON.parse(h.value));
      } catch(_){}
      setLoading(false);
    })();
  },[]);

  const savePos  = useCallback(async(p)=>{ setPositions(p);  try{await store.set("bbg_pos", JSON.stringify(p));}catch(_){} },[]);
  const saveHist = useCallback(async(h)=>{ setHistory(h);    try{await store.set("bbg_hist",JSON.stringify(h));}catch(_){} },[]);

  // ── Price polling ──────────────────────────────────────────────────────────
  useEffect(()=>{
    if (!positions.length) return;
    const syms = [...new Set(positions.map(p=>p.symbol))];
    const poll = async () => {
      for (const sym of syms) {
        const d = await fetchPrice(sym);
        if (!d) continue;
        const price = d.price;
        const old = prevRef.current[sym];
        if (old && price!==old) {
          const dir = price>old?"up":"down";
          setFlash(f=>({...f,[sym]:dir}));
          setTimeout(()=>setFlash(f=>({...f,[sym]:null})),1000);
        }
        prevRef.current[sym] = price;
        setPriceData(prev=>({...prev,[sym]:d}));
        setPriceHist(prev=>({...prev,[sym]:[...(prev[sym]||[]),price].slice(-30)}));
        await new Promise(r=>setTimeout(r,300));
      }
      setLastUpd(new Date());
    };
    poll();
    const iv = setInterval(poll, 5000);
    return ()=>clearInterval(iv);
  },[positions]);

  // ── SL / TP alerts ────────────────────────────────────────────────────────
  useEffect(()=>{
    positions.forEach(p=>{
      const price = priceData[p.symbol]?.price;
      if (!price) return;
      const dir = p.direction==="Long"?1:-1;
      const pushAlert = (key, msg) => {
        if (alertedRef.current.has(key)) return;
        alertedRef.current.add(key);
        setAlerts(a=>[...a,{id:Date.now(),msg}]);
        setTimeout(()=>setAlerts(a=>a.slice(1)),5000);
      };
      if (p.stopLoss) {
        if (dir===1&&price<=p.stopLoss)  pushAlert(`sl_${p.id}`,`🔴 STOP LOSS — ${p.symbol} @ $${fmt(price)}`);
        if (dir===-1&&price>=p.stopLoss) pushAlert(`sl_${p.id}`,`🔴 STOP LOSS — ${p.symbol} @ $${fmt(price)}`);
      }
      if (p.takeProfit) {
        if (dir===1&&price>=p.takeProfit)  pushAlert(`tp_${p.id}`,`🟢 TAKE PROFIT — ${p.symbol} @ $${fmt(price)}`);
        if (dir===-1&&price<=p.takeProfit) pushAlert(`tp_${p.id}`,`🟢 TAKE PROFIT — ${p.symbol} @ $${fmt(price)}`);
      }
    });
  },[priceData,positions]);

  // ── Live P&L ──────────────────────────────────────────────────────────────
  const livePos = useMemo(()=>positions.map(p=>{
    const d = priceData[p.symbol];
    const price = d?.price;
    if (!price) return {...p,pd:d,currentPrice:null,pnl:null,pnlPct:null,value:null,_qty:null};
    const dir = p.direction==="Long"?1:-1;
    const qty = p.quantity||(p.capital&&p.entryPrice?pn(p.capital)/p.entryPrice:null);
    const pnl = qty?(price-p.entryPrice)*qty*dir:null;
    const pnlPct = p.entryPrice?(price-p.entryPrice)/p.entryPrice*100*dir:null;
    return {...p,pd:d,currentPrice:price,pnl,pnlPct,value:qty?price*qty:null,_qty:qty};
  }),[positions,priceData]);

  const totalPnl = useMemo(()=>livePos.reduce((a,b)=>a+(b.pnl||0),0),[livePos]);
  const totalCap = useMemo(()=>livePos.reduce((a,b)=>a+(b.capital?pn(b.capital):(b.entryPrice*(b._qty||0))),0),[livePos]);
  const totalPct = totalCap>0?totalPnl/totalCap*100:0;
  const totalVal = useMemo(()=>livePos.reduce((a,b)=>a+(b.value||0),0),[livePos]);

  // ── History stats ──────────────────────────────────────────────────────────
  const histStats = useMemo(()=>{
    const closed = history.filter(t=>t.finalPnl!=null);
    const wins = closed.filter(t=>t.finalPnl>0).length;
    const losses = closed.filter(t=>t.finalPnl<=0).length;
    const byDay = Array(7).fill(0).map((_,i)=>({name:DAYS[i],pnl:0,trades:0}));
    const byMonth = Array(12).fill(0).map((_,i)=>({name:MONTHS[i],pnl:0,trades:0}));
    const byStrat = {};
    const byWeek = {};
    closed.forEach(t=>{
      const d=new Date(t.closeDate||t.openDate);
      if(!isNaN(d)){
        byDay[d.getDay()].pnl+=t.finalPnl; byDay[d.getDay()].trades++;
        byMonth[d.getMonth()].pnl+=t.finalPnl; byMonth[d.getMonth()].trades++;
        const day=d.getDay(),diff=d.getDate()-day+(day===0?-6:1);
        const mon=new Date(d); mon.setDate(diff);
        const k=mon.toLocaleDateString("es-AR",{day:"2-digit",month:"2-digit"});
        if(!byWeek[k])byWeek[k]={name:k,pnl:0,trades:0};
        byWeek[k].pnl+=t.finalPnl; byWeek[k].trades++;
      }
      const s=t.strategy||"Sin estrategia";
      if(!byStrat[s])byStrat[s]={pnl:0,trades:0,wins:0};
      byStrat[s].pnl+=t.finalPnl; byStrat[s].trades++;
      if(t.finalPnl>0)byStrat[s].wins++;
    });
    return {
      closed:closed.length, wins, losses,
      winrate:closed.length?wins/closed.length*100:0,
      totalPnl:closed.reduce((a,b)=>a+(b.finalPnl||0),0),
      byDay, byMonth, byStrat, weekArr:Object.values(byWeek).slice(-8),
      winLosePie:[{name:"Ganadas",value:wins},{name:"Perdidas",value:losses}],
    };
  },[history]);

  // ── Chart ─────────────────────────────────────────────────────────────────
  const selPos = livePos.find(p=>p.id===selected)||livePos[0]||null;
  const tvSym  = selPos?toTV(selPos.symbol):"BINANCE:BTCUSDT";
  const tvUrl  = `https://www.tradingview.com/widgetembed/?symbol=${encodeURIComponent(tvSym)}&interval=15&theme=dark&style=1&locale=es&toolbar_bg=%23040f1c&hide_side_toolbar=0&allow_symbol_change=1&withdateranges=1&hideideas=1`;

  // ── Form ──────────────────────────────────────────────────────────────────
  const setF = k => v => setForm(f=>({...f,[k]:v}));

  const fetchLive = async () => {
    if (!form.symbol.trim()) return;
    setFetchingP(true);
    const d = await fetchPrice(form.symbol.trim());
    if (d) {
      const cap = pn(form.capital);
      setForm(f=>({...f, entryPrice:String(d.price), quantity:cap?String(cap/d.price):""}));
    } else {
      alert(`No se pudo obtener precio para "${form.symbol}". Verificá el símbolo.`);
    }
    setFetchingP(false);
  };

  const addPosition = () => {
    const entry = pn(form.entryPrice);
    const cap   = pn(form.capital);
    const qty   = pn(form.quantity)||(cap&&entry?cap/entry:null);
    if (!form.symbol.trim()||!entry||!qty) return alert("Símbolo, precio y capital (o cantidad) son obligatorios.");
    const pos = {
      id:Date.now(), symbol:form.symbol.toUpperCase().trim(),
      direction:form.direction, capital:cap, entryPrice:entry, quantity:qty,
      stopLoss:pn(form.stopLoss), takeProfit:pn(form.takeProfit),
      strategy:form.strategy, notes:form.notes, openDate:new Date().toISOString(),
    };
    savePos([...positions,pos]);
    setSelected(pos.id);
    setForm(EMPTY);
    setShowForm(false);
  };

  const closePosition = async (pos) => {
    const d = priceData[pos.symbol];
    if (!d?.price) return alert(`Sin precio para ${pos.symbol}. Esperá unos segundos.`);
    if (!window.confirm(`Cerrar ${pos.symbol} a $${fmt(d.price)}?`)) return;
    const dir = pos.direction==="Long"?1:-1;
    const qty = pos.quantity||(pos.capital&&pos.entryPrice?pn(pos.capital)/pos.entryPrice:0);
    const finalPnl    = (d.price-pos.entryPrice)*qty*dir;
    const finalPnlPct = (d.price-pos.entryPrice)/pos.entryPrice*100*dir;
    savePos(positions.filter(p=>p.id!==pos.id));
    saveHist([{...pos,exitPrice:d.price,closeDate:new Date().toISOString(),finalPnl,finalPnlPct},...history]);
    if (selected===pos.id) setSelected(null);
  };

  const deletePos = (id) => {
    if (!window.confirm("¿Eliminar posición?")) return;
    savePos(positions.filter(p=>p.id!==id));
    if (selected===id) setSelected(null);
  };

  if (loading) return (
    <div style={{background:T.bg,height:"100vh",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:T.mono,color:T.orange,letterSpacing:4,fontSize:13,fontWeight:700}}>
      INICIALIZANDO TERMINAL...
    </div>
  );

  return (
    <div style={{background:T.bg,height:"100vh",color:T.text,fontFamily:T.mono,display:"flex",flexDirection:"column",fontSize:12,overflow:"hidden"}}>

      {/* ALERTS */}
      {alerts.map(a=><AlertBadge key={a.id} msg={a.msg}/>)}

      {/* TOP BAR */}
      <div style={{background:"#020a14",borderBottom:`2px solid ${T.orange}`,display:"flex",alignItems:"stretch",height:42,flexShrink:0}}>
        <div style={{background:T.orange2,padding:"0 16px",display:"flex",alignItems:"center",gap:8,borderRight:`2px solid ${T.orange}`,flexShrink:0,minWidth:160}}>
          <Blink color="#fff"/>
          <span style={{fontWeight:900,fontSize:14,letterSpacing:3,color:"#fff"}}>TERMINAL</span>
        </div>
        <div style={{display:"flex",alignItems:"center",flex:1,overflowX:"auto"}}>
          {[
            ["PORTAFOLIO P&L",`${sign(totalPnl)}$${fmt(totalPnl)}`,totalPnl],
            ["RENDIMIENTO",fmtP(totalPct),totalPct],
            ["VALOR TOTAL",`$${fmt(totalVal)}`,null],
            ["CAPITAL",`$${fmt(totalCap)}`,null],
            ["POSICIONES",`${positions.length}`,null],
          ].map(([lbl,val,pos])=>(
            <div key={lbl} style={{display:"flex",alignItems:"center",gap:5,padding:"0 16px",borderRight:`1px solid ${T.border}`,height:"100%",flexShrink:0}}>
              <span style={{fontSize:9,color:T.muted,letterSpacing:1}}>{lbl}</span>
              <span style={{fontSize:12,color:pos==null?T.text:pos>=0?T.green:T.red,fontWeight:700}}>{val}</span>
            </div>
          ))}
          {livePos.slice(0,4).map(p=>(
            <div key={p.id} style={{display:"flex",alignItems:"center",gap:5,padding:"0 14px",borderRight:`1px solid ${T.border}`,height:"100%",flexShrink:0}}>
              <span style={{fontSize:9,color:T.orange,fontWeight:700}}>{p.symbol}</span>
              <span style={{fontSize:11,color:flash[p.symbol]==="up"?T.green:flash[p.symbol]==="down"?T.red:T.text,fontWeight:700,transition:"color .3s"}}>
                {p.currentPrice?`$${fmt(p.currentPrice)}`:"..."}
              </span>
              {p.pd?.change!=null&&<span style={{fontSize:9,color:p.pd.change>=0?T.green:T.red}}>{fmtP(p.pd.change)}</span>}
            </div>
          ))}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8,padding:"0 12px",borderLeft:`1px solid ${T.border}`,flexShrink:0}}>
          {lastUpd&&<span style={{fontSize:8,color:T.muted}}>{lastUpd.toLocaleTimeString("es-AR")}</span>}
          <span style={{fontSize:9,color:T.muted}}>{time.toLocaleTimeString("es-AR")}</span>
          <button onClick={()=>{setShowForm(s=>!s);setTab("live");}}
            style={{background:T.orangeDim,border:`1px solid ${T.orange}`,color:T.orange,borderRadius:2,padding:"4px 12px",cursor:"pointer",fontFamily:T.mono,fontSize:9,fontWeight:700,letterSpacing:1}}>
            + POSICIÓN
          </button>
        </div>
      </div>

      {/* NAV */}
      <div style={{background:"#030e1c",borderBottom:`1px solid ${T.border}`,display:"flex",flexShrink:0}}>
        {[["live","📡 EN VIVO"],["history","📊 HISTORIAL"]].map(([k,l])=>(
          <button key={k} onClick={()=>setTab(k)}
            style={{background:tab===k?T.panel:"transparent",border:"none",borderBottom:tab===k?`2px solid ${T.orange}`:"2px solid transparent",color:tab===k?T.orange:T.muted,padding:"7px 20px",cursor:"pointer",fontFamily:T.mono,fontSize:10,fontWeight:700,letterSpacing:1.5}}>
            {l}
          </button>
        ))}
      </div>

      {/* CONTENT */}
      <div style={{flex:1,display:"flex",overflow:"hidden"}}>

        {/* ══ LIVE ══ */}
        {tab==="live" && (
          <>
            {/* LEFT */}
            <div style={{width:380,flexShrink:0,display:"flex",flexDirection:"column",borderRight:`1px solid ${T.border}`,overflow:"hidden"}}>

              {/* Form */}
              {showForm && (
                <div style={{background:T.panel,borderBottom:`1px solid ${T.orange}`,padding:12,flexShrink:0,overflow:"auto",maxHeight:"52vh"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                    <span style={{fontSize:10,color:T.orange,fontWeight:700,letterSpacing:2}}>NUEVA POSICIÓN</span>
                    <button onClick={()=>setShowForm(false)} style={{background:"transparent",border:"none",color:T.muted,cursor:"pointer",fontSize:18,lineHeight:1}}>×</button>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr auto",gap:6,marginBottom:8}}>
                    <div>
                      <div style={{fontSize:9,color:T.muted,marginBottom:3,letterSpacing:1}}>SÍMBOLO *</div>
                      <input value={form.symbol} onChange={e=>setF("symbol")(e.target.value.toUpperCase())}
                        placeholder="BTCUSDT · AAPL · NQ1!"
                        style={{width:"100%",background:T.bg2,border:`1px solid ${T.border}`,color:T.text,borderRadius:2,padding:"5px 8px",fontFamily:T.mono,fontSize:11}}/>
                    </div>
                    <div>
                      <div style={{fontSize:9,color:T.muted,marginBottom:3,letterSpacing:1}}>TIPO</div>
                      <select value={form.direction} onChange={e=>setF("direction")(e.target.value)}
                        style={{background:T.bg2,border:`1px solid ${T.border}`,color:form.direction==="Long"?T.green:T.red,borderRadius:2,padding:"5px 8px",fontFamily:T.mono,fontSize:11,fontWeight:700}}>
                        <option>Long</option><option>Short</option>
                      </select>
                    </div>
                  </div>
                  <div style={{marginBottom:8}}>
                    <div style={{fontSize:9,color:T.orange,marginBottom:3,letterSpacing:1}}>CAPITAL INVERTIDO ($) *</div>
                    <input type="number" value={form.capital} onChange={e=>setF("capital")(e.target.value)}
                      placeholder="Ej: 5000"
                      style={{width:"100%",background:T.bg2,border:`1px solid ${T.orange}`,color:T.text,borderRadius:2,padding:"5px 8px",fontFamily:T.mono,fontSize:11}}/>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr auto",gap:6,marginBottom:8}}>
                    <div>
                      <div style={{fontSize:9,color:T.muted,marginBottom:3,letterSpacing:1}}>PRECIO ENTRADA *</div>
                      <input type="number" value={form.entryPrice} onChange={e=>setF("entryPrice")(e.target.value)}
                        placeholder="0.00"
                        style={{width:"100%",background:T.bg2,border:`1px solid ${T.border}`,color:T.text,borderRadius:2,padding:"5px 8px",fontFamily:T.mono,fontSize:11}}/>
                    </div>
                    <div style={{alignSelf:"flex-end"}}>
                      <button onClick={fetchLive} disabled={fetchingP||!form.symbol.trim()}
                        style={{background:fetchingP?T.muted2:T.orangeDim,border:`1px solid ${fetchingP?T.muted:T.orange}`,color:fetchingP?T.muted:T.orange,borderRadius:2,padding:"5px 8px",cursor:fetchingP?"not-allowed":"pointer",fontFamily:T.mono,fontSize:9,fontWeight:700,height:29,whiteSpace:"nowrap"}}>
                        {fetchingP?"...":"↓ LIVE"}
                      </button>
                    </div>
                  </div>
                  {form.capital&&form.entryPrice&&pn(form.capital)&&pn(form.entryPrice)&&(
                    <div style={{background:T.amberDim,border:`1px solid ${T.amber}`,borderRadius:2,padding:"4px 8px",marginBottom:8,fontSize:9,color:T.amber}}>
                      CANTIDAD: {fmt(pn(form.capital)/pn(form.entryPrice),6)} unidades
                    </div>
                  )}
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:8}}>
                    <div>
                      <div style={{fontSize:9,color:T.red,marginBottom:3,letterSpacing:1}}>STOP LOSS</div>
                      <input type="number" value={form.stopLoss} onChange={e=>setF("stopLoss")(e.target.value)}
                        placeholder="Opcional"
                        style={{width:"100%",background:T.bg2,border:`1px solid ${T.border}`,color:T.text,borderRadius:2,padding:"5px 8px",fontFamily:T.mono,fontSize:11}}/>
                    </div>
                    <div>
                      <div style={{fontSize:9,color:T.green,marginBottom:3,letterSpacing:1}}>TAKE PROFIT</div>
                      <input type="number" value={form.takeProfit} onChange={e=>setF("takeProfit")(e.target.value)}
                        placeholder="Opcional"
                        style={{width:"100%",background:T.bg2,border:`1px solid ${T.border}`,color:T.text,borderRadius:2,padding:"5px 8px",fontFamily:T.mono,fontSize:11}}/>
                    </div>
                  </div>
                  <div style={{marginBottom:10}}>
                    <div style={{fontSize:9,color:T.muted,marginBottom:3,letterSpacing:1}}>ESTRATEGIA</div>
                    <input value={form.strategy} onChange={e=>setF("strategy")(e.target.value)}
                      placeholder="Opcional"
                      style={{width:"100%",background:T.bg2,border:`1px solid ${T.border}`,color:T.text,borderRadius:2,padding:"5px 8px",fontFamily:T.mono,fontSize:11}}/>
                  </div>
                  <button onClick={addPosition}
                    style={{width:"100%",background:T.orange2,border:"none",color:"#fff",borderRadius:2,padding:"9px",cursor:"pointer",fontFamily:T.mono,fontSize:12,fontWeight:900,letterSpacing:2}}>
                    ABRIR POSICIÓN ↗
                  </button>
                </div>
              )}

              {/* Positions */}
              <div style={{flex:1,overflow:"auto"}}>
                <PH title="POSICIONES ABIERTAS" sub={`${positions.length} ACTIVAS`}
                  right={positions.length>0&&<span style={{fontSize:9,color:T.green,display:"flex",alignItems:"center",gap:4}}><Blink color={T.green}/>LIVE</span>}
                />
                {livePos.length===0?(
                  <div style={{padding:"50px 20px",textAlign:"center",color:T.muted}}>
                    <div style={{fontSize:28,marginBottom:8,color:T.orange}}>📡</div>
                    <div style={{fontSize:11,letterSpacing:2,marginBottom:6}}>SIN POSICIONES ABIERTAS</div>
                    <div style={{fontSize:9,color:T.muted2}}>USÁ "+ POSICIÓN" PARA EMPEZAR</div>
                  </div>
                ):livePos.map(p=>{
                  const isSel=p.id===selected||(selected==null&&livePos[0]?.id===p.id);
                  const fColor=flash[p.symbol]==="up"?T.green:flash[p.symbol]==="down"?T.red:null;
                  const pnlC=p.pnl==null?T.muted:p.pnl>=0?T.green:T.red;
                  const nearSL=p.stopLoss&&p.currentPrice?Math.abs(p.currentPrice-p.stopLoss)/p.currentPrice<0.005:false;
                  const nearTP=p.takeProfit&&p.currentPrice?Math.abs(p.currentPrice-p.takeProfit)/p.currentPrice<0.005:false;
                  return (
                    <div key={p.id} onClick={()=>setSelected(p.id)}
                      style={{padding:"10px 12px",borderBottom:`1px solid ${T.border2}`,cursor:"pointer",background:isSel?T.panel2:"transparent",borderLeft:isSel?`3px solid ${T.orange}`:"3px solid transparent",transition:"background .15s"}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:3}}>
                        <div style={{display:"flex",alignItems:"center",gap:6}}>
                          <span style={{color:T.orange,fontWeight:900,fontSize:13}}>{p.symbol}</span>
                          <span style={{background:p.direction==="Long"?T.greenDim:T.redDim,color:p.direction==="Long"?T.green:T.red,borderRadius:2,padding:"1px 5px",fontSize:8,fontWeight:700}}>{p.direction.toUpperCase()}</span>
                          {p.strategy&&<span style={{color:T.amber,fontSize:9}}>{p.strategy}</span>}
                          {nearSL&&<span style={{color:T.red,fontSize:8,fontWeight:700}}>⚠ SL</span>}
                          {nearTP&&<span style={{color:T.green,fontSize:8,fontWeight:700}}>🎯 TP</span>}
                        </div>
                        <span style={{fontSize:13,fontWeight:700,color:fColor||T.text,fontFamily:T.mono,transition:"color .4s"}}>
                          {p.currentPrice?`$${fmt(p.currentPrice)}`:<span style={{color:T.muted,fontSize:10}}>conectando...</span>}
                        </span>
                      </div>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                        <span style={{fontSize:9,color:T.muted}}>ENT ${fmt(p.entryPrice)}{p.capital?` · CAP $${fmt(pn(p.capital))}`:""}
                        </span>
                        {p.pnl!=null?(
                          <span style={{background:p.pnl>=0?T.greenDim:T.redDim,color:pnlC,borderRadius:2,padding:"2px 7px",fontSize:11,fontWeight:700}}>
                            {sign(p.pnl)}${fmt(p.pnl)} ({fmtP(p.pnlPct)})
                          </span>
                        ):<span style={{color:T.muted,fontSize:9}}>calculando...</span>}
                      </div>
                      {p.pd&&(
                        <div style={{display:"flex",gap:10,marginBottom:4,fontSize:9}}>
                          {p.pd.change!=null&&<span style={{color:p.pd.change>=0?T.green:T.red}}>24h: {fmtP(p.pd.change)}</span>}
                          {p.pd.high&&<span style={{color:T.muted}}>H:{fmt(p.pd.high)}</span>}
                          {p.pd.low&&<span style={{color:T.muted}}>L:{fmt(p.pd.low)}</span>}
                          {p.pd.volume&&<span style={{color:T.muted}}>VOL:{fmtK(p.pd.volume)}</span>}
                        </div>
                      )}
                      {(p.stopLoss||p.takeProfit)&&p.currentPrice&&(
                        <div style={{display:"flex",gap:10,marginBottom:5,fontSize:9}}>
                          {p.stopLoss&&<span style={{color:T.red}}>SL ${fmt(p.stopLoss)} <span style={{color:T.muted}}>({fmtP((p.currentPrice-p.stopLoss)/p.currentPrice*100)})</span></span>}
                          {p.takeProfit&&<span style={{color:T.green}}>TP ${fmt(p.takeProfit)} <span style={{color:T.muted}}>({fmtP((p.takeProfit-p.currentPrice)/p.currentPrice*100)})</span></span>}
                        </div>
                      )}
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                        <Sparkline data={priceHist[p.symbol]} color={p.pnl==null?T.muted:p.pnl>=0?T.green:T.red}/>
                        <div style={{display:"flex",gap:5}}>
                          <button onClick={e=>{e.stopPropagation();closePosition(p);}}
                            style={{background:T.greenDim,border:`1px solid ${T.green}`,color:T.green,borderRadius:2,padding:"4px 10px",cursor:"pointer",fontFamily:T.mono,fontSize:9,fontWeight:700}}>
                            CERRAR ✓
                          </button>
                          <button onClick={e=>{e.stopPropagation();deletePos(p.id);}}
                            style={{background:T.redDim,border:`1px solid ${T.red}`,color:T.red,borderRadius:2,padding:"4px 7px",cursor:"pointer",fontFamily:T.mono,fontSize:9}}>
                            ✕
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* RIGHT: Chart */}
            <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
              <PH
                title={selPos?`${selPos.symbol} — GRÁFICO EN VIVO`:"GRÁFICO"}
                sub={selPos?`${selPos.direction} · ENT $${fmt(selPos.entryPrice)}${selPos.strategy?" · "+selPos.strategy:""}`:""}
                right={selPos&&selPos.pnl!=null&&(
                  <div style={{display:"flex",alignItems:"center",gap:10}}>
                    <span style={{fontSize:12,color:selPos.pnl>=0?T.green:T.red,fontWeight:700}}>
                      {sign(selPos.pnl)}${fmt(selPos.pnl)} ({fmtP(selPos.pnlPct)})
                    </span>
                    <span style={{fontSize:11,color:T.orange,fontWeight:700}}>${fmt(selPos.currentPrice)}</span>
                  </div>
                )}
              />
              <div style={{flex:1,position:"relative"}}>
                {selPos?(
                  <iframe key={tvSym} src={tvUrl}
                    style={{width:"100%",height:"100%",border:"none",background:T.bg}}
                    allow="clipboard-write"/>
                ):(
                  <div style={{height:"100%",display:"flex",alignItems:"center",justifyContent:"center",color:T.muted,flexDirection:"column",gap:12}}>
                    <div style={{fontSize:36,color:T.orange}}>📊</div>
                    <div style={{fontSize:11,letterSpacing:3}}>AGREGÁ UNA POSICIÓN PARA VER EL GRÁFICO</div>
                  </div>
                )}
              </div>
              {selPos&&selPos.pd&&(
                <div style={{background:"#040f1c",borderTop:`1px solid ${T.border}`,display:"flex",flexShrink:0,overflowX:"auto"}}>
                  {[
                    ["PRECIO",`$${fmt(selPos.currentPrice)}`,null],
                    ["CAMBIO 24H",fmtP(selPos.pd.change),selPos.pd.change],
                    ["MÁXIMO",`$${fmt(selPos.pd.high)}`,null],
                    ["MÍNIMO",`$${fmt(selPos.pd.low)}`,null],
                    ["VOLUMEN",fmtK(selPos.pd.volume),null],
                    ["P&L FLOTANTE",`${sign(selPos.pnl||0)}$${fmt(selPos.pnl)}`,selPos.pnl],
                    ["P&L %",fmtP(selPos.pnlPct),selPos.pnlPct],
                    ["CAPITAL",`$${fmt(selPos.capital?pn(selPos.capital):selPos.entryPrice*(selPos._qty||0))}`,null],
                  ].map(([lbl,val,c])=>(
                    <div key={lbl} style={{padding:"5px 14px",borderRight:`1px solid ${T.border}`,flexShrink:0}}>
                      <div style={{fontSize:8,color:T.muted,letterSpacing:1,marginBottom:2}}>{lbl}</div>
                      <div style={{fontSize:11,fontWeight:700,color:c==null?T.text:c>=0?T.green:T.red,fontFamily:T.mono}}>{val||"—"}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* ══ HISTORY ══ */}
        {tab==="history" && (
          <div style={{flex:1,display:"flex",overflow:"hidden"}}>
            <div style={{width:340,flexShrink:0,borderRight:`1px solid ${T.border}`,display:"flex",flexDirection:"column",overflow:"hidden"}}>
              <PH title="TRADES CERRADOS" sub={`${history.length} OPERACIONES`}
                right={history.length>0&&<button onClick={()=>{if(window.confirm("¿Limpiar historial?"))saveHist([]);}} style={{background:"transparent",border:`1px solid ${T.red}`,color:T.red,borderRadius:2,padding:"2px 8px",cursor:"pointer",fontFamily:T.mono,fontSize:8}}>LIMPIAR</button>}
              />
              <div style={{flex:1,overflow:"auto"}}>
                {history.length===0?(
                  <div style={{padding:"40px 20px",textAlign:"center",color:T.muted,fontSize:11}}>SIN TRADES CERRADOS AÚN</div>
                ):history.map((t,i)=>(
                  <div key={t.id} style={{padding:"8px 12px",borderBottom:`1px solid ${T.border2}`,background:i%2===0?"transparent":T.panel}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                      <div style={{display:"flex",alignItems:"center",gap:6}}>
                        <span style={{color:T.orange,fontWeight:700}}>{t.symbol}</span>
                        <span style={{fontSize:8,color:t.direction==="Long"?T.green:T.red,fontWeight:700}}>{t.direction}</span>
                        {t.strategy&&<span style={{fontSize:8,color:T.amber}}>{t.strategy}</span>}
                      </div>
                      <span style={{background:t.finalPnl>=0?T.greenDim:T.redDim,color:t.finalPnl>=0?T.green:T.red,borderRadius:2,padding:"1px 6px",fontSize:10,fontWeight:700}}>
                        {sign(t.finalPnl)}${fmt(t.finalPnl)} ({fmtP(t.finalPnlPct)})
                      </span>
                    </div>
                    <div style={{fontSize:9,color:T.muted}}>ENT ${fmt(t.entryPrice)} → SAL ${fmt(t.exitPrice)}</div>
                    <div style={{fontSize:9,color:T.muted2}}>{t.closeDate?new Date(t.closeDate).toLocaleString("es-AR"):"—"}</div>
                  </div>
                ))}
              </div>
              {history.length>0&&(
                <div style={{padding:10,borderTop:`1px solid ${T.border}`,background:T.panel,flexShrink:0}}>
                  <MRow label="P&L TOTAL"  value={`${sign(histStats.totalPnl)}$${fmt(histStats.totalPnl)}`}  color={histStats.totalPnl>=0?T.green:T.red}/>
                  <MRow label="WIN RATE"   value={`${fmt(histStats.winrate,1)}% (${histStats.wins}W/${histStats.losses}L)`} color={histStats.winrate>=50?T.green:T.amber}/>
                  <MRow label="TRADES"     value={histStats.closed}/>
                </div>
              )}
            </div>

            {/* Charts */}
            <div style={{flex:1,overflow:"auto",padding:10,display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,alignContent:"start"}}>
              <div style={{background:T.panel,border:`1px solid ${T.border}`,borderRadius:3}}>
                <PH title="GANADAS vs PERDIDAS"/>
                <div style={{height:180,padding:"10px 0"}}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={histStats.winLosePie} cx="50%" cy="50%" outerRadius={65} dataKey="value"
                        label={({name,percent})=>`${name} ${(percent*100).toFixed(0)}%`} labelLine={false}
                        style={{fontSize:10,fontFamily:T.mono,fill:T.text}}>
                        <Cell fill={T.green}/><Cell fill={T.red}/>
                      </Pie>
                      <Tooltip contentStyle={{background:T.bg,border:`1px solid ${T.border}`,fontFamily:T.mono,fontSize:10,color:T.text}}/>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div style={{background:T.panel,border:`1px solid ${T.border}`,borderRadius:3}}>
                <PH title="P&L POR ESTRATEGIA"/>
                <div style={{height:180,padding:"10px 0"}}>
                  {Object.keys(histStats.byStrat).length>0?(
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={Object.entries(histStats.byStrat).map(([k,v])=>({name:k,value:Math.abs(v.pnl),rawPnl:v.pnl}))}
                          cx="50%" cy="50%" outerRadius={65} dataKey="value"
                          label={({name,percent})=>`${name.slice(0,8)} ${(percent*100).toFixed(0)}%`} labelLine={false}
                          style={{fontSize:9,fontFamily:T.mono,fill:T.text}}>
                          {Object.entries(histStats.byStrat).map(([,v],i)=><Cell key={i} fill={v.pnl>=0?PIE_COLORS[i%PIE_COLORS.length]:T.red}/>)}
                        </Pie>
                        <Tooltip contentStyle={{background:T.bg,border:`1px solid ${T.border}`,fontFamily:T.mono,fontSize:10,color:T.text}} formatter={(v,n,p)=>[`$${fmt(p.payload.rawPnl)}`,n]}/>
                      </PieChart>
                    </ResponsiveContainer>
                  ):<div style={{height:"100%",display:"flex",alignItems:"center",justifyContent:"center",color:T.muted,fontSize:10}}>SIN DATOS DE ESTRATEGIAS</div>}
                </div>
              </div>
              <div style={{background:T.panel,border:`1px solid ${T.border}`,borderRadius:3,gridColumn:"span 2"}}>
                <PH title={`P&L POR ${histTab==="daily"?"DÍA DE SEMANA":histTab==="weekly"?"SEMANA":"MES"}`}
                  right={
                    <div style={{display:"flex",gap:4}}>
                      {[["daily","DÍA"],["weekly","SEMANA"],["monthly","MES"]].map(([k,l])=>(
                        <button key={k} onClick={()=>setHistTab(k)}
                          style={{background:histTab===k?T.orange2:"transparent",border:`1px solid ${histTab===k?T.orange:T.border}`,color:histTab===k?"#fff":T.muted,borderRadius:2,padding:"2px 8px",cursor:"pointer",fontFamily:T.mono,fontSize:8,fontWeight:700}}>
                          {l}
                        </button>
                      ))}
                    </div>
                  }
                />
                <div style={{height:180,padding:"10px 4px 4px 0"}}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={histTab==="daily"?histStats.byDay:histTab==="weekly"?histStats.weekArr:histStats.byMonth} margin={{top:5,right:10,left:0,bottom:5}}>
                      <CartesianGrid strokeDasharray="3 3" stroke={T.border2}/>
                      <XAxis dataKey="name" tick={{fill:T.muted,fontSize:9,fontFamily:T.mono}}/>
                      <YAxis tick={{fill:T.muted,fontSize:9,fontFamily:T.mono}} tickFormatter={v=>`$${fmtK(v)}`} width={55}/>
                      <Tooltip contentStyle={{background:T.bg,border:`1px solid ${T.border}`,fontFamily:T.mono,fontSize:10,color:T.text}} formatter={v=>[`$${fmt(v)}`,"P&L"]}/>
                      <Bar dataKey="pnl" radius={[2,2,0,0]}>
                        {(histTab==="daily"?histStats.byDay:histTab==="weekly"?histStats.weekArr:histStats.byMonth).map((d,i)=>(
                          <Cell key={i} fill={d.pnl>=0?T.green:T.red}/>
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* STATUS BAR */}
      <div style={{background:"#020a14",borderTop:`1px solid ${T.border}`,padding:"3px 14px",display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0}}>
        <div style={{display:"flex",gap:16}}>
          <span style={{color:T.muted,fontSize:9}}>ABIERTAS: <span style={{color:T.orange}}>{positions.length}</span></span>
          <span style={{color:T.muted,fontSize:9}}>CERRADAS: <span style={{color:T.text}}>{history.length}</span></span>
          <span style={{color:T.muted,fontSize:9}}>P&L VIVO: <span style={{color:totalPnl>=0?T.green:T.red,fontWeight:700}}>{sign(totalPnl)}${fmt(totalPnl)}</span></span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:8,color:T.muted}}>BINANCE · FINNHUB · TRADINGVIEW</span>
          <span style={{color:T.green,fontSize:9,fontWeight:700}}><Blink color={T.green}/>LIVE</span>
        </div>
      </div>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}`}</style>
    </div>
  );
}
