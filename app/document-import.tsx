'use client'

import { ChangeEvent, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

type ImportRow = {
  id:string
  file_name:string
  status:string
  created_at:string
}

function statusLabel(status:string){
  if(status==='pending') return 'PENDIENTE DE CONCILIAR'
  if(status==='requested') return 'CONCILIACIÓN SOLICITADA'
  if(status==='reconciled') return 'CONCILIADO'
  if(status==='rolled_back') return 'POSICIÓN ANTERIOR RESTAURADA'
  return status.toUpperCase()
}

export default function DocumentImport(){
  const [session,setSession]=useState<any>(null)
  const [file,setFile]=useState<File|null>(null)
  const [busy,setBusy]=useState(false)
  const [actionId,setActionId]=useState<string|null>(null)
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

  async function requestReconciliation(id:string){
    setActionId(id); setMsg('')
    try{
      const {error}=await supabase.rpc('request_julius_reconciliation',{p_document_import_id:id})
      if(error) throw error
      setMsg('Conciliación solicitada. Se ha guardado una copia de seguridad de la posición Julius actual.')
      await loadRecent()
    }catch(e:any){ setMsg(e?.message||'No se pudo solicitar la conciliación.') }
    finally{ setActionId(null) }
  }

  async function rollback(id:string){
    if(!window.confirm('Se restaurará la posición Julius anterior a esta conciliación. ¿Continuar?')) return
    setActionId(id); setMsg('')
    try{
      const {error}=await supabase.rpc('restore_previous_julius_position',{p_document_import_id:id})
      if(error) throw error
      setMsg('Posición anterior restaurada correctamente.')
      await loadRecent()
      window.location.reload()
    }catch(e:any){ setMsg(e?.message||'No se pudo restaurar la posición anterior.') }
    finally{ setActionId(null) }
  }

  if(!session) return null
  return <section className="documentImportWrap">
    <div className="documentImportCard">
      <div className="documentImportCopy">
        <div className="eyebrow">DOCUMENTACIÓN</div>
        <h2>Importar posición Julius</h2>
        <p>Sube el PDF, Excel o CSV recibido del banco. Antes de conciliar se guarda una copia de seguridad para poder volver a la posición anterior.</p>
      </div>
      <div className="documentImportActions">
        <label className="filePicker" htmlFor="julius-file">{file?file.name:'Seleccionar archivo'}</label>
        <input id="julius-file" type="file" accept=".pdf,.csv,.xls,.xlsx,application/pdf,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={choose} />
        <button className="uploadButton" disabled={!file||busy} onClick={upload}>{busy?'Subiendo…':'Subir a Julius'}</button>
      </div>
      {msg&&<div className="importMessage">{msg}</div>}
      {recent.length>0&&<div className="recentImports">{recent.map(r=><div className="importRow" key={r.id}>
        <div className="importRowTop"><span>{r.file_name}</span><b>{statusLabel(r.status)}</b></div>
        <div className="importRowActions">
          {(r.status==='pending'||r.status==='rolled_back')&&<button className="reconcileButton" disabled={actionId===r.id} onClick={()=>requestReconciliation(r.id)}>{actionId===r.id?'Procesando…':'Conciliar ahora'}</button>}
          {(r.status==='requested'||r.status==='reconciled')&&<button className="rollbackButton" disabled={actionId===r.id} onClick={()=>rollback(r.id)}>Volver a la posición anterior</button>}
        </div>
      </div>)}</div>}
    </div>
  </section>
}
