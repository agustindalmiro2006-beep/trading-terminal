import { useState, useEffect, useMemo, useRef } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Cell
} from "recharts";

// ─── Storage (localStorage) ───────────────────────────────────────────────────
const storage = {
  get: async (key) => { const v = localStorage.getItem(key); return v ? { value: v } : null; },
  set: async (key, value) => { localStorage.setItem(key, String(value)); return { key, value }; },
  delete: async (key) => { localStorage.removeItem(key); return { deleted: true }; },
};

// ─── Theme ────────────────────────────────────────────────────────────────────
const T = {
  bg: "#060d1a", bg2: "#0a1628", panel: "#0d1f35", panel2: "#0f2440",
  border: "#1a3a5c", border2: "#0e2540",
  green: "#00e676", green2: "#00c853", greenDim: "#002d12",
  red: "#ff3d57", redDim: "#2d0010",
  blue: "#00b0ff", blue2: "#0091ea", blueDim: "#001c30",
  yellow: "#ffd600", yellowDim: "#2a2000",
  cyan: "#00e5ff", cyanDim: "#002a30",
  text: "#dff0fd", muted: "#4a7fa5", muted2: "#1e3a50",
  mono: "'Courier New', monospace", sans: "system-ui, sans-serif",
};

const FIELD_LABELS = {
  entryDate: "Fecha / Hora entrada", exitDate: "Fecha / Hora salida",
  asset: "Activo / Par / Símbolo", direction: "Tipo (Long/Short/Buy/Sell)",
  strategy: "Estrategia / Setup", capital: "Capital invertido ($)",
  entryPrice: "Precio de entrada", exitPrice: "Precio de salida",
  stopLoss: "Stop Loss", takeProfit: "Take Profit",
  resultUSD: "Resultado $ (P&L)", commission: "Comisión / Fee",
  notes: "Observaciones",
};

const AUTOMAP = {
  entryDate: ["fecha entrada","entry date","entry_date","open date","fecha_entrada","open_time","opentime"],
  exitDate: ["fecha salida","exit date","exit_date","close date","fecha_salida","close_time","closetime"],
  asset: ["activo","asset","symbol","par","ticker","instrumento","pair"],
  direction: ["tipo","type","direction","side","long/short","dir"],
  strategy: ["estrategia","strategy","setup","sistema"],
  capital: ["capital","capital invertido","size","position size","monto","amount","notional"],
  entryPrice: ["precio entrada","entry price","entry_price","open price","open","precio_entrada"],
  exitPrice: ["precio salida","exit price","exit_price","close price","close","precio_salida"],
  stopLoss: ["stop loss","sl","stop","stop_loss","stoploss"],
  takeProfit: ["take profit","tp","target","take_profit","takeprofit"],
  resultUSD: ["resultado $","resultado usd","pnl","profit","ganancia","realized pnl","net profit","resultado"],
  commission: ["comisión","comision","fee","fees","commission"],
  notes: ["observaciones","notes","comentarios","comments","notas"],
};

const autoMap = (cols) => {
  const map = {};
  const lower = cols.map(c => c.toLowerCase().trim());
  Object.entries(AUTOMAP).forEach(([field, aliases]) => {
    const idx = lower.findIndex(c => aliases.some(a => c.includes(a)));
    if (idx >= 0) map[field] = cols[idx];
  });
  return map;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n, d = 2) => n == null || isNaN(n) ? "—" : Number(n).toLocaleString("es-AR", { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtK = (n) => { if (!n && n !== 0) return "—"; return Math.abs(n) >= 1000 ? `${(n/1000).toFixed(1)}K` : fmt(n); };
const fmtPct = (n, d = 2) => n == null || isNaN(n) ? "—" : `${n >= 0 ? "+" : ""}${Math.abs(n).toFixed(d)}%`;
const fmtR = (n) => n == null || isNaN(n) ? "—" : `${n >= 0 ? "+" : ""}${fmt(n)}R`;
const sign = (n) => n > 0 ? "+" : "";
const pn = (v) => { const n = parseFloat(String(v ?? "").replace(/[^\d.\-]/g, "")); return isNaN(n) ? null : n; };

const compute = (t) => {
  const entry = pn(t.entryPrice), exit = pn(t.exitPrice);
  const sl = pn(t.stopLoss), cap = pn(t.capital), comm = pn(t.commission) || 0;
  const dir = String(t.direction || "").toLowerCase();
  const qty = entry && cap ? cap / entry : null;
  let res = null, resPct = null, rMult = null;
  const extRes = pn(t.resultUSD);
  if (extRes != null) {
    res = extRes - comm;
  } else if (entry && exit && qty != null) {
    const raw = dir === "short" || dir === "sell" ? (entry - exit) * qty : (exit - entry) * qty;
    res = raw - comm;
  }
  if (res != null && cap) resPct = res / cap * 100;
  if (res != null && sl && entry && qty != null && entry !== sl) {
    const risk = Math.abs(entry - sl) * qty;
    rMult = risk > 0 ? res / risk : null;
  }
  return { ...t, _res: res, _resPct: resPct, _rMult: rMult, _qty: qty };
};

// ─── Subcomponents ────────────────────────────────────────────────────────────
const PH = ({ title, sub, right }) => (
  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"6px 12px", borderBottom:`1px solid ${T.border2}`, background:"#040f1c", flexShrink:0 }}>
    <div style={{ display:"flex", alignItems:"center", gap:7 }}>
      <div style={{ width:3, height:13, background:T.blue, borderRadius:2 }} />
      <span style={{ fontFamily:T.mono, fontSize:10, fontWeight:700, color:T.blue, letterSpacing:1.5 }}>{title}</span>
      {sub && <span style={{ fontSize:9, color:T.muted }}>{sub}</span>}
    </div>
    {right}
  </div>
);

const MRow = ({ label, value, color }) => (
  <div style={{ display:"flex", justifyContent:"space-between", padding:"4px 12px", borderBottom:`1px solid ${T.border2}` }}>
    <span style={{ fontSize:10, color:T.muted, fontFamily:T.mono }}>{label}</span>
    <span style={{ fontSize:11, color:color||T.text, fontFamily:T.mono, fontWeight:700 }}>{value}</span>
  </div>
);

const Pill = ({ v, f }) => {
  const pos = v >= 0;
  return <span style={{ background:pos?T.greenDim:T.redDim, color:pos?T.green:T.red, borderRadius:3, padding:"1px 6px", fontSize:10, fontFamily:T.mono, fontWeight:700, whiteSpace:"nowrap" }}>{f?f(v):`${sign(v)}${fmt(v)}`}</span>;
};

const ChartTip = ({ active, payload, label }) => {
  if (!active||!payload?.length) return null;
  return (
    <div style={{ background:"#040f1c", border:`1px solid ${T.border}`, borderRadius:3, padding:"7px 12px", fontFamily:T.mono, fontSize:11 }}>
      <div style={{ color:T.muted, fontSize:9, marginBottom:3 }}>{label}</div>
      {payload.map((p,i) => <div key={i} style={{ color:p.value>=0?T.green:T.red, fontWeight:700 }}>{p.name}: {fmt(p.value)}</div>)}
    </div>
  );
};

