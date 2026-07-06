import { redirect } from 'next/navigation'

// /ajustes ahora es solo un índice: cada sección vive en su propia vista.
export default function AjustesIndexPage() {
  redirect('/ajustes/perfil')
}
