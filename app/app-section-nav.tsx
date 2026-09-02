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

  return <nav className="appSectionNav" aria-label="Secciones de la aplicación">
    <Link className={pathname==='/'?'active':''} href="/" aria-current={pathname==='/'?'page':undefined}>Resumen</Link>
    <Link className={pathname.startsWith('/documentacion')?'active':''} href="/documentacion" aria-current={pathname.startsWith('/documentacion')?'page':undefined}>Documentación</Link>
  </nav>
}
