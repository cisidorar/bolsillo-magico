'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Home, BookOpen, BarChart2, Wallet, RefreshCw, HandCoins, Settings, Plus, List } from 'lucide-react'
import { formatCLP } from '@/lib/utils'
import { useToast } from '@/components/ToastProvider'
import WaitlistForm from '@/components/landing/WaitlistForm'
import { Wordmark } from '@/components/site/SiteChrome'
import { seedExpenses, seedDebts, monthCtx, longDate, type DDebt, type DExpense } from './data'
import { sum, monthPrefix } from './calc'
import { statementNote } from './parts'
import InicioScreen from './InicioScreen'
import HistorialScreen from './HistorialScreen'
import RecurrentesScreen from './RecurrentesScreen'
import PorCobrarScreen from './PorCobrarScreen'
import { NuevoGastoSheet, ExpenseDetail } from './Sheets'

type Screen = 'inicio' | 'historial' | 'recurrentes' | 'cobrar'

const NAV: { id: Screen | null; label: string; Icon: typeof Home }[] = [
  { id: 'inicio', label: 'Inicio', Icon: Home },
  { id: 'historial', label: 'Historial', Icon: BookOpen },
  { id: null, label: 'Análisis', Icon: BarChart2 },
  { id: null, label: 'Ingresos', Icon: Wallet },
  { id: 'recurrentes', label: 'Recurrentes', Icon: RefreshCw },
  { id: 'cobrar', label: 'Por cobrar', Icon: HandCoins },
  { id: null, label: 'Ajustes', Icon: Settings },
]

const MOBILE_NAV: { id: Screen; label: string; Icon: typeof Home }[] = [
  { id: 'inicio', label: 'Inicio', Icon: Home },
  { id: 'historial', label: 'Historial', Icon: List },
  { id: 'recurrentes', label: 'Recurrentes', Icon: RefreshCw },
  { id: 'cobrar', label: 'Por cobrar', Icon: HandCoins },
]

