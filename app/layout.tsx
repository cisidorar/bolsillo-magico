import type { Metadata, Viewport } from 'next'
import { Nunito } from 'next/font/google'
import './globals.css'
import ThemeProvider from '@/components/ThemeProvider'
import { getServerSession, createClient } from '@/lib/supabase/server'

const nunito = Nunito({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800'] })

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
  themeColor: '#1B6DD4',
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
      <body className={nunito.className} suppressHydrationWarning>
        <ThemeProvider />
        {children}
      </body>
    </html>
  )
}
