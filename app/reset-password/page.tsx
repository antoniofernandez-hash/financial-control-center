'use client'
import { FormEvent, useState } from 'react'
import { supabase } from '@/lib/supabase'
export default function Reset(){
  const [password,setPassword]=useState(''); const [msg,setMsg]=useState('')
  async function submit(e:FormEvent){e.preventDefault(); const {error}=await supabase.auth.updateUser({password}); setMsg(error?error.message:'Contraseña actualizada. Ya puedes volver al inicio.')}
  return <main className="loginShell"><section className="loginCard"><div className="eyebrow">SECURITY</div><h1>Nueva contraseña</h1><form onSubmit={submit} className="stack"><label>Nueva contraseña<input type="password" minLength={8} value={password} onChange={e=>setPassword(e.target.value)} required /></label><button className="primary">Guardar contraseña</button></form>{msg&&<p className="message">{msg}</p>}<a className="back" href="/">Volver al inicio</a></section></main>
}
