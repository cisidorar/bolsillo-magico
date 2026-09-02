import type { Metadata, Viewport } from 'next'
import { Fredoka, Plus_Jakarta_Sans } from 'next/font/google'
import './globals.css'
import ThemeProvider from '@/components/ThemeProvider'
import ToastProvider from '@/components/ToastProvider'
import { getServerSession, createClient } from '@/lib/supabase/server'

const fredoka = Fredoka({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-fredoka' })
const jakarta = Plus_Jakarta_Sans({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800'], variable: '--font-jakarta' })

export const metadata: Metadata = {
  metadataBase: new URL('https://bolsillomagico.com'),
  title: {
    default: 'Bolsillo Mágico',
    template: '%s · Bolsillo Mágico',
  },
  description: 'Uso personal.',
  manifest: '/manifest.json',
  // sep 2026 (Cas: "el icono es la version blanca" al crear el acceso directo
  // desde Chrome en Android): el manifest apuntaba al PNG *invertido* (fondo
  // blanco), de 128px y marcado "any maskable" a la vez. Tres problemas
  // juntos: (1) el ícono equivocado, (2) 128px queda por debajo del mínimo
  // que Chrome pide para instalar (192) y lo obliga a escalar, y (3)
  // "maskable" hace que Android recorte ~20% del borde y rellene las esquinas
  // transparentes — por eso además se veía blanco alrededor. Ahora van
  // separados: "any" con las esquinas redondeadas propias, y "maskable"
  // full-bleed con el arte encogido para sobrevivir el recorte.
  //
  // apple-touch-icon va acá y no en el manifest porque iOS lo ignora: usa
  // este <link>, y sin transparencia (si la hay, pone negro detrás).
  icons: {
    icon: [
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Bolsillo Mágico' },
  // A2 (roadmap uso personal, jul 2026): la app dejó de ser pública — que
  // desaparezca de buscadores. robots.ts ya bloquea todo el rastreo; esto
  // además marca cada página con el meta noindex para navegadores/crawlers
  // que no respeten robots.txt.
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#2B7CF6',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Read theme from DB so it syncs across devices (SSR — no flash)
  let serverTheme: 'dark' | '' = ''
  try {
    const user = await getServerSession()
    if (user) {
      const supabase = await createClient()
      const { data } = await supabase
        .from('profiles')
        .select('theme')
        .eq('id', user.id)
        .maybeSingle()
      if (data?.theme === 'dark') serverTheme = 'dark'
    }
  } catch (err) {
    // Graceful fallback — ThemeProvider will use localStorage. Loggeado (antes
    // era 100% silencioso) para poder diagnosticar reportes de "el modo
    // oscuro no sincronizó" sin tener que reproducirlos a ciegas.
    console.error('[theme] no se pudo leer profiles.theme para SSR', err)
  }

  return (
    <html lang="es" className={serverTheme} suppressHydrationWarning>
      <body className={`${fredoka.variable} ${jakarta.variable}`} suppressHydrationWarning>
        <ThemeProvider />
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  )
}
