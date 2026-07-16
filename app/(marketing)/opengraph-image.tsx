import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'Bolsillo Mágico — Control de gastos personales'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#2B7CF6',
          backgroundImage: 'radial-gradient(circle at 80% 20%, rgba(77,147,255,.5), transparent 55%), radial-gradient(circle at 10% 90%, rgba(21,83,176,.6), transparent 55%)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 20,
            marginBottom: 28,
          }}
        >
          <div
            style={{
              width: 76,
              height: 76,
              borderRadius: 22,
              background: 'rgba(255,255,255,.16)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 44,
            }}
          >
            👛
          </div>
          <div style={{ fontSize: 40, fontWeight: 700, color: '#fff' }}>Bolsillo Mágico</div>
        </div>
        <div
          style={{
            fontSize: 64,
            fontWeight: 700,
            color: '#fff',
            textAlign: 'center',
            lineHeight: 1.1,
            maxWidth: 900,
          }}
        >
          Tu plata, bajo control.
        </div>
        <div
          style={{
            fontSize: 28,
            color: 'rgba(255,255,255,.8)',
            marginTop: 24,
            textAlign: 'center',
            maxWidth: 780,
          }}
        >
          Registra gastos, analiza tus hábitos y controla suscripciones. Gratis.
        </div>
      </div>
    ),
    { ...size }
  )
}
