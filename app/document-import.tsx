'use client'

import { ChangeEvent, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import './reconciliation-actions.css'

type ImportRow = {
  id:string
  file_name:string
  status:string
  created_at:string
  affected_account_ids:string[]|null
}
type AccountRow = { id:string; account_name:string }

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
  const [accounts,setAccounts]=useState<AccountRow[]>([])
  const [selectedAccounts,setSelectedAccounts]=useState<Record<string,string[]>>({})

  async function loadData(){
    const [{data:imports},{data:accountRows}]=await Promise.all([
      supabase.from('document_imports').select('id,file_name,status,created_at,affected_account_ids').order('created_at',{ascending:false}).limit(3),
      supabase.from('accounts').select('id,account_name').eq('institution','Julius Baer').order('account_name')
    ])
    const rows=(imports||[]) as ImportRow[]
    setRecent(rows)
    setAccounts((accountRows||[]) as AccountRow[])
    setSelectedAccounts(prev=>{
      const next={...prev}
      for(const r of rows){
        if(!next[r.id]?.length && r.affected_account_ids?.length) next[r.id]=r.affected_account_ids
      }
      return next
    })
  }

  useEffect(()=>{
    supabase.auth.getSession().then(({data})=>{setSession(data.session); if(data.session) loadData()})
    const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,s)=>{setSession(s); if(s) loadData(); else {setRecent([]);setAccounts([])}})
    return ()=>subscription.unsubscribe()
  },[])

  function choose(e:ChangeEvent<HTMLInputElement>){
    setMsg('')
    setFile(e.target.files?.[0]||null)
  }

  function toggleAccount(importId:string,accountId:string){
    setSelectedAccounts(prev=>{
      const current=prev[importId]||[]
      return {...prev,[importId]:current.includes(accountId)?current.filter(x=>x!==accountId):[...current,accountId]}
    })
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
      setMsg('Archivo recibido. Selecciona las cuentas incluidas antes de conciliar.')
      setFile(null)
      const input=document.getElementById('julius-file') as HTMLInputElement|null
      if(input) input.value=''
      await loadData()
    }catch(e:any){ setMsg(e?.message||'No se pudo subir el archivo.') }
    finally{ setBusy(false) }
  }

  async function requestReconciliation(id:string){
    const ids=selectedAccounts[id]||[]
    if(!ids.length){setMsg('Selecciona al menos una cuenta incluida en el archivo.');return}
    setActionId(id); setMsg('')
    try{
      const {error}=await supabase.rpc('request_julius_reconciliation',{p_document_import_id:id,p_account_ids:ids})
      if(error) throw error
      const names=accounts.filter(a=>ids.includes(a.id)).map(a=>a.account_name).join(', ')
      setMsg(`Conciliación solicitada para: ${names}. Se ha guardado una copia de seguridad solo de esas cuentas.`)
      await loadData()
    }catch(e:any){ setMsg(e?.message||'No se pudo solicitar la conciliación.') }
    finally{ setActionId(null) }
  }

  async function rollback(id:string){
    if(!window.confirm('Se restaurarán únicamente las cuentas afectadas por esta conciliación. ¿Continuar?')) return
    setActionId(id); setMsg('')
    try{
      const {error}=await supabase.rpc('restore_previous_julius_position',{p_document_import_id:id})
      if(error) throw error
      setMsg('Posición anterior restaurada correctamente solo para las cuentas afectadas.')
      await loadData()
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
        <p>El archivo puede contener una, varias o todas las cuentas. Antes de conciliar, indica cuáles aparecen realmente en el documento.</p>
      </div>
      <div className="documentImportActions">
        <label className="filePicker" htmlFor="julius-file">{file?file.name:'Seleccionar archivo'}</label>
        <input id="julius-file" type="file" accept=".pdf,.csv,.xls,.xlsx,application/pdf,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={choose} />
        <button className="uploadButton" disabled={!file||busy} onClick={upload}>{busy?'Subiendo…':'Subir a Julius'}</button>
      </div>
      {msg&&<div className="importMessage">{msg}</div>}
      {recent.length>0&&<div className="recentImports">{recent.map(r=>{
        const ids=selectedAccounts[r.id]||[]
        const locked=r.status==='requested'||r.status==='reconciled'
        return <div className="importRow" key={r.id}>
          <div className="importRowTop"><span>{r.file_name}</span><b>{statusLabel(r.status)}</b></div>
          {(r.status==='pending'||r.status==='rolled_back')&&<div className="accountScope">
            <span className="accountScopeTitle">Cuentas incluidas en este archivo</span>
            <div className="accountChoices">{accounts.map(a=><label key={a.id}><input type="checkbox" checked={ids.includes(a.id)} disabled={locked} onChange={()=>toggleAccount(r.id,a.id)}/><span>{a.account_name}</span></label>)}</div>
            <button className="selectAllAccounts" onClick={()=>setSelectedAccounts(prev=>({...prev,[r.id]:accounts.map(a=>a.id)}))}>Seleccionar todas</button>
          </div>}
          <div className="importRowActions">
            {(r.status==='pending'||r.status==='rolled_back')&&<button className="reconcileButton" disabled={actionId===r.id||!ids.length} onClick={()=>requestReconciliation(r.id)}>{actionId===r.id?'Procesando…':`Conciliar ${ids.length||''} cuenta${ids.length===1?'':'s'}`}</button>}
            {(r.status==='requested'||r.status==='reconciled')&&<button className="rollbackButton" disabled={actionId===r.id} onClick={()=>rollback(r.id)}>Volver a la posición anterior</button>}
          </div>
        </div>})}</div>}
    </div>
  </section>
}
