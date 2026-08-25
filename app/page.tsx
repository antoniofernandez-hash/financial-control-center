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
  async function reset(){ if(!email){setMsg('Escribe primero tu email.');return} const siteUrl=process.env.NEXT_PUBLIC_SITE_URL || 'https://financial-control-center-gamma.vercel.app'; const {error}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:`${siteUrl}/reset-password`}); setMsg(error?error.message:'Te he enviado el enlace de recuperación.') }
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

    <section className="section"><div className="sectionHead"><div><h2>Vista patrimonial</h2><p className="muted">La aplicación está pensada para gestión financiera integral; el riesgo Lombard es una capa de control.</p></div></div><div className="portfolioGrid">{portfolioCards.map(x=><article className="portfolioCard" key={x.p.id}><div className="cardTop"><div><h3>{x.p.name}</h3><small>{x.p.entity_type}</small></div><span>{x.p.base_currency}</span></div><div className="miniKpis"><div><span>Activos</span><b>{eur.format(x.assets)}</b></div><div><span>Deuda</span><b>{eur.format(x.debt)}</b></div><div><span>Neto</span><b>{eur.format(x.net)}</b></div><div><span>LTV</span><b>{pct(x.ltv)}</b></div></div></article>)}</div></section>

    <section className="section"><div className="sectionHead"><div><h2>Distribución por clase de activo</h2><p className="muted">Lectura rápida de diversificación y capacidad prestable.</p></div></div><div className="tableWrap"><table><thead><tr><th>Clase</th><th>Peso</th><th>Valor</th><th>Valor prestable</th></tr></thead><tbody>{classRows.map(r=><tr key={r.name}><td>{r.name}</td><td>{pct(r.weight)}</td><td>{eur.format(r.value)}</td><td>{eur.format(r.lending)}</td></tr>)}</tbody></table></div></section>

    <section className="section"><div className="sectionHead"><div><h2>Top posiciones</h2><p className="muted">Las cinco posiciones de mayor valor en la selección actual.</p></div></div><div className="tableWrap"><table><thead><tr><th>Activo</th><th>Clase</th><th>Valor</th><th>LTV aplicado</th><th>Fuente</th></tr></thead><tbody>{topPositions.map(p=>{const a=assetMap[p.asset_id];return <tr key={p.id}><td>{a?.name||p.asset_id}<small>{a?.isin||''}</small></td><td>{a?.asset_class||'—'}</td><td>{eur.format(Number(p.market_value))}</td><td>{p.applied_ltv==null?'—':pct(Number(p.applied_ltv))}</td><td>{p.source||'—'}</td></tr>})}</tbody></table></div></section>

    <section className="section"><div className="sectionHead"><div><h2>Carril de seguridad Lombard</h2><p className="muted">Cuánto puede caer el valor prestable antes de alcanzar los umbrales actuales.</p></div></div><div className="riskGrid"><article className="riskBox"><span>Caída hasta warning</span><strong>{pct(fallToWarning)}</strong><small>Umbral {pct(warning)}</small></article><article className="riskBox"><span>Caída hasta margin call</span><strong>{pct(fallToMargin)}</strong><small>Umbral {pct(margin)}</small></article><article className="riskBox"><span>Exceso de lending value</span><strong>{eur.format(Math.max(lendingValue-debt,0))}</strong><small>Sin aplicar haircuts adicionales</small></article></div></section>

    <section className="section"><div className="sectionHead"><div><h2>Stress test configurable</h2><p className="muted">Shock homogéneo sobre activos y lending value para una lectura conservadora rápida.</p></div><div className="control"><label>Caída <b>{shock}%</b></label><input type="range" min="-60" max="0" step="5" value={shock} onChange={e=>setShock(Number(e.target.value))}/></div></div><div className="riskGrid"><article><span>Activos estresados</span><strong>{eur.format(fixedStress.assets)}</strong></article><article><span>Neto estresado</span><strong>{eur.format(fixedStress.net)}</strong></article><article className={fixedStress.ltv>=margin?'danger':fixedStress.ltv>=warning?'warn':''}><span>LTV estresado</span><strong>{Number.isFinite(fixedStress.ltv)?pct(fixedStress.ltv):'—'}</strong></article></div></section>

    <section className="section"><div className="sectionHead"><div><h2>Escenarios históricos aproximados</h2><p className="muted">Plantillas orientativas, no réplica exacta de índices ni recomendación de inversión.</p></div></div><div className="scenarioGrid">{historical.map(sc=><article key={sc.name} className={sc.ltv>=margin?'danger':sc.ltv>=warning?'warn':''}><h3>{sc.name}</h3><p>{sc.description}</p><div><span>Activos</span><b>{eur.format(sc.assets)}</b></div><div><span>Neto</span><b>{eur.format(sc.net)}</b></div><div><span>LTV</span><b>{pct(sc.ltv)}</b></div></article>)}</div></section>

    <section className="section"><div className="sectionHead"><div><h2>Monte Carlo</h2><p className="muted">5.000 simulaciones correlacionadas por clase de activo; volatilidades orientativas y deuda constante.</p></div><div className="mcControls"><label>Horizonte<select value={horizon} onChange={e=>setHorizon(Number(e.target.value))}><option value={3}>3 meses</option><option value={6}>6 meses</option><option value={12}>12 meses</option><option value={24}>24 meses</option></select></label><label>Semilla<input type="number" value={mcSeed} onChange={e=>setMcSeed(Number(e.target.value)||1)}/></label></div></div><div className="riskGrid"><article className={monteCarlo.warningProb>.1?'warn':''}><span>Prob. warning</span><strong>{pct(monteCarlo.warningProb)}</strong></article><article className={monteCarlo.marginProb>.05?'danger':''}><span>Prob. margin call</span><strong>{pct(monteCarlo.marginProb)}</strong></article><article><span>VaR 95%</span><strong>{eur.format(monteCarlo.var95)}</strong></article><article><span>VaR 99%</span><strong>{eur.format(monteCarlo.var99)}</strong></article><article><span>Expected Shortfall 95%</span><strong>{eur.format(monteCarlo.es95)}</strong></article><article><span>Activos P1</span><strong>{eur.format(monteCarlo.p1Assets)}</strong></article></div></section>

    <section className="section"><div className="sectionHead"><div><h2>Calidad del dato</h2><p className="muted">Los valores pueden ser aproximados hasta consolidarlos con el documento bancario.</p></div></div><div className="quality"><span className="status approximate">APROXIMADO</span><p>Importa el informe de Julius o de otra entidad en la sección <b>Documentación</b> para consolidar posiciones y dejar trazabilidad de la fuente.</p></div></section>
  </main>
}
