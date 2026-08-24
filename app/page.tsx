'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { eur, pct } from '@/lib/format'

type Portfolio = { id:string; name:string; entity_type:string; base_currency:string }
type Account = { id:string; portfolio_id:string; institution:string; account_name:string; account_ref:string|null; currency:string }
type Asset = { id:string; name:string; isin:string|null; asset_class:string; currency:string; default_ltv:number|null }
type Position = { id:string; account_id:string; asset_id:string; as_of_date:string; market_value:number; cost_basis:number|null; lending_value:number|null; applied_ltv:number|null; source:string; source_document:string|null }
type Facility = { id:string; portfolio_id:string; facility_name:string; institution:string; principal:number; credit_limit:number|null; interest_rate:number|null; as_of_date:string }
type Snapshot = { id:string; portfolio_id:string; as_of_date:string; gross_assets:number; total_debt:number; net_worth:number; lending_value:number|null; ltv_to_lending_value:number|null }

function Login() {
  const [email,setEmail] = useState('')
  const [password,setPassword] = useState('')
  const [msg,setMsg] = useState('')
  const [loading,setLoading] = useState(false)
  async function submit(e:FormEvent){
    e.preventDefault(); setLoading(true); setMsg('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false); if(error) setMsg(error.message)
  }
  async function reset(){
    if(!email){ setMsg('Escribe primero tu email.'); return }
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/reset-password` })
    setMsg(error ? error.message : 'Te he enviado el enlace de recuperación.')
  }
  return <main className="loginShell"><section className="loginCard">
    <div className="eyebrow">PRIVATE WEALTH</div><h1>Financial Control Center</h1>
    <p className="muted">Cartera, Lombard y riesgo en un único panel.</p>
    <form onSubmit={submit} className="stack">
      <label>Email<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required /></label>
      <label>Contraseña<input type="password" value={password} onChange={e=>setPassword(e.target.value)} required /></label>
      <button className="primary" disabled={loading}>{loading?'Entrando…':'Entrar'}</button>
    </form>
    <button className="linkButton" onClick={reset}>He olvidado mi contraseña</button>
    {msg && <p className="message">{msg}</p>}
  </section></main>
}

export default function Home(){
  const [ready,setReady]=useState(false)
  const [session,setSession]=useState<any>(null)
  const [data,setData]=useState<{portfolios:Portfolio[],accounts:Account[],assets:Asset[],positions:Position[],facilities:Facility[],snapshots:Snapshot[]}>({portfolios:[],accounts:[],assets:[],positions:[],facilities:[],snapshots:[]})
  const [selected,setSelected]=useState<string>('all')
  const [error,setError]=useState('')

  useEffect(()=>{
    supabase.auth.getSession().then(({data})=>{setSession(data.session);setReady(true)})
    const {data:{subscription}}=supabase.auth.onAuthStateChange((_e,s)=>setSession(s))
    return ()=>subscription.unsubscribe()
  },[])

  useEffect(()=>{
    if(!session) return
    ;(async()=>{
      const [p,a,as,pos,l,s] = await Promise.all([
        supabase.from('portfolios').select('id,name,entity_type,base_currency').order('name'),
        supabase.from('accounts').select('id,portfolio_id,institution,account_name,account_ref,currency'),
        supabase.from('assets').select('id,name,isin,asset_class,currency,default_ltv'),
        supabase.from('positions').select('id,account_id,asset_id,as_of_date,market_value,cost_basis,lending_value,applied_ltv,source,source_document').order('as_of_date',{ascending:false}),
        supabase.from('lombard_facilities').select('id,portfolio_id,facility_name,institution,principal,credit_limit,interest_rate,as_of_date').order('as_of_date',{ascending:false}),
        supabase.from('portfolio_snapshots').select('id,portfolio_id,as_of_date,gross_assets,total_debt,net_worth,lending_value,ltv_to_lending_value').order('as_of_date',{ascending:false}),
      ])
      const anyError=[p,a,as,pos,l,s].find(x=>x.error)?.error
      if(anyError){setError(anyError.message);return}
      setData({portfolios:p.data||[],accounts:a.data||[],assets:as.data||[],positions:pos.data||[],facilities:l.data||[],snapshots:s.data||[]})
    })()
  },[session])

  const accountToPortfolio=useMemo(()=>Object.fromEntries(data.accounts.map(a=>[a.id,a.portfolio_id])),[data.accounts])
  const assetMap=useMemo(()=>Object.fromEntries(data.assets.map(a=>[a.id,a])),[data.assets])
  const latestDate=useMemo(()=>data.positions[0]?.as_of_date,[data.positions])
  const positions=useMemo(()=>data.positions.filter(p=>p.as_of_date===latestDate && (selected==='all'||accountToPortfolio[p.account_id]===selected)),[data.positions,latestDate,selected,accountToPortfolio])
  const facilities=useMemo(()=>{
    const byPortfolio=new Map<string,Facility[]>()
    for(const f of data.facilities){ if(selected!=='all'&&f.portfolio_id!==selected) continue; const arr=byPortfolio.get(f.portfolio_id)||[]; arr.push(f); byPortfolio.set(f.portfolio_id,arr) }
    return [...byPortfolio.values()].flatMap(arr=>{ const newest=arr[0]?.as_of_date; return arr.filter(f=>f.as_of_date===newest) })
  },[data.facilities,selected])
  const totalAssets=positions.reduce((s,p)=>s+Number(p.market_value||0),0)
  const lendingValue=positions.reduce((s,p)=>s+Number(p.lending_value||0),0)
  const debt=facilities.reduce((s,f)=>s+Number(f.principal||0),0)
  const net=totalAssets-debt
  const ltv=lendingValue>0?debt/lendingValue:0

  if(!ready) return <div className="center">Cargando…</div>
  if(!session) return <Login />
  return <main className="appShell">
    <header className="topbar"><div><div className="eyebrow">PRIVATE WEALTH</div><h1>Financial Control Center</h1></div><button className="ghost" onClick={()=>supabase.auth.signOut()}>Cerrar sesión</button></header>
    <section className="toolbar"><div><span className="muted">Cartera</span><select value={selected} onChange={e=>setSelected(e.target.value)}><option value="all">Consolidado</option>{data.portfolios.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></div><div className="dateBadge">Posición {latestDate||'—'}</div></section>
    {error&&<div className="error">{error}</div>}
    <section className="kpis">
      <article><span>Activos</span><strong>{eur.format(totalAssets)}</strong></article>
      <article><span>Deuda Lombard</span><strong>{eur.format(debt)}</strong></article>
      <article><span>Patrimonio neto</span><strong>{eur.format(net)}</strong></article>
      <article><span>Valor prestable</span><strong>{eur.format(lendingValue)}</strong></article>
      <article className={ltv>.6?'danger':ltv>.45?'warn':''}><span>LTV / lending value</span><strong>{pct(ltv)}</strong></article>
    </section>
    <section className="grid2">
      <article className="panel"><div className="panelHeader"><h2>Posiciones</h2><span>{positions.length} líneas</span></div><div className="tableWrap"><table><thead><tr><th>Activo</th><th>Clase</th><th className="right">Valor</th><th className="right">Coste</th><th className="right">LTV</th><th className="right">Garantía</th></tr></thead><tbody>{positions.sort((a,b)=>b.market_value-a.market_value).map(p=>{const a=assetMap[p.asset_id];return <tr key={p.id}><td><b>{a?.name||'Activo'}</b><small>{a?.isin||p.source_document||''}</small></td><td>{a?.asset_class||'—'}</td><td className="right">{eur.format(Number(p.market_value))}</td><td className="right">{p.cost_basis?eur.format(Number(p.cost_basis)):'—'}</td><td className="right">{pct(p.applied_ltv)}</td><td className="right">{p.lending_value?eur.format(Number(p.lending_value)):'—'}</td></tr>})}</tbody></table></div></article>
      <article className="panel"><div className="panelHeader"><h2>Financiación Lombard</h2><span>{facilities.length} líneas actuales</span></div><div className="facilityList">{facilities.length?facilities.map(f=><div className="facility" key={f.id}><div><b>{f.facility_name}</b><small>{f.institution} · {f.as_of_date}</small></div><div className="right"><strong>{eur.format(Number(f.principal))}</strong><small>{f.interest_rate?`${f.interest_rate}%`:'tipo pendiente'}</small></div></div>):<p className="muted">Sin líneas actuales para esta cartera.</p>}</div>
      <div className="riskBox"><span>Capacidad antes de agotar garantía</span><strong>{eur.format(Math.max(lendingValue-debt,0))}</strong><small>Indicador operativo. El umbral contractual real debe configurarse por línea.</small></div></article>
    </section>
    <section className="panel"><div className="panelHeader"><h2>Carteras</h2><span>Backend Supabase activo</span></div><div className="portfolioCards">{data.portfolios.map(p=>{const snap=data.snapshots.find(s=>s.portfolio_id===p.id);return <div className="miniCard" key={p.id}><span>{p.entity_type==='company'?'Sociedad':'Personal'}</span><b>{p.name}</b><small>{snap?`Último snapshot: ${eur.format(Number(snap.net_worth))}`:'Sin snapshot consolidado'}</small></div>})}</div></section>
  </main>
}
