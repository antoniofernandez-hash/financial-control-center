'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { eur, pct } from '@/lib/format'

type Portfolio = { id:string; name:string; entity_type:string; base_currency:string }
type Account = { id:string; portfolio_id:string; institution:string; account_name:string; account_ref:string|null; currency:string }
type Asset = { id:string; name:string; isin:string|null; asset_class:string; region:string|null; currency:string; default_ltv:number|null }
type Position = { id:string; account_id:string; asset_id:string; as_of_date:string; market_value:number; cost_basis:number|null; lending_value:number|null; applied_ltv:number|null; source:string; source_document:string|null }
type Facility = { id:string; portfolio_id:string; facility_name:string; institution:string; principal:number; credit_limit:number|null; interest_rate:number|null; warning_ltv:number|null; margin_call_ltv:number|null; as_of_date:string }
type Snapshot = { id:string; portfolio_id:string; as_of_date:string; gross_assets:number; total_debt:number; net_worth:number; lending_value:number|null; ltv_to_lending_value:number|null }

type Scenario = { name:string; description:string; shocks:Record<string,number>; fallback:number }

const VOL: Record<string,number> = {
  cash: 0.01, monetary: 0.02, money_market: 0.02, bonds: 0.07, bond: 0.07,
  fixed_income: 0.08, equity: 0.20, equities: 0.20, stock: 0.22, stocks: 0.22,
  etf: 0.18, fund: 0.16, alternative: 0.18, alternatives: 0.18, gold: 0.16,
  commodity: 0.22, commodities: 0.22, real_estate: 0.14, crypto: 0.55,
}
const HISTORICAL: Scenario[] = [
  { name:'2008-like', description:'Plantilla aproximada de crisis financiera global.', fallback:-0.25, shocks:{equity:-0.38,equities:-0.38,stock:-0.38,stocks:-0.38,etf:-0.30,fund:-0.24,alternative:-0.20,alternatives:-0.20,bond:0.03,bonds:0.03,fixed_income:0.02,cash:0,monetary:0,money_market:0,gold:0.05}},
  { name:'COVID-like', description:'Plantilla aproximada de shock rápido de mercado.', fallback:-0.18, shocks:{equity:-0.30,equities:-0.30,stock:-0.30,stocks:-0.30,etf:-0.25,fund:-0.20,alternative:-0.18,alternatives:-0.18,bond:-0.03,bonds:-0.03,fixed_income:-0.03,cash:0,monetary:0,money_market:0,gold:-0.05}},
  { name:'2022-like', description:'Plantilla aproximada de inflación y subida de tipos.', fallback:-0.14, shocks:{equity:-0.20,equities:-0.20,stock:-0.20,stocks:-0.20,etf:-0.18,fund:-0.14,alternative:-0.12,alternatives:-0.12,bond:-0.12,bonds:-0.12,fixed_income:-0.12,cash:0,monetary:0,money_market:0,gold:-0.02}},
]

function normClass(v:string|undefined){ return (v||'other').toLowerCase().replace(/\s+/g,'_') }
function clamp(v:number,min=0,max=1){ return Math.max(min,Math.min(max,v)) }
function weightedThreshold(facilities:Facility[], key:'warning_ltv'|'margin_call_ltv', fallback:number){
  const eligible=facilities.filter(f=>Number(f.principal||0)>0 && f[key]!=null)
  const debt=eligible.reduce((s,f)=>s+Number(f.principal||0),0)
  if(!debt) return fallback
  return eligible.reduce((s,f)=>s+Number(f.principal||0)*Number(f[key]),0)/debt
}
function rng(seed:number){ let x=seed>>>0; return ()=>{ x=(1664525*x+1013904223)>>>0; return x/4294967296 } }
function normal(r:()=>number){ const u=Math.max(r(),1e-12), v=Math.max(r(),1e-12); return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v) }

function Login() {
  const [email,setEmail] = useState('')
  const [password,setPassword] = useState('')
  const [msg,setMsg] = useState('')
  const [loading,setLoading] = useState(false)
  async function submit(e:FormEvent){ e.preventDefault(); setLoading(true); setMsg(''); const {error}=await supabase.auth.signInWithPassword({email,password}); setLoading(false); if(error)setMsg(error.message) }
  async function reset(){ if(!email){setMsg('Escribe primero tu email.');return} const {error}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:`${location.origin}/reset-password`}); setMsg(error?error.message:'Te he enviado el enlace de recuperación.') }
  return <main className="loginShell"><section className="loginCard"><div className="eyebrow">PRIVATE WEALTH</div><h1>Financial Control Center</h1><p className="muted">Cartera, Lombard y riesgo en un único panel.</p><form onSubmit={submit} className="stack"><label>Email<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required /></label><label>Contraseña<input type="password" value={password} onChange={e=>setPassword(e.target.value)} required /></label><button className="primary" disabled={loading}>{loading?'Entrando…':'Entrar'}</button></form><button className="linkButton" onClick={reset}>He olvidado mi contraseña</button>{msg&&<p className="message">{msg}</p>}</section></main>
}

