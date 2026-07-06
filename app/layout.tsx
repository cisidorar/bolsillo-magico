import type { Metadata, Viewport } from 'next'
import { Fredoka, Plus_Jakarta_Sans } from 'next/font/google'
import './globals.css'
import ThemeProvider from '@/components/ThemeProvider'
import { getServerSession, createClient } from '@/lib/supabase/server'
import { accentCssVars, isAccentKey, DEFAULT_ACCENT } from '@/lib/accent-colors'

const fredoka = Fredoka({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-fredoka' })
const jakarta = Plus_Jakarta_Sans({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800'], variable: '--font-jakarta' })

export const metadata: Metadata = {
  title: 'Bolsillo Mágico',
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
  // Read theme + accent from DB so ambos sincronizan entre dispositivos (SSR — sin flash)
  let serverTheme: 'dark' | '' = ''
  let accentStyle = accentCssVars(DEFAULT_ACCENT)
  try {
    const user = await getServerSession()
    if (user) {
      const supabase = await createClient()
      const { data } = await supabase
        .from('profiles')
        .select('theme, accent_color')
        .eq('id', user.id)
        .maybeSingle()
      if (data?.theme === 'dark') serverTheme = 'dark'
      if (isAccentKey(data?.accent_color)) accentStyle = accentCssVars(data.accent_color)
    }
  } catch {
    // Graceful fallback — ThemeProvider will use localStorage
  }

  return (
    <html lang="es" className={serverTheme} suppressHydrationWarning style={accentStyle}>
      <body className={`${fredoka.variable} ${jakarta.variable}`} suppressHydrationWarning>
        <ThemeProvider />
        {children}
      </body>
    </html>
  )
}
