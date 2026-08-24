'use client'

import { ChangeEvent, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

type ImportRow = {
  id:string
  file_name:string
  status:string
  created_at:string
}

export default function DocumentImport(){
  const [session,setSession]=useState<any>(null)
  const [file,setFile]=useState<File|null>(null)
  const [busy,setBusy]=useState(false)
  const [msg,setMsg]=useState('')
  const [recent,setRecent]=useState<ImportRow[]>([])

  async function loadRecent(){
    const {data}=await supabase.from('document_imports').select('id,file_name,status,created_at').order('created_at',{ascending:false}).limit(3)
    setRecent((data||[]) as ImportRow[])
  }

  useEffect(()=>{
    supabase.auth.getSession().then(({data})=>{setSession(data.session); if(data.session) loadRecent()})
    const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,s)=>{setSession(s); if(s) loadRecent(); else setRecent([])})
    return ()=>subscription.unsubscribe()
  },[])

  function choose(e:ChangeEvent<HTMLInputElement>){
    setMsg('')
    setFile(e.target.files?.[0]||null)
  }

  async function upload(){
    if(!session?.user?.id || !file) return
    setBusy(true); setMsg('')
    try{
      const ext=(file.name.split('.').pop()||'file').toLowerCase()
      const allowed=['pdf','csv','xls','xlsx']
      if(!allowed.includes(ext)) throw new Error('Formato no admitido. Usa PDF, CSV, XLS o XLSX.')
      if(file.size>20*1024*1024) throw new Error('El archivo supera el límite de 20 MB.')
      const safeName=file.name.replace(/[^a-zA-Z0-9._-]+/g,'_')
      const path=`${session.user.id}/${Date.now()}-${safeName}`
      const {error:storageError}=await supabase.storage.from('julius-documents').upload(path,file,{upsert:false,contentType:file.type||undefined})
      if(storageError) throw storageError
      const {error:dbError}=await supabase.from('document_imports').insert({
        user_id:session.user.id,
        institution:'Julius Baer',
        file_name:file.name,
        storage_path:path,
        mime_type:file.type||null,
        file_size:file.size,
        status:'pending'
      })
      if(dbError){ await supabase.storage.from('julius-documents').remove([path]); throw dbError }
      setMsg('Archivo recibido. Queda pendiente de conciliación.')
      setFile(null)
      const input=document.getElementById('julius-file') as HTMLInputElement|null
      if(input) input.value=''
      await loadRecent()
    }catch(e:any){ setMsg(e?.message||'No se pudo subir el archivo.') }
    finally{ setBusy(false) }
  }

  if(!session) return null
  return <section className="documentImportWrap">
    <div className="documentImportCard">
      <div className="documentImportCopy">
        <div className="eyebrow">DOCUMENTACIÓN</div>
        <h2>Importar posición Julius</h2>
        <p>Sube el PDF, Excel o CSV recibido del banco. Se guardará como documento privado y quedará pendiente de conciliación antes de convertirse en dato oficial.</p>
      </div>
      <div className="documentImportActions">
        <label className="filePicker" htmlFor="julius-file">{file?file.name:'Seleccionar archivo'}</label>
        <input id="julius-file" type="file" accept=".pdf,.csv,.xls,.xlsx,application/pdf,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={choose} />
        <button className="uploadButton" disabled={!file||busy} onClick={upload}>{busy?'Subiendo…':'Subir a Julius'}</button>
      </div>
      {msg&&<div className="importMessage">{msg}</div>}
      {recent.length>0&&<div className="recentImports">{recent.map(r=><div key={r.id}><span>{r.file_name}</span><b>{r.status==='pending'?'PENDIENTE DE CONCILIAR':r.status.toUpperCase()}</b></div>)}</div>}
    </div>
  </section>
}