export default function Home(){
  const [ready,setReady]=useState(false)
  const [session,setSession]=useState<any>(null)
  const [selected,setSelected]=useState('all')
  const [horizon,setHorizon]=useState(12)
  const [mcSeed,setMcSeed]=useState(20260824)
  const [shock,setShock]=useState(-20)
  const [error,setError]=useState('')
  const [data,setData]=useState<{portfolios:Portfolio[],accounts:Account[],assets:Asset[],positions:Position[],facilities:Facility[],snapshots:Snapshot[]}>({portfolios:[],accounts:[],assets:[],positions:[],facilities:[],snapshots:[]})

  useEffect(()=>{ supabase.auth.getSession().then(({data})=>{setSession(data.session);setReady(true)}); const {data:{subscription}}=supabase.auth.onAuthStateChange((_e,s)=>setSession(s)); return ()=>subscription.unsubscribe() },[])
  useEffect(()=>{ if(!session)return; (async()=>{ const [p,a,as,pos,l,s]=await Promise.all([
    supabase.from('portfolios').select('id,name,entity_type,base_currency').order('name'),
    supabase.from('accounts').select('id,portfolio_id,institution,account_name,account_ref,currency'),
    supabase.from('assets').select('id,name,isin,asset_class,region,currency,default_ltv'),
    supabase.from('positions').select('id,account_id,asset_id,as_of_date,market_value,cost_basis,lending_value,applied_ltv,source,source_document').order('as_of_date',{ascending:false}),
    supabase.from('lombard_facilities').select('id,portfolio_id,facility_name,institution,principal,credit_limit,interest_rate,warning_ltv,margin_call_ltv,as_of_date').order('as_of_date',{ascending:false}),
    supabase.from('portfolio_snapshots').select('id,portfolio_id,as_of_date,gross_assets,total_debt,net_worth,lending_value,ltv_to_lending_value').order('as_of_date',{ascending:false}),
  ]); const anyError=[p,a,as,pos,l,s].find(x=>x.error)?.error; if(anyError){setError(anyError.message);return} setData({portfolios:p.data||[],accounts:a.data||[],assets:as.data||[],positions:pos.data||[],facilities:l.data||[],snapshots:s.data||[]}) })() },[session])

  const accountToPortfolio=useMemo(()=>Object.fromEntries(data.accounts.map(a=>[a.id,a.portfolio_id])),[data.accounts])
  const assetMap=useMemo(()=>Object.fromEntries(data.assets.map(a=>[a.id,a])),[data.assets])
  const latestDate=useMemo(()=>data.positions[0]?.as_of_date,[data.positions])
  const positions=useMemo(()=>data.positions.filter(p=>p.as_of_date===latestDate&&(selected==='all'||accountToPortfolio[p.account_id]===selected)),[data.positions,latestDate,selected,accountToPortfolio])
  const facilities=useMemo(()=>{ const grouped=new Map<string,Facility[]>(); for(const f of data.facilities){ if(selected!=='all'&&f.portfolio_id!==selected)continue; const arr=grouped.get(f.portfolio_id)||[];arr.push(f);grouped.set(f.portfolio_id,arr)} return [...grouped.values()].flatMap(arr=>{const newest=arr[0]?.as_of_date;return arr.filter(f=>f.as_of_date===newest)}) },[data.facilities,selected])

  const totalAssets=positions.reduce((s,p)=>s+Number(p.market_value||0),0)
  const lendingValue=positions.reduce((s,p)=>s+Number(p.lending_value||0),0)
  const debt=facilities.reduce((s,f)=>s+Number(f.principal||0),0)
  const net=totalAssets-debt
  const ltv=lendingValue>0?debt/lendingValue:0
  const warning=weightedThreshold(facilities,'warning_ltv',0.65)
  const margin=weightedThreshold(facilities,'margin_call_ltv',0.75)
  const fallToWarning=lendingValue>0?clamp(1-debt/(warning*lendingValue)):0
  const fallToMargin=lendingValue>0?clamp(1-debt/(margin*lendingValue)):0

  const classRows=useMemo(()=>{ const m=new Map<string,{value:number,lending:number}>(); positions.forEach(p=>{const c=assetMap[p.asset_id]?.asset_class||'Sin clasificar';const row=m.get(c)||{value:0,lending:0};row.value+=Number(p.market_value||0);row.lending+=Number(p.lending_value||0);m.set(c,row)}); return [...m.entries()].map(([name,v])=>({name,...v,weight:totalAssets?v.value/totalAssets:0})).sort((a,b)=>b.value-a.value) },[positions,assetMap,totalAssets])
  const topPositions=useMemo(()=>[...positions].sort((a,b)=>Number(b.market_value)-Number(a.market_value)).slice(0,5),[positions])

  const fixedStress=useMemo(()=>{ const factor=1+shock/100; const stressedAssets=totalAssets*factor; const stressedLending=lendingValue*factor; const stressedLtv=stressedLending>0?debt/stressedLending:Infinity; return {assets:stressedAssets,lending:stressedLending,ltv:stressedLtv,net:stressedAssets-debt} },[shock,totalAssets,lendingValue,debt])

  const historical=useMemo(()=>HISTORICAL.map(sc=>{ let assets=0,lending=0; positions.forEach(p=>{const a=assetMap[p.asset_id];const key=normClass(a?.asset_class);const s=sc.shocks[key]??sc.fallback;assets+=Number(p.market_value||0)*(1+s);lending+=Number(p.lending_value||0)*(1+s)});return {...sc,assets,lending,ltv:lending>0?debt/lending:Infinity,net:assets-debt} }),[positions,assetMap,debt])

  const monteCarlo=useMemo(()=>{
    if(!positions.length||!lendingValue) return {warningProb:0,marginProb:0,var95:0,var99:0,es95:0,p5Assets:0,p1Assets:0}
    const r=rng(mcSeed+horizon*101+(selected==='all'?7:selected.length))
    const t=horizon/12, rho=0.55, sims=5000, losses:number[]=[]; let warn=0, marg=0; const finals:number[]=[]
    for(let i=0;i<sims;i++){
      const marketZ=normal(r); let finalAssets=0,finalLending=0
      for(const p of positions){ const a=assetMap[p.asset_id];const vol=VOL[normClass(a?.asset_class)]??0.18; const z=Math.sqrt(rho)*marketZ+Math.sqrt(1-rho)*normal(r); const ret=Math.exp(-0.5*vol*vol*t+vol*Math.sqrt(t)*z)-1; finalAssets+=Number(p.market_value||0)*(1+ret); finalLending+=Number(p.lending_value||0)*(1+ret) }
      const simLtv=finalLending>0?debt/finalLending:Infinity; if(simLtv>=warning)warn++; if(simLtv>=margin)marg++; finals.push(finalAssets); losses.push(Math.max(0,totalAssets-finalAssets))
    }
    finals.sort((a,b)=>a-b); losses.sort((a,b)=>a-b); const q=(arr:number[],p:number)=>arr[Math.min(arr.length-1,Math.floor(p*(arr.length-1)))]||0; const v95=q(losses,.95),v99=q(losses,.99); const tail=losses.filter(x=>x>=v95); return {warningProb:warn/sims,marginProb:marg/sims,var95:v95,var99:v99,es95:tail.reduce((s,x)=>s+x,0)/(tail.length||1),p5Assets:q(finals,.05),p1Assets:q(finals,.01)}
  },[positions,assetMap,lendingValue,debt,warning,margin,totalAssets,horizon,mcSeed,selected])

  const portfolioCards=useMemo(()=>data.portfolios.map(p=>{ const accountIds=data.accounts.filter(a=>a.portfolio_id===p.id).map(a=>a.id); const pp=data.positions.filter(x=>x.as_of_date===latestDate&&accountIds.includes(x.account_id)); const pf=data.facilities.filter(f=>f.portfolio_id===p.id); const latestF=pf[0]?.as_of_date; const ff=pf.filter(f=>f.as_of_date===latestF); const assets=pp.reduce((s,x)=>s+Number(x.market_value||0),0); const lend=pp.reduce((s,x)=>s+Number(x.lending_value||0),0); const d=ff.reduce((s,x)=>s+Number(x.principal||0),0); return {p,assets,lend,debt:d,net:assets-d,ltv:lend?d/lend:0} }),[data,latestDate])

  if(!ready)return <div className="center">Cargando…</div>
  if(!session)return <Login />
  return <main className="appShell">
    <header className="topbar"><div><div className="eyebrow">PRIVATE WEALTH</div><h1>Financial Control Center</h1><p className="muted topSub">Patrimonio, financiación y carril de seguridad Lombard</p></div><button className="ghost" onClick={()=>supabase.auth.signOut()}>Cerrar sesión</button></header>
    <section className="toolbar"><div><span className="muted">Cartera</span><select value={selected} onChange={e=>setSelected(e.target.value)}><option value="all">Consolidado</option>{data.portfolios.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></div><div className="dateBadge">Posición {latestDate||'—'}</div></section>
    {error&&<div className="error">{error}</div>}

    <section className="kpis six">
      <article><span>Activos</span><strong>{eur.format(totalAssets)}</strong></article>
      <article><span>Deuda Lombard</span><strong>{eur.format(debt)}</strong></article>
      <article><span>Patrimonio neto</span><strong>{eur.format(net)}</strong></article>
      <article><span>Valor prestable</span><strong>{eur.format(lendingValue)}</strong></article>
      <article className={ltv>=warning?'danger':ltv>=warning*.8?'warn':''}><span>LTV actual</span><strong>{pct(ltv)}</strong><small>Warning {pct(warning)}</small></article>
      <article><span>Colchón de garantía</span><strong>{eur.format(Math.max(lendingValue-debt,0))}</strong><small>Antes de agotar lending value</small></article>
    </section>

    <section className="grid2">
      <article className="panel"><div className="panelHeader"><h2>Posiciones</h2><span>{positions.length} líneas</span></div><div className="tableWrap"><table><thead><tr><th>Activo</th><th>Clase</th><th className="right">Valor</th><th className="right">Peso</th><th className="right">LTV</th><th className="right">Garantía</th></tr></thead><tbody>{[...positions].sort((a,b)=>Number(b.market_value)-Number(a.market_value)).map(p=>{const a=assetMap[p.asset_id];return <tr key={p.id}><td><b>{a?.name||'Activo'}</b><small>{a?.isin||p.source_document||''}</small></td><td>{a?.asset_class||'—'}</td><td className="right">{eur.format(Number(p.market_value))}</td><td className="right">{pct(totalAssets?Number(p.market_value)/totalAssets:0)}</td><td className="right">{pct(p.applied_ltv)}</td><td className="right">{p.lending_value?eur.format(Number(p.lending_value)):'—'}</td></tr>})}</tbody></table></div></article>
      <article className="panel"><div className="panelHeader"><h2>Financiación Lombard</h2><span>{facilities.length} líneas actuales</span></div><div className="facilityList">{facilities.length?facilities.map(f=><div className="facility" key={f.id}><div><b>{f.facility_name}</b><small>{f.institution} · {f.as_of_date}</small></div><div className="right"><strong>{eur.format(Number(f.principal))}</strong><small>{f.interest_rate?`${f.interest_rate}%`:'tipo pendiente'} · W {pct(f.warning_ltv)} · MC {pct(f.margin_call_ltv)}</small></div></div>):<p className="muted">Sin líneas actuales.</p>}</div><div className="riskBox"><span>Caída proporcional hasta warning</span><strong>{pct(fallToWarning)}</strong><small>Hasta margin call: {pct(fallToMargin)}</small></div></article>
    </section>

    <section className="panel"><div className="panelHeader"><h2>Concentración</h2><span>Distribución de la posición actual</span></div><div className="concentrationGrid"><div>{classRows.map(r=><div className="barRow" key={r.name}><div className="barLabel"><b>{r.name}</b><span>{eur.format(r.value)} · {pct(r.weight)}</span></div><div className="barTrack"><i style={{width:`${Math.max(2,r.weight*100)}%`}} /></div></div>)}</div><div><h3>Top 5 posiciones</h3>{topPositions.map(p=><div className="topLine" key={p.id}><div><b>{assetMap[p.asset_id]?.name||'Activo'}</b><small>{assetMap[p.asset_id]?.asset_class||''}</small></div><span>{pct(totalAssets?Number(p.market_value)/totalAssets:0)}</span></div>)}</div></div></section>

    <section className="riskLab">
      <div className="sectionTitle"><div><div className="eyebrow">LOMBARD RISK LAB</div><h2>Carril de seguridad</h2></div><p>Los escenarios no alteran los datos reales. Son simulaciones sobre la posición actual.</p></div>
      <div className="riskGrid">
        <article className="panel"><div className="panelHeader"><h2>Reverse Stress Test</h2><span>¿Cuánto puede caer?</span></div><div className="bigMetric"><span>Hasta warning</span><strong>{pct(fallToWarning)}</strong></div><div className="splitMetric"><div><span>Hasta margin call</span><b>{pct(fallToMargin)}</b></div><div><span>LTV actual</span><b>{pct(ltv)}</b></div></div><div className="thresholdTrack"><i style={{width:`${Math.min(100,(ltv/Math.max(margin,.01))*100)}%`}} /><em style={{left:`${Math.min(100,(warning/Math.max(margin,.01))*100)}%`}}>W</em><em style={{left:'98%'}}>MC</em></div><small className="muted">Umbrales ponderados por deuda; si una línea no tiene umbral cargado se usa 65%/75% como fallback de simulación.</small></article>

        <article className="panel"><div className="panelHeader"><h2>Stress Test fijo</h2><span>Shock uniforme</span></div><div className="shockButtons">{[-10,-20,-30,-40].map(v=><button key={v} className={shock===v?'active':''} onClick={()=>setShock(v)}>{v}%</button>)}</div><div className="stressResult"><div><span>Activos</span><b>{eur.format(fixedStress.assets)}</b></div><div><span>Patrimonio neto</span><b>{eur.format(fixedStress.net)}</b></div><div><span>LTV resultante</span><b className={fixedStress.ltv>=margin?'bad':fixedStress.ltv>=warning?'caution':''}>{Number.isFinite(fixedStress.ltv)?pct(fixedStress.ltv):'∞'}</b></div></div></article>

        <article className="panel wide"><div className="panelHeader"><h2>Monte Carlo</h2><span>5.000 trayectorias · modelo simplificado</span></div><div className="mcControls"><label>Horizonte<select value={horizon} onChange={e=>setHorizon(Number(e.target.value))}><option value={3}>3 meses</option><option value={6}>6 meses</option><option value={12}>12 meses</option></select></label><button className="ghost" onClick={()=>setMcSeed(Date.now()%2147483647)}>Nueva simulación</button></div><div className="mcGrid"><div><span>Prob. warning</span><strong className={monteCarlo.warningProb>.1?'caution':''}>{pct(monteCarlo.warningProb)}</strong></div><div><span>Prob. margin call</span><strong className={monteCarlo.marginProb>.05?'bad':''}>{pct(monteCarlo.marginProb)}</strong></div><div><span>VaR 95%</span><strong>{eur.format(monteCarlo.var95)}</strong></div><div><span>VaR 99%</span><strong>{eur.format(monteCarlo.var99)}</strong></div><div><span>Expected Shortfall 95%</span><strong>{eur.format(monteCarlo.es95)}</strong></div><div><span>Activos p5</span><strong>{eur.format(monteCarlo.p5Assets)}</strong></div></div><small className="muted">Modelo orientativo: volatilidades por clase de activo y correlación común del 55%. No es una predicción ni sustituye los parámetros contractuales del banco.</small></article>

        <article className="panel wide"><div className="panelHeader"><h2>Historical Stress</h2><span>Plantillas aproximadas</span></div><div className="scenarioGrid">{historical.map(s=><div className="scenario" key={s.name}><div><b>{s.name}</b><small>{s.description}</small></div><div className="scenarioNumbers"><span>Activos <b>{eur.format(s.assets)}</b></span><span>Net worth <b>{eur.format(s.net)}</b></span><span>LTV <b className={s.ltv>=margin?'bad':s.ltv>=warning?'caution':''}>{Number.isFinite(s.ltv)?pct(s.ltv):'∞'}</b></span></div></div>)}</div><small className="muted">Son plantillas de estrés inspiradas en episodios históricos, no una reproducción exacta de rentabilidades históricas de cada activo.</small></article>
      </div>
    </section>

    <section className="panel"><div className="panelHeader"><h2>Carteras</h2><span>Comparativa consolidada</span></div><div className="portfolioCards">{portfolioCards.map(({p,assets,debt:pd,net:pn,ltv:pl})=><button className="miniCard portfolioButton" key={p.id} onClick={()=>setSelected(p.id)}><span>{p.entity_type==='company'?'Sociedad':'Personal'}</span><b>{p.name}</b><strong>{eur.format(pn)}</strong><small>Activos {eur.format(assets)} · Deuda {eur.format(pd)} · LTV {pct(pl)}</small></button>)}</div></section>
  </main>
}
