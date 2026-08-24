'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

type Status = {
  label: 'OFICIAL' | 'ESTIMADA' | 'PENDIENTE'
  date: string | null
  source: string
}

export default function ValuationStatus(){
  const [status,setStatus]=useState<Status|null>(null)

  useEffect(()=>{
    let cancelled=false
    async function load(){
      const {data:{session}}=await supabase.auth.getSession()
      if(!session || cancelled) return
      const {data,error}=await supabase
        .from('positions')
        .select('valuation_status,price_source,official_as_of_date,price_as_of,as_of_date')
        .order('as_of_date',{ascending:false})
        .limit(50)
      if(error || !data?.length || cancelled) return
      const latest=data[0].as_of_date
      const rows=data.filter((r:any)=>r.as_of_date===latest)
      const states=new Set(rows.map((r:any)=>r.valuation_status))
      const label: Status['label']=states.has('pending')?'PENDIENTE':states.has('estimated')?'ESTIMADA':'OFICIAL'
      const first:any=rows[0]
      const date=(label==='OFICIAL'?first.official_as_of_date:first.price_as_of?.slice(0,10)) || first.as_of_date || null
      const source=label==='OFICIAL'?'Julius Baer':(first.price_source || 'Mercado')
      setStatus({label,date,source})
    }
    load()
    const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,session)=>{ if(session) load(); else setStatus(null) })
    return ()=>{cancelled=true;subscription.unsubscribe()}
  },[])

  if(!status) return null
  return <div className={`valuationBanner valuation-${status.label.toLowerCase()}`}>
    <div><strong>Valoración {status.label}</strong><span>{status.source}</span></div>
    <div><small>Fecha de valoración</small><b>{status.date || '—'}</b></div>
  </div>
}
