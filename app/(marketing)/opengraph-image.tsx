import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'Bolsillo Mágico — Que el estado de cuenta no te pille por sorpresa'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

// Misma promesa que el título de Google y el H1 de la landing. A la derecha, el
// producto en una tarjeta: la misma compra antes y después del cierre, y cuándo
// se paga en cada caso. Sin fechas del calendario,
// para que la imagen no envejezca en el caché de WhatsApp.
//
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

  const display = fredoka ? 'Fredoka' : undefined

  const rows = [
    { buy: 'Compras hasta el 20', pay: 'la pagas el 5', best: false },
    { buy: 'Compras desde el 21', pay: 'la pagas un mes después', best: true },
  ]

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', padding: '0 72px', background: '#1B6DD4' }}>
        <div style={{ display: 'flex', flexDirection: 'column', width: 540 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 36 }}>
            {icon && (
              // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
              <img src={icon} width={56} height={56} style={{ borderRadius: 16 }} />
            )}
            <div style={{ fontSize: 34, color: '#FFFFFF', fontFamily: display }}>Bolsillo Mágico</div>
          </div>
          <div style={{ fontSize: 66, color: '#FFFFFF', lineHeight: 1.08, fontFamily: display }}>
            Que el estado de cuenta no te pille por sorpresa.
          </div>
          <div style={{ fontSize: 28, color: 'rgba(255,255,255,0.92)', marginTop: 26 }}>
            Hecha para Chile.
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', marginLeft: 64, width: 484, background: '#FFFFFF', borderRadius: 32, padding: 36 }}>
          <div style={{ fontSize: 26, color: '#0E2A52', fontFamily: display }}>Lo que viene · Visa</div>
          <div style={{ fontSize: 22, color: '#5B6B82', marginTop: 8 }}>Cierra el 20 · vence el 5</div>
          {rows.map(r => (
            <div key={r.buy} style={{ display: 'flex', flexDirection: 'column', marginTop: 22, padding: '20px 24px', borderRadius: 20, background: r.best ? '#E8EFFE' : '#EDF2F8' }}>
              <div style={{ fontSize: 22, color: '#5B6B82' }}>{r.buy}</div>
              <div style={{ fontSize: 34, color: r.best ? '#1B6DD4' : '#0E2A52', marginTop: 4, fontFamily: display }}>{r.pay}</div>
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size, fonts: fredoka ? [{ name: 'Fredoka', data: fredoka, weight: 600, style: 'normal' }] : [] }
  )
}
