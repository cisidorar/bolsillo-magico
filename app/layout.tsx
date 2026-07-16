import type { Metadata, Viewport } from 'next'
import { Fredoka, Plus_Jakarta_Sans } from 'next/font/google'
import './globals.css'
import ThemeProvider from '@/components/ThemeProvider'
import { getServerSession, createClient } from '@/lib/supabase/server'

const fredoka = Fredoka({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-fredoka' })
const jakarta = Plus_Jakarta_Sans({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800'], variable: '--font-jakarta' })

export const metadata: Metadata = {
  metadataBase: new URL('https://bolsillomagico.com'),
  title: {
    default: 'Bolsillo Mágico — Control de gastos personales',
    template: '%s · Bolsillo Mágico',
  },
  description: 'Registra y analiza tus gastos personales',
  manifest: '/manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Bolsillo Mágico' },
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
  } catch {
    // Graceful fallback — ThemeProvider will use localStorage
  }

  return (
    <html lang="es" className={serverTheme} suppressHydrationWarning>
      <body className={`${fredoka.variable} ${jakarta.variable}`} suppressHydrationWarning>
        <ThemeProvider />
        {children}
      </body>
    </html>
  )
}
