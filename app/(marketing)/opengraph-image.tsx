import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'Bolsillo Mágico — Sabe cuánto vas a pagar en tu próximo estado de cuenta'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

// Fondo azul sólido (#1B6DD4, el del hero de la app: sin degradados) y el
// ícono real en vez de un emoji. Fredoka se carga desde Google Fonts; si la
// descarga falla, la tarjeta sale igual con la tipografía por defecto.
async function loadFredoka(): Promise<ArrayBuffer | null> {
  try {
    const css = await (await fetch('https://fonts.googleapis.com/css2?family=Fredoka:wght@600&display=swap')).text()
    const url = css.match(/src: url\((.+?)\) format/)?.[1]
    return url ? await (await fetch(url)).arrayBuffer() : null
  } catch { return null }
}

export default async function Image() {
  const [fredoka, icon] = await Promise.all([
    loadFredoka(),
    fetch(new URL('../../public/bolsillo-magico-icono-invertido.png', import.meta.url))
      .then(r => r.arrayBuffer())
      .then(buf => {
        let bin = ''
        for (const b of new Uint8Array(buf)) bin += String.fromCharCode(b)
        return `data:image/png;base64,${btoa(bin)}`
      })
      .catch(() => null),
  ])

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 96px', background: '#1B6DD4' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 40 }}>
          {icon && (
            // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
            <img src={icon} width={72} height={72} style={{ borderRadius: 20 }} />
          )}
          <div style={{ fontSize: 40, color: '#FFFFFF', fontFamily: fredoka ? 'Fredoka' : undefined }}>Bolsillo Mágico</div>
        </div>
        <div style={{ fontSize: 68, color: '#FFFFFF', lineHeight: 1.08, maxWidth: 960, fontFamily: fredoka ? 'Fredoka' : undefined }}>
          Sabe cuánto vas a pagar en tu próximo estado de cuenta.
        </div>
        <div style={{ fontSize: 30, color: 'rgba(255,255,255,0.92)', marginTop: 28, maxWidth: 900 }}>
          Tu tarjeta, tu sueldo y tus cobros fijos, como funcionan en Chile.
        </div>
      </div>
    ),
    { ...size, fonts: fredoka ? [{ name: 'Fredoka', data: fredoka, weight: 600, style: 'normal' }] : [] }
  )
}