const Inp = ({ label, value, onChange, type="text", options, wide }) => (
  <div style={{ display:"flex", flexDirection:"column", gap:3, minWidth:wide?160:110 }}>
    <label style={{ fontSize:9, color:T.muted, fontFamily:T.mono, letterSpacing:0.8 }}>{label}</label>
    {options ? (
      <select value={value} onChange={e=>onChange(e.target.value)}
        style={{ background:T.bg2, border:`1px solid ${T.border}`, color:T.text, borderRadius:3, padding:"5px 7px", fontFamily:T.mono, fontSize:11 }}>
        <option value="">—</option>
        {options.map(o=><option key={o}>{o}</option>)}
      </select>
    ) : (
      <input type={type} value={value} onChange={e=>onChange(e.target.value)}
        style={{ background:T.bg2, border:`1px solid ${T.border}`, color:T.text, borderRadius:3, padding:"5px 7px", fontFamily:T.mono, fontSize:11, width:"100%" }} />
    )}
  </div>
);

const EMPTY = { entryDate:"", exitDate:"", asset:"", direction:"Long", strategy:"", capital:"", entryPrice:"", exitPrice:"", stopLoss:"", takeProfit:"", resultUSD:"", commission:"", notes:"" };

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [trades, setTrades] = useState([]);
  const [tab, setTab] = useState("dashboard");
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState(EMPTY);
  const [editId, setEditId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showImport, setShowImport] = useState(false);
  const [rawCols, setRawCols] = useState([]);
  const [rawRows, setRawRows] = useState([]);
  const [mapping, setMapping] = useState({});
  const [periodMode, setPeriodMode] = useState("monthly");
  const [filterDir, setFilterDir] = useState("all");
  const [objective, setObjective] = useState(10000);
  const [editObj, setEditObj] = useState(false);
  const [time, setTime] = useState(new Date());
  const fileRef = useRef();

  useEffect(() => { const t = setInterval(()=>setTime(new Date()),1000); return ()=>clearInterval(t); },[]);

  useEffect(() => {
    (async () => {
      try {
        const r = await storage.get("bbg_trades");
        if (r) setTrades(JSON.parse(r.value));
        const o = await storage.get("bbg_obj");
        if (o) setObjective(parseFloat(o.value)||10000);
      } catch(_) {}
      setLoading(false);
    })();
  }, []);

  const saveTrades = async (t) => {
    setTrades(t);
    try { await storage.set("bbg_trades", JSON.stringify(t)); } catch(_) {}
  };

  const computed = useMemo(() => trades.map(compute), [trades]);

  const filtered = useMemo(() => {
    if (filterDir === "all") return computed;
    return computed.filter(t => String(t.direction).toLowerCase().includes(filterDir));
  }, [computed, filterDir]);

  const stats = useMemo(() => {
    const closed = filtered.filter(t => t.exitDate && t._res != null);
    const open = filtered.filter(t => !t.exitDate);
    const wins = closed.filter(t => t._res > 0);
    const losses = closed.filter(t => t._res < 0);
    const totalPnl = closed.reduce((a,b) => a + b._res, 0);
    const grossWin = wins.reduce((a,b) => a + b._res, 0);
    const grossLoss = Math.abs(losses.reduce((a,b) => a + b._res, 0));
    const avgWin = wins.length ? grossWin/wins.length : 0;
    const avgLoss = losses.length ? grossLoss/losses.length : 0;
    const winrate = closed.length ? wins.length/closed.length*100 : 0;
    const pf = grossLoss > 0 ? grossWin/grossLoss : grossWin > 0 ? Infinity : 0;
    const rVals = closed.map(t=>t._rMult).filter(r=>r!=null);
    const avgR = rVals.length ? rVals.reduce((a,b)=>a+b,0)/rVals.length : 0;
    const rr = avgLoss > 0 ? avgWin/avgLoss : 0;
    const expectancy = closed.length ? totalPnl/closed.length : 0;
    const totalCap = closed.reduce((a,b)=>a+(pn(b.capital)||0),0);
    const roi = totalCap > 0 ? totalPnl/totalCap*100 : 0;

    const sorted = [...closed].sort((a,b)=>new Date(a.exitDate)-new Date(b.exitDate));
    let eq=0, peak=0, maxDD=0;
    const equity = [{n:"Inicio",v:0,dd:0}];
    sorted.forEach((t,i) => {
      eq += t._res;
      if (eq>peak) peak=eq;
      const dd = peak>0 ? (peak-eq)/peak*100 : 0;
      if (dd>maxDD) maxDD=dd;
      equity.push({n:t.exitDate?.slice(0,7)||`#${i+1}`,v:Math.round(eq*100)/100,dd});
    });

    const monthly={}, byAsset={}, byStrat={};
    closed.forEach(t => {
      const d=new Date(t.exitDate);
      if (!isNaN(d)) {
        const k=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
        if(!monthly[k]) monthly[k]={pnl:0,trades:0,wins:0};
        monthly[k].pnl+=t._res; monthly[k].trades++;
        if(t._res>0) monthly[k].wins++;
      }
      const a=t.asset||"—";
      if(!byAsset[a]) byAsset[a]={pnl:0,trades:0,wins:0};
      byAsset[a].pnl+=t._res; byAsset[a].trades++;
      if(t._res>0) byAsset[a].wins++;
      const s=t.strategy||"Sin estrategia";
      if(!byStrat[s]) byStrat[s]={pnl:0,trades:0,wins:0,rSum:0,rCount:0};
      byStrat[s].pnl+=t._res; byStrat[s].trades++;
      if(t._res>0) byStrat[s].wins++;
      if(t._rMult!=null){byStrat[s].rSum+=t._rMult;byStrat[s].rCount++;}
    });

    const avgRisk = closed.filter(t=>t.stopLoss&&t.entryPrice&&t.capital).map(t=>{
      const sl=pn(t.stopLoss),ep=pn(t.entryPrice),cap=pn(t.capital);
      return cap ? Math.abs(ep-sl)/ep*100 : null;
    }).filter(Boolean);
    const avgRiskPct = avgRisk.length ? avgRisk.reduce((a,b)=>a+b,0)/avgRisk.length : 0;

    return {
      total:closed.length, open:open.length,
      wins:wins.length, losses:losses.length,
      totalPnl, grossWin, grossLoss, avgWin, avgLoss,
      winrate, pf, avgR, rr, expectancy, roi, maxDD,
      equity, monthly, byAsset, byStrat, avgRiskPct,
      best: closed.length ? closed.reduce((a,b)=>b._res>a._res?b:a) : null,
      worst: closed.length ? closed.reduce((a,b)=>b._res<a._res?b:a) : null,
    };
  }, [filtered]);

  const monthlyArr = useMemo(() => Object.entries(stats.monthly).sort().map(([k,v])=>({k,...v})), [stats.monthly]);
  const annualArr = useMemo(() => {
    const a={};
    monthlyArr.forEach(({k,pnl,trades,wins})=>{
      const y=k.slice(0,4);
      if(!a[y]) a[y]={pnl:0,trades:0,wins:0};
      a[y].pnl+=pnl; a[y].trades+=trades; a[y].wins+=wins;
    });
    return Object.entries(a).sort().map(([k,v])=>({k,...v}));
  }, [monthlyArr]);

  // ── CRUD ──────────────────────────────────────────────────────────────────────
  const setF = k => v => setFormData(f=>({...f,[k]:v}));

  const submitTrade = () => {
    if (!formData.asset||!formData.entryDate) return;
    const newTrades = editId!=null
      ? trades.map(t=>t.id===editId?{...formData,id:editId}:t)
      : [...trades,{...formData,id:Date.now()}];
    saveTrades(newTrades);
    setFormData(EMPTY); setShowForm(false); setEditId(null);
  };

  const deleteTrade = id => { if(window.confirm("¿Eliminar?")) saveTrades(trades.filter(t=>t.id!==id)); };
  const editTrade = t => { setFormData({...EMPTY,...t}); setEditId(t.id); setShowForm(true); setTab("trades"); };

  // ── Import ────────────────────────────────────────────────────────────────────
  const handleFile = file => {
    const ext = file.name.split(".").pop().toLowerCase();
    const process = (data,cols) => { setRawCols(cols); setRawRows(data); setMapping(autoMap(cols)); setShowImport(true); };
    if (["csv","txt"].includes(ext)) {
      Papa.parse(file,{header:true,skipEmptyLines:true,dynamicTyping:false,complete:({data,meta})=>process(data,meta.fields||[])});
    } else {
      const r=new FileReader();
      r.onload=e=>{const wb=XLSX.read(e.target.result,{type:"array"});const ws=wb.Sheets[wb.SheetNames[0]];const data=XLSX.utils.sheet_to_json(ws,{defval:""});if(data.length)process(data,Object.keys(data[0]));};
      r.readAsArrayBuffer(file);
    }
  };

  const applyImport = () => {
    const parsed = rawRows.map((row,idx)=>{
      const g=f=>mapping[f]?row[mapping[f]]:"";
      return {id:Date.now()+idx,entryDate:g("entryDate"),exitDate:g("exitDate"),asset:g("asset"),direction:g("direction")||"Long",strategy:g("strategy"),capital:g("capital"),entryPrice:g("entryPrice"),exitPrice:g("exitPrice"),stopLoss:g("stopLoss"),takeProfit:g("takeProfit"),resultUSD:g("resultUSD"),commission:g("commission"),notes:g("notes")};
    });
    saveTrades([...trades,...parsed]);
    setShowImport(false);
  };

  if (loading) return <div style={{background:T.bg,minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:T.mono,color:T.blue,fontSize:13,letterSpacing:3}}>INICIALIZANDO TERMINAL...</div>;

  const TABS=[["dashboard","DASHBOARD"],["trades","TRADES"],["period","PERÍODO"],["assets","ACTIVOS"],["strategies","ESTRATEGIAS"],["risk","RIESGO"],["goals","OBJETIVOS"]];

  return (
    <div style={{background:T.bg,minHeight:"100vh",color:T.text,fontFamily:T.mono,display:"flex",flexDirection:"column",fontSize:12,overflow:"hidden"}}>

      {/* TOP BAR */}
      <div style={{background:"#020a14",borderBottom:`2px solid ${T.blue}`,display:"flex",alignItems:"stretch",height:38,flexShrink:0}}>
        <div style={{background:T.blue2,padding:"0 14px",display:"flex",alignItems:"center",borderRight:`2px solid ${T.blue}`}}>
          <span style={{fontWeight:900,fontSize:14,letterSpacing:3,color:"#fff"}}>TERMINAL</span>
        </div>
        <div style={{display:"flex",alignItems:"center",flex:1,overflowX:"auto"}}>
          {[["P&L",`${sign(stats.totalPnl)}$${fmt(stats.totalPnl)}`,stats.totalPnl],["WIN RATE",`${fmt(stats.winrate,1)}%`,stats.winrate-50],["PROFIT FACTOR",isFinite(stats.pf)?fmt(stats.pf):"∞",stats.pf-1],["AVG R",fmtR(stats.avgR),stats.avgR],["ROI",fmtPct(stats.roi),stats.roi],["MAX DD",`-${fmt(stats.maxDD,1)}%`,-1],["TRADES",`${stats.total} (${stats.wins}W/${stats.losses}L)`,null]].map(([lbl,val,pos])=>(
            <div key={lbl} style={{display:"flex",alignItems:"center",gap:5,padding:"0 14px",borderRight:`1px solid ${T.border}`,height:"100%",flexShrink:0}}>
              <span style={{fontSize:9,color:T.muted,letterSpacing:1}}>{lbl}</span>
              <span style={{fontSize:11,color:pos==null?T.text:pos>=0?T.green:T.red,fontWeight:700}}>{val}</span>
            </div>
          ))}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:6,padding:"0 12px",borderLeft:`1px solid ${T.border}`,flexShrink:0}}>
          <span style={{color:T.muted,fontSize:9}}>{time.toLocaleTimeString("es-AR")}</span>
          <button onClick={()=>fileRef.current.click()} style={{background:T.blueDim,border:`1px solid ${T.blue}`,color:T.blue,borderRadius:3,padding:"3px 10px",cursor:"pointer",fontFamily:T.mono,fontSize:9,fontWeight:700}}>⬆ CSV</button>
          <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" style={{display:"none"}} onChange={e=>{if(e.target.files[0])handleFile(e.target.files[0]);e.target.value="";}} />
          <button onClick={()=>{setFormData(EMPTY);setEditId(null);setShowForm(!showForm);setTab("trades");}} style={{background:T.greenDim,border:`1px solid ${T.green}`,color:T.green,borderRadius:3,padding:"3px 10px",cursor:"pointer",fontFamily:T.mono,fontSize:9,fontWeight:700}}>+ TRADE</button>
        </div>
      </div>

      {/* NAV */}
      <div style={{background:"#030e1c",borderBottom:`1px solid ${T.border}`,display:"flex",flexShrink:0}}>
        {TABS.map(([k,l])=>(
          <button key={k} onClick={()=>setTab(k)}
            style={{background:tab===k?T.panel:"transparent",border:"none",borderBottom:tab===k?`2px solid ${T.blue}`:"2px solid transparent",color:tab===k?T.blue:T.muted,padding:"7px 16px",cursor:"pointer",fontFamily:T.mono,fontSize:10,fontWeight:700,letterSpacing:1.2}}>
            {l}
          </button>
        ))}
      </div>

      {/* IMPORT MODAL */}
      {showImport && (
        <div style={{position:"fixed",inset:0,background:"#000a",zIndex:100,display:"flex",alignItems:"center",justifyContent:"center"}}>
          <div style={{background:T.panel,border:`2px solid ${T.blue}`,borderRadius:6,width:680,maxHeight:"85vh",overflow:"auto"}}>
            <PH title={`MAPEAR COLUMNAS — ${rawRows.length} FILAS`} right={<button onClick={()=>setShowImport(false)} style={{background:"transparent",border:"none",color:T.muted,cursor:"pointer",fontSize:18,padding:"0 4px"}}>×</button>} />
            <div style={{padding:16,display:"grid",gap:8}}>
              {Object.entries(FIELD_LABELS).map(([field,label])=>(
                <div key={field} style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,alignItems:"center",background:T.bg2,borderRadius:3,padding:"8px 12px",border:`1px solid ${mapping[field]?T.blue:T.border2}`}}>
                  <div style={{fontSize:11,color:mapping[field]?T.blue:T.muted,fontWeight:700}}>{label}</div>
                  <select value={mapping[field]||""} onChange={e=>setMapping(m=>({...m,[field]:e.target.value||undefined}))}
                    style={{background:T.bg,border:`1px solid ${T.border}`,color:T.text,borderRadius:3,padding:"5px 8px",fontFamily:T.mono,fontSize:11}}>
                    <option value="">— No mapear —</option>
                    {rawCols.map(c=><option key={c}>{c}</option>)}
                  </select>
                </div>
              ))}
              <button onClick={applyImport} style={{width:"100%",background:T.blue2,border:"none",color:"#fff",borderRadius:3,padding:12,cursor:"pointer",fontFamily:T.mono,fontSize:12,fontWeight:700,letterSpacing:1.5,marginTop:8}}>
                IMPORTAR {rawRows.length} OPERACIONES →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONTENT */}
      <div style={{flex:1,overflow:"auto",padding:8}}>

        {/* TRADE FORM */}
        {showForm && tab==="trades" && (
          <div style={{background:T.panel,border:`1px solid ${T.blue}`,borderRadius:4,marginBottom:8}}>
            <PH title={editId?"EDITAR TRADE":"NUEVO TRADE"} right={<button onClick={()=>{setShowForm(false);setEditId(null);}} style={{background:"transparent",border:"none",color:T.muted,cursor:"pointer",fontSize:18}}>×</button>} />
            <div style={{padding:12,display:"flex",flexWrap:"wrap",gap:10,alignItems:"flex-end"}}>
              <Inp label="FECHA ENTRADA *" value={formData.entryDate} onChange={setF("entryDate")} type="date" />
              <Inp label="FECHA SALIDA" value={formData.exitDate} onChange={setF("exitDate")} type="date" />
              <Inp label="ACTIVO *" value={formData.asset} onChange={setF("asset")} wide />
              <Inp label="TIPO" value={formData.direction} onChange={setF("direction")} options={["Long","Short"]} />
              <Inp label="ESTRATEGIA" value={formData.strategy} onChange={setF("strategy")} wide />
              <Inp label="CAPITAL ($)" value={formData.capital} onChange={setF("capital")} type="number" />
              <Inp label="PRECIO ENTRADA" value={formData.entryPrice} onChange={setF("entryPrice")} type="number" />
              <Inp label="PRECIO SALIDA" value={formData.exitPrice} onChange={setF("exitPrice")} type="number" />
              <Inp label="STOP LOSS" value={formData.stopLoss} onChange={setF("stopLoss")} type="number" />
              <Inp label="TAKE PROFIT" value={formData.takeProfit} onChange={setF("takeProfit")} type="number" />
              <Inp label="RESULTADO $ (opcional)" value={formData.resultUSD} onChange={setF("resultUSD")} type="number" />
              <Inp label="COMISIÓN ($)" value={formData.commission} onChange={setF("commission")} type="number" />
              <Inp label="OBSERVACIONES" value={formData.notes} onChange={setF("notes")} wide />
              <button onClick={submitTrade} style={{background:T.green2,border:"none",color:"#000",borderRadius:3,padding:"6px 20px",cursor:"pointer",fontFamily:T.mono,fontSize:11,fontWeight:900,letterSpacing:1,height:30,alignSelf:"flex-end"}}>
                {editId?"ACTUALIZAR":"GUARDAR"} ✓
              </button>
            </div>
          </div>
        )}

        {/* DASHBOARD */}
        {tab==="dashboard" && (
          <div style={{display:"grid",gridTemplateColumns:"1fr 260px",gap:8}}>
            <div style={{background:T.panel,border:`1px solid ${T.border}`,borderRadius:4}}>
              <PH title="CURVA DE EQUITY" sub="P&L acumulado" right={<span style={{fontFamily:T.mono,fontSize:10,color:stats.totalPnl>=0?T.green:T.red,fontWeight:700}}>{sign(stats.totalPnl)}${fmt(stats.totalPnl)}</span>} />
              <div style={{height:200,padding:"10px 4px 4px 0"}}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={stats.equity} margin={{top:5,right:10,left:0,bottom:5}}>
                    <defs><linearGradient id="eqG" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={T.green} stopOpacity={0.4}/><stop offset="100%" stopColor={T.green} stopOpacity={0}/></linearGradient></defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={T.border2}/>
                    <XAxis dataKey="n" tick={{fill:T.muted,fontSize:8}} interval="preserveStartEnd"/>
                    <YAxis tick={{fill:T.muted,fontSize:8}} tickFormatter={v=>`$${fmtK(v)}`} width={65}/>
                    <Tooltip content={<ChartTip/>}/>
                    <ReferenceLine y={0} stroke={T.muted} strokeDasharray="4 4"/>
                    <Area type="monotone" dataKey="v" name="P&L" stroke={T.green} fill="url(#eqG)" strokeWidth={2} dot={false}/>
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div style={{background:T.panel,border:`1px solid ${T.border}`,borderRadius:4}}>
              <PH title="KPIs"/>
              <div style={{padding:"6px 0"}}>
                <div style={{padding:"6px 12px 8px",borderBottom:`1px solid ${T.border2}`,marginBottom:4}}>
                  <div style={{fontSize:8,color:T.muted,letterSpacing:1}}>P&L NETO</div>
                  <div style={{fontSize:20,color:stats.totalPnl>=0?T.green:T.red,fontWeight:900,lineHeight:1.2}}>{sign(stats.totalPnl)}${fmt(stats.totalPnl)}</div>
                </div>
                <MRow label="WIN RATE" value={`${fmt(stats.winrate,1)}% (${stats.wins}W/${stats.losses}L)`} color={stats.winrate>=50?T.green:T.yellow}/>
                <MRow label="PROFIT FACTOR" value={isFinite(stats.pf)?fmt(stats.pf):"∞"} color={stats.pf>=1.5?T.green:stats.pf>=1?T.yellow:T.red}/>
                <MRow label="AVG R-MULTIPLE" value={fmtR(stats.avgR)} color={stats.avgR>=0?T.green:T.red}/>
                <MRow label="RATIO R/R" value={fmt(stats.rr)} color={stats.rr>=1?T.green:T.yellow}/>
                <MRow label="EXPECTANCY" value={`${sign(stats.expectancy)}$${fmt(stats.expectancy)}`} color={stats.expectancy>=0?T.green:T.red}/>
                <MRow label="ROI TOTAL" value={fmtPct(stats.roi)} color={stats.roi>=0?T.green:T.red}/>
                <MRow label="MAX DRAWDOWN" value={`-${fmt(stats.maxDD,1)}%`} color={stats.maxDD>20?T.red:T.yellow}/>
                <MRow label="AVG GANANCIA" value={`+$${fmt(stats.avgWin)}`} color={T.green}/>
                <MRow label="AVG PÉRDIDA" value={`-$${fmt(stats.avgLoss)}`} color={T.red}/>
                <MRow label="TRADES CERRADOS" value={stats.total}/>
                <MRow label="POSICIONES ABIERTAS" value={stats.open} color={stats.open>0?T.cyan:T.muted}/>
              </div>
            </div>
            <div style={{background:T.panel,border:`1px solid ${T.border}`,borderRadius:4}}>
              <PH title="DRAWDOWN %" sub={`MAX: -${fmt(stats.maxDD,1)}%`}/>
              <div style={{height:130,padding:"8px 4px 4px 0"}}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={stats.equity} margin={{top:5,right:10,left:0,bottom:5}}>
                    <defs><linearGradient id="ddG" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={T.red} stopOpacity={0.5}/><stop offset="100%" stopColor={T.red} stopOpacity={0}/></linearGradient></defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={T.border2}/>
                    <XAxis dataKey="n" tick={{fill:T.muted,fontSize:8}} interval="preserveStartEnd"/>
                    <YAxis tick={{fill:T.muted,fontSize:8}} tickFormatter={v=>`${v.toFixed(0)}%`} width={35}/>
                    <Tooltip content={<ChartTip/>}/>
                    <Area type="monotone" dataKey="dd" name="DD%" stroke={T.red} fill="url(#ddG)" strokeWidth={1.5} dot={false}/>
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div style={{background:T.panel,border:`1px solid ${T.border}`,borderRadius:4}}>
              <PH title="BEST / WORST"/>
              {stats.best ? (
                <>
                  <div style={{padding:"8px 12px",borderBottom:`1px solid ${T.border2}`}}>
                    <div style={{fontSize:8,color:T.muted,letterSpacing:1,marginBottom:3}}>▲ MEJOR TRADE</div>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:2}}>
                      <span style={{color:T.cyan,fontWeight:700}}>{stats.best.asset}</span>
                      <span style={{color:T.green,fontWeight:900}}>+${fmt(stats.best._res)}</span>
                    </div>
                    <div style={{fontSize:9,color:T.muted}}>{stats.best.exitDate} · {stats.best.strategy||"—"} · {fmtR(stats.best._rMult)}</div>
                  </div>
                  <div style={{padding:"8px 12px"}}>
                    <div style={{fontSize:8,color:T.muted,letterSpacing:1,marginBottom:3}}>▼ PEOR TRADE</div>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:2}}>
                      <span style={{color:T.cyan,fontWeight:700}}>{stats.worst.asset}</span>
                      <span style={{color:T.red,fontWeight:900}}>${fmt(stats.worst._res)}</span>
                    </div>
                    <div style={{fontSize:9,color:T.muted}}>{stats.worst.exitDate} · {stats.worst.strategy||"—"} · {fmtR(stats.worst._rMult)}</div>
                  </div>
                </>
              ) : <div style={{padding:20,color:T.muted,fontSize:10,textAlign:"center"}}>SIN DATOS — IMPORTÁ UN CSV</div>}
            </div>
          </div>
        )}

        {/* TRADES */}
        {tab==="trades" && (
          <div style={{background:T.panel,border:`1px solid ${T.border}`,borderRadius:4}}>
            <PH title={`TABLA DE TRADES`} sub={`${computed.length} operaciones`}
              right={
                <div style={{display:"flex",gap:4}}>
                  {[["all","TODOS"],["long","LONG"],["short","SHORT"]].map(([v,l])=>(
                    <button key={v} onClick={()=>setFilterDir(v)}
                      style={{background:filterDir===v?T.blue2:"transparent",border:`1px solid ${filterDir===v?T.blue:T.border}`,color:filterDir===v?"#fff":T.muted,borderRadius:3,padding:"2px 8px",cursor:"pointer",fontFamily:T.mono,fontSize:9}}>
                      {l}
                    </button>
                  ))}
                  {trades.length>0 && <button onClick={()=>{if(window.confirm("¿Borrar todo?"))saveTrades([]);}}
                    style={{background:T.redDim,border:`1px solid ${T.red}`,color:T.red,borderRadius:3,padding:"2px 8px",cursor:"pointer",fontFamily:T.mono,fontSize:9}}>LIMPIAR</button>}
                </div>
              }
            />
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
                <thead>
                  <tr style={{background:"#030e1c"}}>
                    {["F.ENTRADA","F.SALIDA","ACTIVO","TIPO","ESTRATEGIA","CAPITAL","P.ENTRADA","P.SALIDA","SL","TP","RESULT.$","RESULT.%","R-MULT","COMISIÓN","OBS","✎"].map(h=>(
                      <th key={h} style={{padding:"6px 10px",textAlign:"left",color:T.muted,fontSize:9,letterSpacing:0.8,borderBottom:`1px solid ${T.border}`,whiteSpace:"nowrap"}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.length===0 ? (
                    <tr><td colSpan={16} style={{padding:40,textAlign:"center",color:T.muted,fontSize:11}}>SIN TRADES — IMPORTÁ UN CSV O AGREGÁ MANUALMENTE CON "+ TRADE"</td></tr>
                  ) : filtered.map((t,i)=>{
                    const isOpen=!t.exitDate;
                    return (
                      <tr key={t.id} style={{borderBottom:`1px solid ${T.border2}`,background:i%2===0?"transparent":"#ffffff03"}}>
                        <td style={{padding:"6px 10px",color:T.muted,whiteSpace:"nowrap"}}>{t.entryDate||"—"}</td>
                        <td style={{padding:"6px 10px",color:isOpen?T.cyan:T.muted,whiteSpace:"nowrap"}}>{isOpen?"ABIERTO":t.exitDate}</td>
                        <td style={{padding:"6px 10px",color:T.cyan,fontWeight:700}}>{t.asset}</td>
                        <td style={{padding:"6px 10px"}}><span style={{color:/long|buy/i.test(t.direction)?T.green:T.red,fontWeight:700}}>{t.direction}</span></td>
                        <td style={{padding:"6px 10px",color:T.yellow}}>{t.strategy||"—"}</td>
                        <td style={{padding:"6px 10px",color:T.text}}>{t.capital?`$${fmt(pn(t.capital))}`:"—"}</td>
                        <td style={{padding:"6px 10px",color:T.muted}}>{t.entryPrice?fmt(pn(t.entryPrice)):"—"}</td>
                        <td style={{padding:"6px 10px",color:T.muted}}>{t.exitPrice?fmt(pn(t.exitPrice)):"—"}</td>
                        <td style={{padding:"6px 10px",color:T.red}}>{t.stopLoss?fmt(pn(t.stopLoss)):"—"}</td>
                        <td style={{padding:"6px 10px",color:T.green}}>{t.takeProfit?fmt(pn(t.takeProfit)):"—"}</td>
                        <td style={{padding:"6px 10px"}}>{t._res!=null?<Pill v={t._res}/>:"—"}</td>
                        <td style={{padding:"6px 10px"}}>{t._resPct!=null?<Pill v={t._resPct} f={fmtPct}/>:"—"}</td>
                        <td style={{padding:"6px 10px"}}>{t._rMult!=null?<Pill v={t._rMult} f={fmtR}/>:"—"}</td>
                        <td style={{padding:"6px 10px",color:T.muted}}>{t.commission?`$${fmt(pn(t.commission))}`:"—"}</td>
                        <td style={{padding:"6px 10px",color:T.muted,maxWidth:120,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={t.notes}>{t.notes||"—"}</td>
                        <td style={{padding:"6px 8px"}}>
                          <div style={{display:"flex",gap:4}}>
                            <button onClick={()=>editTrade(t)} style={{background:T.blueDim,border:"none",color:T.blue,borderRadius:2,padding:"2px 6px",cursor:"pointer",fontSize:10}}>✎</button>
                            <button onClick={()=>deleteTrade(t.id)} style={{background:T.redDim,border:"none",color:T.red,borderRadius:2,padding:"2px 6px",cursor:"pointer",fontSize:10}}>✕</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* PERÍODO */}
        {tab==="period" && (
          <div style={{background:T.panel,border:`1px solid ${T.border}`,borderRadius:4}}>
            <PH title="REPORTE POR PERÍODO"
              right={
                <div style={{display:"flex",gap:4}}>
                  {[["monthly","MENSUAL"],["annual","ANUAL"]].map(([v,l])=>(
                    <button key={v} onClick={()=>setPeriodMode(v)}
                      style={{background:periodMode===v?T.blue2:"transparent",border:`1px solid ${periodMode===v?T.blue:T.border}`,color:periodMode===v?"#fff":T.muted,borderRadius:3,padding:"2px 10px",cursor:"pointer",fontFamily:T.mono,fontSize:9}}>{l}</button>
                  ))}
                </div>
              }
            />
            <div style={{height:200,padding:"10px 4px 4px 0"}}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={periodMode==="monthly"?monthlyArr:annualArr} margin={{top:5,right:10,left:0,bottom:5}}>
                  <CartesianGrid strokeDasharray="3 3" stroke={T.border2}/>
                  <XAxis dataKey="k" tick={{fill:T.muted,fontSize:9}}/>
                  <YAxis tick={{fill:T.muted,fontSize:9}} tickFormatter={v=>`$${fmtK(v)}`} width={60}/>
                  <Tooltip content={<ChartTip/>}/>
                  <ReferenceLine y={0} stroke={T.muted}/>
                  <Bar dataKey="pnl" name="P&L" radius={[3,3,0,0]}>
                    {(periodMode==="monthly"?monthlyArr:annualArr).map((d,i)=><Cell key={i} fill={d.pnl>=0?T.green:T.red}/>)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse"}}>
                <thead>
                  <tr style={{background:"#030e1c"}}>
                    {["PERÍODO","TRADES","GANADOS","WIN RATE","P&L"].map(h=>(
                      <th key={h} style={{padding:"6px 12px",textAlign:"left",color:T.muted,fontSize:9,letterSpacing:0.8,borderBottom:`1px solid ${T.border}`}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(periodMode==="monthly"?monthlyArr:annualArr).map((r,i)=>(
                    <tr key={r.k} style={{borderBottom:`1px solid ${T.border2}`,background:i%2===0?"transparent":"#ffffff03"}}>
                      <td style={{padding:"7px 12px",color:T.blue,fontWeight:700}}>{r.k}</td>
                      <td style={{padding:"7px 12px"}}>{r.trades}</td>
                      <td style={{padding:"7px 12px",color:T.green}}>{r.wins}</td>
                      <td style={{padding:"7px 12px",color:r.wins/r.trades>=0.5?T.green:T.yellow}}>{fmt(r.wins/r.trades*100,1)}%</td>
                      <td style={{padding:"7px 12px"}}><Pill v={r.pnl}/></td>
                    </tr>
                  ))}
                  {(periodMode==="monthly"?monthlyArr:annualArr).length===0&&<tr><td colSpan={5} style={{padding:30,textAlign:"center",color:T.muted}}>SIN DATOS</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ACTIVOS */}
        {tab==="assets" && (
          <div style={{background:T.panel,border:`1px solid ${T.border}`,borderRadius:4}}>
            <PH title="REPORTE POR ACTIVO" sub={`${Object.keys(stats.byAsset).length} activos`}/>
            <div style={{height:200,padding:"10px 4px 4px 0"}}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={Object.entries(stats.byAsset).sort((a,b)=>b[1].pnl-a[1].pnl).map(([k,v])=>({k,...v}))} margin={{top:5,right:10,left:0,bottom:30}}>
                  <CartesianGrid strokeDasharray="3 3" stroke={T.border2}/>
                  <XAxis dataKey="k" tick={{fill:T.muted,fontSize:9}} angle={-30} textAnchor="end"/>
                  <YAxis tick={{fill:T.muted,fontSize:9}} tickFormatter={v=>`$${fmtK(v)}`} width={60}/>
                  <Tooltip content={<ChartTip/>}/>
                  <ReferenceLine y={0} stroke={T.muted}/>
                  <Bar dataKey="pnl" name="P&L" radius={[3,3,0,0]}>
                    {Object.entries(stats.byAsset).map(([,v],i)=><Cell key={i} fill={v.pnl>=0?T.green:T.red}/>)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse"}}>
                <thead>
                  <tr style={{background:"#030e1c"}}>
                    {["ACTIVO","TRADES","WIN RATE","P&L TOTAL"].map(h=>(
                      <th key={h} style={{padding:"6px 12px",textAlign:"left",color:T.muted,fontSize:9,borderBottom:`1px solid ${T.border}`}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(stats.byAsset).sort((a,b)=>b[1].pnl-a[1].pnl).map(([asset,v],i)=>(
                    <tr key={asset} style={{borderBottom:`1px solid ${T.border2}`,background:i%2===0?"transparent":"#ffffff03"}}>
                      <td style={{padding:"7px 12px",color:T.cyan,fontWeight:700}}>{asset}</td>
                      <td style={{padding:"7px 12px"}}>{v.trades}</td>
                      <td style={{padding:"7px 12px",color:v.wins/v.trades>=0.5?T.green:T.yellow}}>{fmt(v.wins/v.trades*100,1)}%</td>
                      <td style={{padding:"7px 12px"}}><Pill v={v.pnl}/></td>
                    </tr>
                  ))}
                  {Object.keys(stats.byAsset).length===0&&<tr><td colSpan={4} style={{padding:30,textAlign:"center",color:T.muted}}>SIN DATOS</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ESTRATEGIAS */}
        {tab==="strategies" && (
          <div style={{background:T.panel,border:`1px solid ${T.border}`,borderRadius:4}}>
            <PH title="REPORTE POR ESTRATEGIA"/>
            <div style={{height:200,padding:"10px 4px 4px 0"}}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={Object.entries(stats.byStrat).sort((a,b)=>b[1].pnl-a[1].pnl).map(([k,v])=>({k,...v}))} margin={{top:5,right:10,left:0,bottom:30}}>
                  <CartesianGrid strokeDasharray="3 3" stroke={T.border2}/>
                  <XAxis dataKey="k" tick={{fill:T.muted,fontSize:9}} angle={-20} textAnchor="end"/>
                  <YAxis tick={{fill:T.muted,fontSize:9}} tickFormatter={v=>`$${fmtK(v)}`} width={60}/>
                  <Tooltip content={<ChartTip/>}/>
                  <ReferenceLine y={0} stroke={T.muted}/>
                  <Bar dataKey="pnl" name="P&L" radius={[3,3,0,0]}>
                    {Object.entries(stats.byStrat).map(([,v],i)=><Cell key={i} fill={v.pnl>=0?T.green:T.red}/>)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse"}}>
                <thead>
                  <tr style={{background:"#030e1c"}}>
                    {["ESTRATEGIA","TRADES","WIN RATE","P&L","AVG R","EXPECTANCY"].map(h=>(
                      <th key={h} style={{padding:"6px 12px",textAlign:"left",color:T.muted,fontSize:9,borderBottom:`1px solid ${T.border}`}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(stats.byStrat).sort((a,b)=>b[1].pnl-a[1].pnl).map(([strat,v],i)=>(
                    <tr key={strat} style={{borderBottom:`1px solid ${T.border2}`,background:i%2===0?"transparent":"#ffffff03"}}>
                      <td style={{padding:"7px 12px",color:T.yellow,fontWeight:700}}>{strat}</td>
                      <td style={{padding:"7px 12px"}}>{v.trades}</td>
                      <td style={{padding:"7px 12px",color:v.wins/v.trades>=0.5?T.green:T.yellow}}>{fmt(v.wins/v.trades*100,1)}%</td>
                      <td style={{padding:"7px 12px"}}><Pill v={v.pnl}/></td>
                      <td style={{padding:"7px 12px"}}>{v.rCount?<Pill v={v.rSum/v.rCount} f={fmtR}/>:"—"}</td>
                      <td style={{padding:"7px 12px"}}><Pill v={v.pnl/v.trades}/></td>
                    </tr>
                  ))}
                  {Object.keys(stats.byStrat).length===0&&<tr><td colSpan={6} style={{padding:30,textAlign:"center",color:T.muted}}>SIN DATOS</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* RIESGO */}
        {tab==="risk" && (
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            <div style={{background:T.panel,border:`1px solid ${T.border}`,borderRadius:4}}>
              <PH title="DISTRIBUCIÓN R-MÚLTIPLES" sub={`AVG: ${fmtR(stats.avgR)}`}/>
              <div style={{height:200,padding:"10px 4px 4px 0"}}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={computed.filter(t=>t._rMult!=null).map((t,i)=>({n:t.asset||`#${i}`,r:Math.round(t._rMult*100)/100}))} margin={{top:5,right:10,left:0,bottom:5}}>
                    <CartesianGrid strokeDasharray="3 3" stroke={T.border2}/>
                    <XAxis dataKey="n" tick={{fill:T.muted,fontSize:8}} interval="preserveStartEnd"/>
                    <YAxis tick={{fill:T.muted,fontSize:8}} tickFormatter={v=>`${v}R`} width={35}/>
                    <Tooltip content={<ChartTip/>}/>
                    <ReferenceLine y={0} stroke={T.muted} strokeDasharray="4 4"/>
                    <Bar dataKey="r" name="R" radius={[2,2,0,0]}>
                      {computed.filter(t=>t._rMult!=null).map((t,i)=><Cell key={i} fill={t._rMult>=0?T.green:T.red}/>)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div style={{background:T.panel,border:`1px solid ${T.border}`,borderRadius:4}}>
              <PH title="BREAKDOWN DE RIESGO"/>
              <div style={{padding:"6px 0"}}>
                <MRow label="AVG R-MULTIPLE" value={fmtR(stats.avgR)} color={stats.avgR>=0?T.green:T.red}/>
                <MRow label="MAX DRAWDOWN" value={`-${fmt(stats.maxDD,1)}%`} color={stats.maxDD>20?T.red:T.yellow}/>
                <MRow label="RIESGO PROMEDIO/TRADE" value={`${fmt(stats.avgRiskPct)}% del capital`}/>
                <MRow label="RATIO R/R" value={fmt(stats.rr)} color={stats.rr>=1?T.green:T.yellow}/>
                <MRow label="PROFIT FACTOR" value={isFinite(stats.pf)?fmt(stats.pf):"∞"} color={stats.pf>=1.5?T.green:T.yellow}/>
                <MRow label="EXPECTANCY" value={`${sign(stats.expectancy)}$${fmt(stats.expectancy)}`} color={stats.expectancy>=0?T.green:T.red}/>
                <MRow label="PÉRDIDA BRUTA" value={`-$${fmt(stats.grossLoss)}`} color={T.red}/>
                <MRow label="GANANCIA BRUTA" value={`+$${fmt(stats.grossWin)}`} color={T.green}/>
                <div style={{padding:"10px 12px",borderTop:`1px solid ${T.border2}`,marginTop:4}}>
                  <div style={{fontSize:9,color:T.muted,marginBottom:6,letterSpacing:1}}>WIN RATE VISUAL</div>
                  <div style={{display:"flex",height:10,borderRadius:4,overflow:"hidden"}}>
                    <div style={{width:`${stats.winrate}%`,background:T.green}}/>
                    <div style={{flex:1,background:T.red}}/>
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between",marginTop:4,fontSize:9}}>
                    <span style={{color:T.green}}>{fmt(stats.winrate,1)}% ganados</span>
                    <span style={{color:T.red}}>{fmt(100-stats.winrate,1)}% perdidos</span>
                  </div>
                </div>
              </div>
            </div>
            <div style={{background:T.panel,border:`1px solid ${T.border}`,borderRadius:4,gridColumn:"span 2"}}>
              <PH title="ROI % POR TRADE"/>
              <div style={{height:160,padding:"10px 4px 4px 0"}}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={computed.filter(t=>t._resPct!=null).map((t,i)=>({n:`${t.asset||""}#${i+1}`,roi:Math.round(t._resPct*100)/100}))} margin={{top:5,right:10,left:0,bottom:5}}>
                    <CartesianGrid strokeDasharray="3 3" stroke={T.border2}/>
                    <XAxis dataKey="n" tick={{fill:T.muted,fontSize:8}} interval="preserveStartEnd"/>
                    <YAxis tick={{fill:T.muted,fontSize:8}} tickFormatter={v=>`${v}%`} width={40}/>
                    <Tooltip content={<ChartTip/>}/>
                    <ReferenceLine y={0} stroke={T.muted} strokeDasharray="4 4"/>
                    <Bar dataKey="roi" name="ROI%" radius={[2,2,0,0]}>
                      {computed.filter(t=>t._resPct!=null).map((t,i)=><Cell key={i} fill={t._resPct>=0?T.green:T.red}/>)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

        {/* OBJETIVOS */}
        {tab==="goals" && (
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            <div style={{background:T.panel,border:`1px solid ${T.border}`,borderRadius:4}}>
              <PH title="OBJETIVO DE P&L" right={<button onClick={()=>setEditObj(!editObj)} style={{background:"transparent",border:`1px solid ${T.border}`,color:T.muted,borderRadius:3,padding:"2px 8px",cursor:"pointer",fontFamily:T.mono,fontSize:9}}>EDITAR</button>}/>
              <div style={{padding:16}}>
                {editObj && (
                  <div style={{display:"flex",gap:8,marginBottom:16}}>
                    <input type="number" defaultValue={objective} id="obj-inp"
                      style={{flex:1,background:T.bg2,border:`1px solid ${T.border}`,color:T.text,borderRadius:3,padding:"6px 10px",fontFamily:T.mono}}/>
                    <button onClick={async()=>{const v=parseFloat(document.getElementById("obj-inp").value);if(!isNaN(v)){setObjective(v);try{await storage.set("bbg_obj",String(v));}catch(_){}}setEditObj(false);}}
                      style={{background:T.blue2,border:"none",color:"#fff",borderRadius:3,padding:"6px 14px",cursor:"pointer",fontFamily:T.mono,fontSize:11,fontWeight:700}}>OK</button>
                  </div>
                )}
                <div style={{marginBottom:12}}>
                  <div style={{fontSize:9,color:T.muted,marginBottom:4,letterSpacing:1}}>OBJETIVO</div>
                  <div style={{fontSize:22,color:T.yellow,fontWeight:900}}>${fmt(objective)}</div>
                </div>
                <div style={{marginBottom:12}}>
                  <div style={{fontSize:9,color:T.muted,marginBottom:4,letterSpacing:1}}>P&L ACTUAL</div>
                  <div style={{fontSize:22,color:stats.totalPnl>=0?T.green:T.red,fontWeight:900}}>{sign(stats.totalPnl)}${fmt(stats.totalPnl)}</div>
                </div>
                <div style={{marginBottom:16}}>
                  <div style={{fontSize:9,color:T.muted,marginBottom:4,letterSpacing:1}}>RESTANTE</div>
                  <div style={{fontSize:18,color:T.cyan,fontWeight:700}}>${fmt(Math.max(0,objective-stats.totalPnl))}</div>
                </div>
                <div>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:9,color:T.muted,marginBottom:6}}>
                    <span>PROGRESO</span>
                    <span style={{color:T.yellow}}>{fmt(Math.min(100,stats.totalPnl/objective*100),1)}%</span>
                  </div>
                  <div style={{height:14,background:T.border2,borderRadius:4,overflow:"hidden"}}>
                    <div style={{width:`${Math.min(100,Math.max(0,stats.totalPnl/objective*100))}%`,height:"100%",background:`linear-gradient(90deg,${T.blue2},${T.green})`,borderRadius:4,transition:"width .5s"}}/>
                  </div>
                </div>
              </div>
            </div>
            <div style={{background:T.panel,border:`1px solid ${T.border}`,borderRadius:4}}>
              <PH title="CHECKLIST DE MÉTRICAS"/>
              <div style={{padding:"6px 0"}}>
                <MRow label="WIN RATE (objetivo >50%)" value={`${fmt(stats.winrate,1)}%`} color={stats.winrate>=50?T.green:T.red}/>
                <MRow label="PROFIT FACTOR (objetivo >1.5)" value={isFinite(stats.pf)?fmt(stats.pf):"∞"} color={stats.pf>=1.5?T.green:T.red}/>
                <MRow label="AVG R (objetivo >1R)" value={fmtR(stats.avgR)} color={stats.avgR>=1?T.green:T.red}/>
                <MRow label="DRAWDOWN MÁX (objetivo <15%)" value={`${fmt(stats.maxDD,1)}%`} color={stats.maxDD<=15?T.green:T.red}/>
                <MRow label="EXPECTANCY (objetivo >0)" value={`${sign(stats.expectancy)}$${fmt(stats.expectancy)}`} color={stats.expectancy>0?T.green:T.red}/>
                <div style={{padding:"12px 12px 6px",borderTop:`1px solid ${T.border2}`,marginTop:8}}>
                  <div style={{fontSize:9,color:T.muted,marginBottom:8,letterSpacing:1}}>ESTADO</div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
                    {[["WIN RATE",stats.winrate>=50],["PROFIT FACTOR",stats.pf>=1.5],["AVG R",stats.avgR>=1],["DRAWDOWN",stats.maxDD<=15],["EXPECTANCY",stats.expectancy>0],["OBJETIVO P&L",stats.totalPnl>=objective]].map(([lbl,ok])=>(
                      <div key={lbl} style={{background:ok?T.greenDim:T.redDim,border:`1px solid ${ok?T.green:T.red}`,borderRadius:3,padding:"5px 8px",display:"flex",justifyContent:"space-between"}}>
                        <span style={{fontSize:9,color:T.muted}}>{lbl}</span>
                        <span style={{fontSize:10,color:ok?T.green:T.red,fontWeight:700}}>{ok?"✓":"✗"}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* STATUS BAR */}
      <div style={{background:"#020a14",borderTop:`1px solid ${T.border}`,padding:"3px 14px",display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0}}>
        <div style={{display:"flex",gap:16}}>
          <span style={{color:T.muted,fontSize:9}}>TRADES: <span style={{color:T.text}}>{stats.total}</span></span>
          <span style={{color:T.muted,fontSize:9}}>WIN: <span style={{color:T.green}}>{stats.wins}</span></span>
          <span style={{color:T.muted,fontSize:9}}>LOSS: <span style={{color:T.red}}>{stats.losses}</span></span>
          <span style={{color:T.muted,fontSize:9}}>ABIERTOS: <span style={{color:T.cyan}}>{stats.open}</span></span>
        </div>
        <span style={{color:T.green,fontSize:9,fontWeight:700}}>● SISTEMA ACTIVO — v2.0</span>
      </div>
    </div>
  );
}
