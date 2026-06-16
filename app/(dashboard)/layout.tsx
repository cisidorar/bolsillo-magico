import { getServerSession } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import BottomNav from '@/components/BottomNav'
import SideNav from '@/components/SideNav'
import AutoRegister from '@/components/AutoRegister'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getServerSession()
  if (!user) redirect('/login')

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#EEF4FF' }}>
      <AutoRegister />
      {/* Desktop sidebar */}
      <SideNav />
      {/* Main content: offset by sidebar on desktop */}
      <main className="lg:pl-60 main-content-pad">
        <div className="max-w-6xl mx-auto">
          {children}
        </div>
      </main>
      {/* Mobile bottom nav */}
      <BottomNav />
    </div>
  )
}
