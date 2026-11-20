import DemoApp from '@/components/demo/DemoApp'

// La demo pública es la app misma con datos inventados (components/demo/*):
// mismo menú, mismas pantallas y los mismos componentes de tarjeta y de ciclo
// de sueldo. Nada se guarda: todo vive en memoria.
export default function DemoPage() {
  return <DemoApp />
}
