'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function AppSectionNav(){
  const pathname = usePathname()
  const [signedIn,setSignedIn] = useState(false)

  useEffect(()=>{
    supabase.auth.getSession().then(({data})=>setSignedIn(Boolean(data.session)))
    const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,session)=>setSignedIn(Boolean(session)))
    return ()=>subscription.unsubscribe()
  },[])

  if(!signedIn || pathname.startsWith('/reset-password')) return null

  return <nav aria-label="Secciones de la aplicación" style={{
    position:'fixed', right:16, bottom:'calc(16px + env(safe-area-inset-bottom))', zIndex:50,
    display:'flex', gap:8, padding:6, borderRadius:16,
    background:'rgba(6,21,37,.94)', border:'1px solid rgba(255,255,255,.12)',
    boxShadow:'0 12px 35px rgba(0,0,0,.28)', backdropFilter:'blur(12px)'
  }}>
    <Link href="/" aria-current={pathname==='/'?'page':undefined} style={{
      textDecoration:'none', color:pathname==='/'?'#061525':'#e5edf5',
      background:pathname==='/'?'#5eead4':'transparent', padding:'10px 12px', borderRadius:11,
      fontSize:13, fontWeight:800
    }}>Resumen</Link>
    <Link href="/documentacion" aria-current={pathname.startsWith('/documentacion')?'page':undefined} style={{
      textDecoration:'none', color:pathname.startsWith('/documentacion')?'#061525':'#e5edf5',
      background:pathname.startsWith('/documentacion')?'#5eead4':'transparent', padding:'10px 12px', borderRadius:11,
      fontSize:13, fontWeight:800
    }}>Documentación</Link>
  </nav>
}
