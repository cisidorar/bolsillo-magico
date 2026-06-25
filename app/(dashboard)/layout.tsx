import { getServerSession } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import BottomNav from '@/components/BottomNav'
import SideNav from '@/components/SideNav'
import AutoRegister from '@/components/AutoRegister'
import Link from 'next/link'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getServerSession()
  if (!user) redirect('/login')

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-page)' }}>
      <AutoRegister />
      {/* Desktop sidebar */}
      <SideNav />
      {/* Mobile top bar */}
      <header className="mobile-topbar lg:hidden fixed top-0 left-0 right-0 z-40 flex items-center justify-center h-12">
        <Link href="/inicio" className="flex items-center gap-2">
          {/* Mini ícono "El Bolsillo" */}
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center relative overflow-hidden flex-shrink-0"
            style={{ background: 'var(--primary)' }}
          >
            <div className="absolute w-2.5 h-2.5" style={{ background: 'var(--gold)', clipPath: 'polygon(50% 0,61% 39%,100% 50%,61% 61%,50% 100%,39% 61%,0 50%,39% 39%)', top: '4px', left: '50%', transform: 'translateX(-50%)' }} />
            <div className="absolute" style={{ width: '14px', height: '7px', bottom: '4px', left: '50%', transform: 'translateX(-50%)', overflow: 'hidden', borderRadius: '0 0 7px 7px' }}>
              <div style={{ width: '14px', height: '14px', background: 'white', borderRadius: '50%', marginTop: '-7px' }} />
            </div>
          </div>
          <span className="font-display text-[15px] font-semibold" style={{ color: 'var(--ink)' }}>
            <span>Bolsillo </span><span style={{ color: 'var(--primary)' }}>Mágico</span>
          </span>
        </Link>
      </header>
      {/* Main content: offset by sidebar on desktop, top bar on mobile */}
      <main className="lg:pl-60 main-content-pad pt-12 lg:pt-0">
        {children}
      </main>
      {/* Mobile bottom nav */}
      <BottomNav />
    </div>
  )
}
