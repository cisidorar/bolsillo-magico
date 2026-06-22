import { getServerSession } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import BottomNav from '@/components/BottomNav'
import SideNav from '@/components/SideNav'
import AutoRegister from '@/components/AutoRegister'
import Image from 'next/image'
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
          <Image src="/camapana.png" alt="Bolsillo Mágico" width={24} height={24} />
          <span className="text-[15px] font-extrabold tracking-tight text-[#0A1F44] dark:text-white">
            Bolsillo Mágico
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
