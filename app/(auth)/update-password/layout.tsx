import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Tu contraseña' }

export default function UpdatePasswordLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
