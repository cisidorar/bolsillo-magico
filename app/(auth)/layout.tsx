export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-svh flex flex-col max-w-lg mx-auto" style={{ backgroundColor: '#EEF4FF' }}>
      {children}
    </div>
  )
}
