import { ImageResponse } from 'next/og'

export const runtime = 'edge'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const size = Math.min(1024, Math.max(128, Number(searchParams.get('size') || 512)))
  const maskable = searchParams.get('maskable') === '1'
  const pad = maskable ? 52 : 18

  return new ImageResponse(
    <div style={{
      width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#061525', borderRadius: `${Math.round(size*0.22)}px`, padding: `${pad}px`,
      fontFamily: 'sans-serif'
    }}>
      <div style={{position:'relative', width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center'}}>
        <div style={{position:'absolute', inset:'8%', border:'14px solid #0f766e', borderRadius:'50%'}} />
        <div style={{position:'absolute', inset:'15%', border:'4px solid #22d3ee', borderRadius:'50%', opacity:.55}} />
        <div style={{position:'absolute', width:'55%', height:'62%', border:'13px solid #f8fafc', borderRadius:'28% 28% 38% 38% / 22% 22% 45% 45%', transform:'translateY(2%)'}} />
        <div style={{position:'absolute', bottom:'27%', left:'35%', width:'8%', height:'19%', background:'#14b8a6', borderRadius:'6px 6px 0 0'}} />
        <div style={{position:'absolute', bottom:'27%', left:'47%', width:'8%', height:'27%', background:'#14b8a6', borderRadius:'6px 6px 0 0'}} />
        <div style={{position:'absolute', bottom:'27%', left:'59%', width:'8%', height:'38%', background:'#2dd4bf', borderRadius:'6px 6px 0 0'}} />
        <div style={{position:'absolute', left:'34%', top:'49%', width:'34%', height:'8%', background:'#f6d68a', transform:'rotate(-39deg)', borderRadius:'999px'}} />
        <div style={{position:'absolute', left:'55%', top:'38%', width:'19%', height:'8%', background:'#f6d68a', transform:'rotate(10deg)', clipPath:'polygon(0 0,100% 50%,0 100%)'}} />
      </div>
    </div>,
    { width: size, height: size }
  )
}