// La demo es la app real con datos inventados: mismo menú, mismas pantallas,
// mismos componentes de tarjeta y de ciclo de sueldo. Todo vive en memoria;
// "Reiniciar" la deja como al llegar.
function Demo({ onReset }: { onReset: () => void }) {
  const { showToast } = useToast()
  const [ctx] = useState(monthCtx)
  const [screen, setScreen] = useState<Screen>('inicio')
  const [expenses, setExpenses] = useState<DExpense[]>(() => seedExpenses(ctx.dateStr))
  const [debts, setDebts] = useState<DDebt[]>(() => seedDebts(ctx.dateStr))
  const [sheet, setSheet] = useState(false)
  const [detail, setDetail] = useState<DExpense | null>(null)

  // Mes pasado al mismo día: constante, para que "Vs. mes anterior" se mueva al agregar gastos.
  const prevTotal = useMemo(
    () => Math.round(sum(seedExpenses(ctx.dateStr).filter(e => e.date.startsWith(monthPrefix(ctx))).map(e => e.amount)) * 0.82),
    [ctx],
  )

  function go(s: Screen) { setScreen(s); window.scrollTo({ top: 0 }) }
  function locked() { showToast('En la demo puedes recorrer Inicio, Historial, Recurrentes y Por cobrar.') }

  function save(e: DExpense, newDebts: DDebt[]) {
    setExpenses(list => [e, ...list].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)))
    if (newDebts.length) setDebts(d => [...d, ...newDebts])
    setSheet(false)
    const note = statementNote(e)
    showToast(
      newDebts.length
        ? `Guardado. Te deben ${formatCLP(sum(newDebts.map(d => d.amount)))}: lo ves en Por cobrar`
        : note ? `Guardado. Lo pagas el ${longDate(note.due)}` : 'Gasto guardado',
    )
  }

  function remove(e: DExpense) {
    setExpenses(list => list.filter(x => x.id !== e.id))
    setDetail(null)
    showToast('Gasto eliminado', { action: { label: 'Deshacer', onClick: () => setExpenses(list => [e, ...list].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))) } })
  }

  function setPaid(ids: string[], paid: boolean) {
    setDebts(d => d.map(x => (ids.includes(x.id) ? { ...x, paid } : x)))
  }
  function onDebtPaid(ids: string[], who: string, total: number) {
    setPaid(ids, true)
    showToast(`${who} te pagó ${formatCLP(total)}`, { action: { label: 'Deshacer', onClick: () => setPaid(ids, false) } })
  }
  function onDebtForgive(id: string, who: string, amount: number) {
    setPaid([id], true)
    showToast(`Lo asumes: ${formatCLP(amount)} de ${who}`, { action: { label: 'Deshacer', onClick: () => setPaid([id], false) } })
  }

  // Los enlaces de los componentes reales apuntan a pantallas privadas: en la demo avisan en vez de salir.
  function intercept(ev: React.MouseEvent) {
    const a = (ev.target as HTMLElement).closest('a')
    const href = a?.getAttribute('href') ?? ''
    if (a && href.startsWith('/') && !href.startsWith('/demo')) {
      ev.preventDefault(); ev.stopPropagation()
      showToast('Eso vive en la app completa. Acá puedes recorrer Inicio, Historial, Recurrentes y Por cobrar.')
    }
  }

  return (
    <div className="min-h-svh" style={{ background: 'var(--bg)', color: 'var(--ink)' }}>
      <aside className="hidden lg:flex flex-col fixed top-0 left-0 h-screen w-60 z-40 pt-[18px] pb-6 px-3" style={{ background: 'var(--surface)', boxShadow: '2px 0 16px var(--shadow)' }}>
        <Link href="/?landing=1" className="flex items-center mb-8 px-2 hover:opacity-80 transition-opacity" aria-label="Bolsillo Mágico, página principal">
          <Wordmark />
        </Link>
        <p className="text-[11px] font-semibold px-2 mb-2" style={{ color: 'var(--ink-3)' }}>Menú</p>
        <nav className="flex flex-col gap-0.5 flex-1" aria-label="Secciones">
          {NAV.map(({ id, label, Icon }) => {
            const active = id === screen
            return (
              <button key={label} type="button" aria-current={active ? 'page' : undefined} onClick={() => (id ? go(id) : locked())}
                className="flex items-center gap-3 px-3 min-h-[44px] rounded-xl text-[14px] font-semibold transition-colors text-left hover:bg-[var(--surface-2)]"
                style={active ? { background: 'var(--primary-soft)', color: 'var(--primary)' } : { color: 'var(--ink-2)' }}>
                <Icon className="w-[18px] h-[18px] flex-shrink-0" style={{ color: active ? 'var(--primary)' : 'var(--ink-3)' }} />
                {label}
              </button>
            )
          })}
        </nav>
        <div className="flex items-center gap-2.5 px-2 py-2 mb-2">
          <span className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold" style={{ background: 'var(--primary)', color: 'var(--primary-ink)' }}>S</span>
          <span className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Sofía <span className="text-[11px] font-medium" style={{ color: 'var(--ink-3)' }}>(demo)</span></span>
        </div>
        <div className="mb-3 mt-1" style={{ borderTop: '1px solid var(--border)' }} />
        <button type="button" onClick={() => setSheet(true)}
          className="flex items-center justify-center gap-2 w-full min-h-[48px] rounded-xl text-sm font-bold transition-all active:scale-[.98] hover:brightness-110"
          style={{ background: 'var(--primary)', color: 'var(--primary-ink)', boxShadow: '0 8px 18px var(--shadow)' }}>
          <Plus className="w-4 h-4" strokeWidth={2.5} /> Nuevo gasto
        </button>
      </aside>

      <div className="lg:pl-60">
        <div className="sticky top-0 z-30" style={{ background: 'color-mix(in srgb, var(--bg) 90%, transparent)', backdropFilter: 'blur(14px)' }}>
          <div className="px-4 lg:px-8 h-14 flex items-center justify-between gap-3">
            {/* ?landing=1: con sesión iniciada, "/" redirige al dashboard; este atajo deja ver la landing. */}
            <Link href="/?landing=1" aria-label="Volver a la página principal" className="inline-flex items-center justify-center gap-1.5 min-h-[44px] -ml-3 px-3 text-sm font-semibold" style={{ color: 'var(--ink-2)' }}>
              <ArrowLeft className="w-5 h-5" aria-hidden /> <span className="hidden sm:inline">Página principal</span>
            </Link>
            <p className="text-xs font-semibold lg:text-sm" style={{ color: 'var(--ink-3)' }}>
              <span className="hidden sm:inline">Demo con datos de ejemplo. Nada se guarda.</span><span className="sm:hidden">Datos de ejemplo</span>
            </p>
            <div className="flex items-center gap-1">
              <Link href="/login" className="hidden sm:inline-flex items-center min-h-[44px] px-3 rounded-xl text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>Iniciar sesión</Link>
              <button type="button" onClick={onReset} className="min-h-[44px] px-3 rounded-xl text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>Reiniciar</button>
              <a href="#pedir" className="inline-flex items-center min-h-[44px] px-3.5 rounded-xl text-sm font-bold whitespace-nowrap" style={{ color: 'var(--primary-text)', background: 'var(--primary-soft)' }}>
                Pedir acceso
              </a>
            </div>
          </div>
        </div>

        <main className="main-content-pad">
          <div onClickCapture={intercept}>
            {screen === 'inicio' && (
              <InicioScreen ctx={ctx} expenses={expenses} debts={debts} prevTotal={prevTotal} onOpenExpense={setDetail}
                onAdd={() => setSheet(true)} onGo={go} onDebtPaid={onDebtPaid} onDebtForgive={onDebtForgive} />
            )}
            {screen === 'historial' && <HistorialScreen ctx={ctx} expenses={expenses} prevTotal={prevTotal} onOpenExpense={setDetail} />}
            {screen === 'recurrentes' && <RecurrentesScreen ctx={ctx} />}
            {screen === 'cobrar' && <PorCobrarScreen debts={debts} today={ctx.dateStr} onPaid={onDebtPaid} onForgive={onDebtForgive} />}
          </div>

          <div className="px-4 lg:px-8 pb-6">
            <div id="pedir" className="rounded-3xl p-6 lg:p-8 hero-gradient scroll-mt-20 max-w-3xl">
              <p className="text-lg font-semibold" style={{ color: '#FFFFFF', fontFamily: 'var(--font-fredoka), sans-serif' }}>¿Te serviría algo así?</p>
              <p className="text-sm mt-1" style={{ color: 'rgba(255,255,255,0.92)' }}>Bolsillo Mágico es nuevo y se comparte por invitación, de a poco. Deja tu correo y te escribimos si hay un lugar para ti; lo que nos cuentes cambia lo que sigue.</p>
              <p className="text-sm mt-3 mb-4" style={{ color: 'rgba(255,255,255,0.92)' }}>Registras tú tus gastos, o importas un CSV: no se conecta a tu banco ni te pide la clave.</p>
              <WaitlistForm source="demo" />
            </div>
            <p className="text-sm mt-5" style={{ color: 'var(--ink-2)' }}>
              ¿Ya tienes cuenta?{' '}
              <Link href="/login" className="font-bold inline-flex items-center min-h-[44px]" style={{ color: 'var(--primary-text)' }}>Inicia sesión</Link>
              {' · '}
              <Link href="/seguridad" className="font-bold inline-flex items-center min-h-[44px]" style={{ color: 'var(--primary-text)' }}>Cómo cuidamos tus datos</Link>
            </p>
          </div>
        </main>
      </div>

      <nav className="fixed bottom-0 left-0 right-0 z-50 glass-nav safe-bottom lg:hidden" aria-label="Secciones">
        <div className="flex items-center justify-around py-2 px-1 max-w-lg mx-auto">
          {MOBILE_NAV.slice(0, 2).map(i => <MobileTab key={i.id} item={i} active={screen === i.id} onGo={go} />)}
          <button type="button" onClick={() => setSheet(true)} aria-label="Agregar gasto"
            className="w-14 h-14 -mt-7 fab-gradient rounded-full flex items-center justify-center active:scale-95 transition-transform">
            <Plus className="w-7 h-7" style={{ color: 'var(--primary-ink)' }} strokeWidth={2.5} />
          </button>
          {MOBILE_NAV.slice(2).map(i => <MobileTab key={i.id} item={i} active={screen === i.id} onGo={go} />)}
        </div>
      </nav>

      {sheet && <NuevoGastoSheet ctx={ctx} existingPeople={debts.filter(d => !d.paid).map(d => d.person)} onClose={() => setSheet(false)} onSave={save} />}
      {detail && <ExpenseDetail e={detail} ctx={ctx} onClose={() => setDetail(null)} onDelete={remove} />}
    </div>
  )
}

function MobileTab({ item, active, onGo }: { item: (typeof MOBILE_NAV)[number]; active: boolean; onGo: (s: Screen) => void }) {
  const { Icon } = item
  return (
    <button type="button" onClick={() => onGo(item.id)} aria-current={active ? 'page' : undefined}
      className="flex flex-col items-center justify-center gap-0.5 px-2 rounded-xl" style={{ minWidth: 56, minHeight: 44 }}>
      <span className="p-1.5 rounded-xl" style={active ? { background: 'var(--primary-soft)' } : undefined}>
        <Icon className="w-5 h-5" style={{ color: active ? 'var(--primary)' : 'var(--ink-3)' }} />
      </span>
      <span className="text-[10px] font-semibold" style={{ color: active ? 'var(--primary)' : 'var(--ink-3)' }}>{item.label}</span>
    </button>
  )
}

export default function DemoApp() {
  const [run, setRun] = useState(0)
  return <Demo key={run} onReset={() => { setRun(r => r + 1); window.scrollTo({ top: 0 }) }} />
}
