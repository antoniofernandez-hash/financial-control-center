import Link from 'next/link'
import DocumentImport from '../document-import'

export default function DocumentacionPage(){
  return <main className="appShell">
    <header className="topbar">
      <div>
        <div className="eyebrow">DOCUMENTACIÓN</div>
        <h1>Importar posición bancaria</h1>
        <p className="muted topSub">Carga documentos de Julius para conciliarlos con la cartera.</p>
      </div>
      <Link className="ghost" href="/">Volver</Link>
    </header>
    <DocumentImport />
  </main>
}
