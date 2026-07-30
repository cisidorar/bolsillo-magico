import { NextResponse } from 'next/server'
import { createClient, getServerSession } from '@/lib/supabase/server'
import { computeCommittedDebt } from '@/lib/net-worth'

// Vercel Hobby plan default timeout is 10s — OpenAI calls need more
export const maxDuration = 30 // seconds (max 60 on Hobby)

// ── JSON Schema para Structured Outputs ──────────────────────────────────────
const INSIGHTS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    opportunities: {
      type: 'array',
      maxItems: 5,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          type: {
            type: 'string',
            enum: [
              'one_time_purchase',
              'subscription_review',
              'category_over_budget',
              'habit_increase',
              'frequent_small_expenses',
              'unusual_spending',
              'budget_missing',
              'invest_goal_at_risk',
              'emergency_fund_priority',
              'lifestyle_creep',
              'cash_drag',
              // I1 (jul 2026): patrones de comportamiento entre meses
              'merchant_trend',
              'subscription_price_increase',
              'payday_effect',
              'budget_unrealistic',
              'seasonal_pattern',
              'improvement_confirmed',
            ],
          },
          title:         { type: 'string' },
          description:   { type: 'string' },
          impact_amount: { type: ['integer', 'null'] },
          severity:      { type: 'string', enum: ['low', 'medium', 'high'] },
          confidence:    { type: 'number' },
          expense_ids:   { type: 'array', items: { type: 'string' } },
          action_label:  { type: 'string' },
          action: {
            type: 'string',
            enum: [
              'mark_as_one_time',
              'create_budget',
              'adjust_budget',
              'review_expenses',
              'view_category',
              'ignore',
            ],
          },
        },
        required: [
          'type', 'title', 'description', 'impact_amount',
          'severity', 'confidence', 'expense_ids', 'action_label', 'action',
        ],
      },
    },
  },
  required: ['opportunities'],
}

// Valid types / severity / actions — re-validated at insert time
const VALID_TYPES    = new Set(['one_time_purchase','subscription_review','category_over_budget','habit_increase','frequent_small_expenses','unusual_spending','budget_missing','invest_goal_at_risk','emergency_fund_priority','lifestyle_creep','cash_drag','merchant_trend','subscription_price_increase','payday_effect','budget_unrealistic','seasonal_pattern','improvement_confirmed'])
const VALID_SEVERITY = new Set(['low','medium','high'])
const VALID_ACTIONS  = new Set(['mark_as_one_time','create_budget','adjust_budget','review_expenses','view_category','ignore'])

const SYSTEM_PROMPT = `Eres un analista financiero personal dentro de una app de gastos en pesos chilenos (CLP).
Tu tarea es encontrar patrones mensuales útiles y convertirlos en oportunidades de mejora accionables.

Reglas estrictas:
- No inventes montos ni datos. Usa solo los datos entregados.
- No recomiendes instrumentos de inversión específicos (acciones, fondos, tickers) ni prometas rentabilidades — eso lo cubre otro motor de la app. SÍ puedes razonar sobre el BALANCE entre gastar, invertir y mantener colchón líquido cuando el usuario tiene una meta de aporte definida (goal_context abajo): eso es tan válido como cualquier otro patrón de gasto.
- Prioriza oportunidades concretas y accionables.
- Devuelve máximo 3 oportunidades.
- Cada oportunidad debe tener evidencia clara en los datos.
- Si no hay evidencia suficiente, no generes la oportunidad.
- No critiques al usuario. Usa frases prácticas, suaves y empáticas.
- Los montos son siempre en pesos chilenos (CLP), sin decimales.

IMPORTANTE — qué NO reportar:
- La app YA muestra de forma automática y visible qué categorías están sobre presupuesto este mes ("Categorías vs. presupuesto"). NO generes oportunidades que solo digan "categoría X está sobre presupuesto" — eso es redundante. Solo menciona presupuesto si descubres algo que la comparación simple NO muestra: p.ej. que lleva varios meses seguidos excedida (el presupuesto es irreal → budget_unrealistic, sugiere el monto según el promedio histórico), o que el exceso viene de UN comportamiento específico identificable.
- Si "previous_insights" trae lo que reportaste el mes pasado, NO repitas el mismo hallazgo con otras palabras. Solo vuelve a mencionarlo si escaló (más meses seguidos, monto mayor) — y en ese caso di explícitamente que es una tendencia que persiste. Si el usuario MEJORÓ en algo que reportaste, puedes reconocerlo con improvement_confirmed (máximo 1, severity low).
- Materialidad: ignora excesos o hallazgos cuyo impact_amount sea menor al 3% de total_expense (o un monto pequeño en términos absolutos) — un presupuesto pasado por unos pocos miles de pesos no es un hallazgo, es ruido. Prefiere SIEMPRE el patrón con mayor impacto en pesos o mayor persistencia en el tiempo sobre uno trivial, aunque tengas que devolver menos de 3 oportunidades.
- Un gasto grande que parezca excepcional (viaje, evento puntual, compra única — sobre todo si distorsiona el % de una categoría o aparece partido entre dos medios de pago) NO debe usarse como evidencia de que "la categoría está sobre presupuesto" ni de un patrón de comportamiento — repórtalo aparte como one_time_purchase (acción mark_as_one_time) y, si al excluirlo la categoría SÍ vuelve a estar dentro de presupuesto, dilo explícitamente en la descripción.
- "excluded_this_month" trae los gastos que el usuario YA marcó como únicos este mes (ya están fuera de categories/top_expenses/merchants). Nunca los reportes de nuevo ni los cuentes como evidencia — si es útil, puedes mencionar de pasada que ya quedaron excluidos del análisis.

PRIORIZA patrones de COMPORTAMIENTO que solo se ven cruzando meses — para eso recibes categories[].history_6m (serie mensual por categoría), merchants (gasto por comercio con promedio histórico) e intra_month (distribución del gasto dentro del mes):
1. merchant_trend: un comercio/servicio específico que crece sostenido vs su promedio (ej. "Uber subió 41% vs tus 3 meses previos: 14 viajes por $86.000").
2. subscription_price_increase: un cargo recurrente del mismo comercio cuyo monto subió (misma suscripción, precio nuevo).
3. payday_effect: concentración del gasto discrecional en una ventana específica del mes (ej. días post-sueldo, fines de semana) — usa intra_month y sé específico con el % y los días.
4. seasonal_pattern / habit_increase: categoría con deriva sostenida en history_6m (3+ meses subiendo), distinguiendo deriva real de un spike puntual.
5. budget_unrealistic: categoría que lleva 3+ meses sobre el MISMO presupuesto — el problema es el presupuesto, sugiere monto realista (promedio 3m).
6. frequent_small_expenses: la cola larga (small_expenses_summary) concentrada en un patrón identificable.
7. one_time_purchase / unusual_spending: solo si distorsiona el mes de forma relevante Y no es obvio a simple vista.

Si "goal_context" viene con datos, además busca patrones de balance gasto/inversión/colchón:
8. invest_goal_at_risk: el gasto de este mes (o su proyección) deja menos disponible del necesario para cumplir la meta de aporte mensual (goal_context.monthly_invest_goal vs goal_context.disposable_income).
9. emergency_fund_priority: el fondo de emergencia cubre menos de 3 meses de gasto (goal_context.emergency_fund_months) y aun así el usuario ya cumplió o está por cumplir su aporte del mes — sugiere priorizar el colchón antes de seguir invirtiendo, sin decir en qué invertir.
10. lifestyle_creep: el gasto discrecional (no fijo/recurrente) sube mes a mes de forma sostenida en goal_context.expense_trend_3m, mientras el ingreso no crece igual.
11. cash_drag: sobra plata líquida de forma reiterada (goal_context.liquid_this_month alto en varios meses) sin destinarse a inversión ni ahorro que rinda — es "plata parada", no un logro.

Ordena las oportunidades por relevancia descendente: primero los patrones de comportamiento (1-7) con mayor impacto CLP o mayor persistencia en el tiempo, luego balance gasto/inversión (8-11). Devuelve máximo 5, pero solo las que tengan evidencia clara — mejor 2 buenas que 5 forzadas.

Responde SIEMPRE con un JSON válido con esta estructura exacta:
{
  "opportunities": [
    {
      "type": "one_time_purchase|subscription_review|category_over_budget|habit_increase|frequent_small_expenses|unusual_spending|budget_missing|invest_goal_at_risk|emergency_fund_priority|lifestyle_creep|cash_drag|merchant_trend|subscription_price_increase|payday_effect|budget_unrealistic|seasonal_pattern|improvement_confirmed",
      "title": "string corto",
      "description": "string explicativo",
      "impact_amount": número entero o null,
      "severity": "low|medium|high",
      "confidence": número entre 0 y 1,
      "expense_ids": ["uuid", ...],
      "action_label": "texto del botón",
      "action": "mark_as_one_time|create_budget|adjust_budget|review_expenses|view_category|ignore"
    }
  ]
}`

// ── A03/LLM01: Sanitize strings before sending to AI ─────────────────────────
// Strips control characters and limits length to prevent prompt injection
// I1.2: normaliza una descripción a una "clave de comercio" — minúsculas, sin
// tildes ni números, para agrupar "Uber *Trip 4821" y "UBER TRIP 9012" bajo
// el mismo comercio al comparar mes actual vs promedio histórico.
function normalizeMerchant(desc: string | null | undefined): string {
  if (!desc) return ''
  return desc
    .toLowerCase()
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .replace(/[0-9]/g, ' ')
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function sanitize(str: string | null | undefined, maxLen = 80): string {
  if (!str) return ''
  return str
    .replace(/[ --]/g, ' ') // strip control chars
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen)
}

// ── A04: Strict input validation ──────────────────────────────────────────────
function validateMonthYear(body: unknown): { month: number; year: number; force: boolean } | null {
  if (typeof body !== 'object' || body === null) return null
  const { month, year, force } = body as Record<string, unknown>
  if (
    typeof month !== 'number' || !Number.isInteger(month) || month < 1 || month > 12 ||
    typeof year  !== 'number' || !Number.isInteger(year)  || year  < 2020 || year > 2099
  ) return null
  return { month, year, force: force === true }
}

export async function POST(request: Request) {
  try {
    // ── A07: Auth — validated JWT, not just cookie ────────────────────────────
    const user = await getServerSession()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // ── A07: Safe JSON parse — malformed body → 400, not 500 ─────────────────
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    // ── A04: Validate inputs ──────────────────────────────────────────────────
    const parsed = validateMonthYear(body)
    if (!parsed) return NextResponse.json({ error: 'Invalid month or year' }, { status: 400 })
    const { month, year, force } = parsed

    const supabase = await createClient()

    // ── 1. Construir payload de análisis ──────────────────────────────────────
    const monthStr = String(month).padStart(2, '0')
    const startDate = `${year}-${monthStr}-01`
    const endDate   = `${month === 12 ? year + 1 : year}-${String(month === 12 ? 1 : month + 1).padStart(2, '0')}-01`

    const prevMonth = month === 1 ? 12 : month - 1
    const prevYear  = month === 1 ? year - 1 : year
    // Ventana de 6 meses antes del mes analizado — alimenta el promedio de
    // gasto (fondo de emergencia) y la tendencia de 3 meses (lifestyle creep).
    // Reemplaza a la vieja query de "solo mes anterior": mismo dato de
    // totalPrev (se extrae del bucket), más contexto sin una query extra.
    const sixBackD     = new Date(year, month - 7, 1)
    const sixBackStart = `${sixBackD.getFullYear()}-${String(sixBackD.getMonth() + 1).padStart(2, '0')}-01`

    const [
      { data: expenses },
      { data: historyExpenses },
      { data: categoryBudgets },
      { data: incomeRow },
      { data: monthBudget },
      { data: profileRow },
      { data: usdDeposits },
      { data: prevIncomeRow },
      { data: savingsRows },
      { data: maturedDeposits },
      { data: previousInsightsRaw },
      committedDebtNext6m,
    ] = await Promise.all([
      supabase
        .from('expenses')
        .select('id, amount, description, date, category:categories(id, name), recurring_expense_id, excluded_from_analysis')
        .eq('user_id', user.id)
        .gte('date', startDate)
        .lt('date', endDate)
        .order('amount', { ascending: false }),
      // I1.1/I1.2: se agrega description + category_id — antes solo traía
      // amount/date (alcanzaba para el total mensual, no para reconstruir
      // series por categoría ni agrupar por comercio).
      supabase
        .from('expenses')
        .select('amount, date, description, category_id, excluded_from_analysis')
        .eq('user_id', user.id)
        .gte('date', sixBackStart)
        .lt('date', startDate),
      supabase.from('category_budgets').select('*').eq('user_id', user.id),
      supabase.from('incomes').select('amount').eq('user_id', user.id).eq('month', month).eq('year', year).maybeSingle(),
      supabase.from('budgets').select('amount').eq('user_id', user.id).eq('month', month).eq('year', year).maybeSingle(),
      // Meta de aporte a inversión (Fase A5 del asesor financiero)
      supabase.from('profiles').select('monthly_invest_goal').eq('id', user.id).maybeSingle(),
      // Aportes a la billetera USD DENTRO del mes analizado
      supabase.from('usd_purchases').select('total_paid_clp').eq('user_id', user.id).eq('kind', 'deposit')
        .gte('purchase_date', startDate).lt('purchase_date', endDate),
      // Ingreso del mes ANTERIOR — el que, por convención de la app, financia los gastos de este mes
      supabase.from('incomes').select('amount').eq('user_id', user.id).eq('month', prevMonth).eq('year', prevYear).maybeSingle(),
      supabase.from('savings_accounts').select('balance').eq('user_id', user.id),
      supabase.from('term_deposits').select('amount, interest_rate').eq('user_id', user.id).lt('maturity_date', endDate),
      // I3 (lite): lo que ya reportamos el mes pasado — para que el prompt no
      // repita el mismo hallazgo con otras palabras mes a mes.
      supabase.from('monthly_insights')
        .select('type, title, impact_amount')
        .eq('user_id', user.id).eq('month', prevMonth).eq('year', prevYear).eq('status', 'active')
        .limit(5),
      // Deuda comprometida a futuro (cuotas + tarjeta por facturar), autocontenida — ver lib/net-worth.ts
      computeCommittedDebt(supabase, user.id, new Date(year, month, 0)),
    ])

    if (!expenses || expenses.length === 0) {
      return NextResponse.json({ message: 'no_expenses' }, { status: 200 })
    }

    // ── "Marcar como único" (migración 20260725) ──────────────────────────────
    // Un gasto excluido sigue siendo real y sigue contando en TODOS los totales
    // visibles de la app (historial, presupuesto vs categoría) — acá solo deja
    // de alimentar el análisis de la IA: no debe seguir evidenciando "categoría
    // sobre presupuesto" ni un patrón de comportamiento mes tras mes por algo
    // que el usuario ya identificó como excepcional. historyExpenses se filtra
    // igual, para que tampoco distorsione history_6m ni el promedio de comercio.
    const activeExpenses   = (expenses as any[]).filter(e => !e.excluded_from_analysis)
    const excludedThisMonth = (expenses as any[]).filter(e => e.excluded_from_analysis)
    const activeHistoryExpenses = ((historyExpenses ?? []) as any[]).filter(e => !e.excluded_from_analysis)

    // ── 2. Señales y payload ──────────────────────────────────────────────────
    // totalMonth = total de ANÁLISIS (excluye lo marcado como único, alimenta
    // categorías/top_expenses/tendencias). totalMonthReal = TODO lo gastado de
    // verdad este mes — el que debe usarse para cualquier razonamiento de
    // flujo de caja real (liquidThisMonth), donde excluir la plata que de
    // verdad salió de la cuenta produciría un "sobrante" falso.
    const totalMonth     = activeExpenses.reduce((s: number, e: any) => s + e.amount, 0)
    const totalMonthReal = (expenses as any[]).reduce((s: number, e: any) => s + e.amount, 0)
    const income       = (incomeRow as any)?.amount ?? null
    const globalBudget = (monthBudget as any)?.amount ?? null
    const catBudgetMap = new Map(((categoryBudgets ?? []) as any[]).map((b: any) => [b.category_id, b.amount]))

    // ── Bucket de 6 meses previos → totalPrev, promedio (fondo de emergencia) y tendencia 3m ──
    const monthTotals: Record<string, number> = {}
    for (const e of activeHistoryExpenses) {
      const k = String(e.date).slice(0, 7)
      monthTotals[k] = (monthTotals[k] ?? 0) + e.amount
    }
    const totalPrev = monthTotals[`${prevYear}-${String(prevMonth).padStart(2, '0')}`] ?? 0
    const completedMonthlyTotals = Object.values(monthTotals).filter(v => v > 0)
    const avgMonthlyExpense = completedMonthlyTotals.length > 0
      ? Math.round(completedMonthlyTotals.reduce((s, v) => s + v, 0) / completedMonthlyTotals.length)
      : null
    const expenseTrend3m: number[] = []
    for (let i = 3; i >= 1; i--) {
      const d = new Date(year, month - 1 - i, 1)
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      expenseTrend3m.push(monthTotals[k] ?? 0)
    }

    // ── I1.1: serie de 6 meses POR CATEGORÍA (5 previos + el actual, de más
    // antiguo a más reciente) — le da al modelo la "película" en vez de la
    // foto: sin esto no puede distinguir una deriva sostenida de un spike.
    const currentMonthKey = `${year}-${monthStr}`
    const monthKeys6: string[] = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(year, month - 1 - i, 1)
      monthKeys6.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    }
    const byCatHistory: Record<string, Record<string, number>> = {}
    for (const e of activeHistoryExpenses) {
      const catId = e.category_id ?? 'sin-categoria'
      const k = String(e.date).slice(0, 7)
      if (!byCatHistory[catId]) byCatHistory[catId] = {}
      byCatHistory[catId][k] = (byCatHistory[catId][k] ?? 0) + e.amount
    }

    // ── I1.2: agregado por comercio — mes actual vs promedio de los 3 meses
    // previos. Sin esto la IA no puede decir "Uber subió 41%": solo ve el
    // total de la categoría, no el comercio específico que la mueve.
    const prev3Keys = new Set(monthKeys6.slice(2, 5))
    const merchantHistoryTotal: Record<string, number> = {}
    for (const e of activeHistoryExpenses) {
      const k = String(e.date).slice(0, 7)
      if (!prev3Keys.has(k)) continue
      const mk = normalizeMerchant(e.description)
      if (!mk) continue
      merchantHistoryTotal[mk] = (merchantHistoryTotal[mk] ?? 0) + e.amount
    }
    const merchantNow: Record<string, { count: number; total: number; label: string }> = {}
    for (const e of activeExpenses) {
      const mk = normalizeMerchant(e.description)
      if (!mk) continue
      if (!merchantNow[mk]) merchantNow[mk] = { count: 0, total: 0, label: sanitize(e.description, 40) }
      merchantNow[mk].count++
      merchantNow[mk].total += e.amount
    }
    const merchants = Object.entries(merchantNow)
      .map(([mk, m]) => {
        const histTotal = merchantHistoryTotal[mk] ?? 0
        const avg3m = Math.round(histTotal / 3)
        return {
          name:       m.label,
          count_now:  m.count,
          total_now:  m.total,
          avg_3m:     avg3m,
          delta_pct:  avg3m > 0 ? Math.round(((m.total - avg3m) / avg3m) * 100) : null,
          is_new:     histTotal === 0,
        }
      })
      .sort((a, b) => b.total_now - a.total_now)
      .slice(0, 15)

    // ── I1.3: distribución intra-mes — por semana del mes y ventana
    // post-sueldo (el sueldo llega a fin de mes, días 25-31 de convención).
    const byWeek: number[] = [0, 0, 0, 0] // semana 1-4+
    let postPaydayDiscretionary = 0
    let totalDiscretionary = 0
    for (const e of activeExpenses) {
      const day = Number(String(e.date).slice(8, 10))
      const weekIdx = Math.min(3, Math.floor((day - 1) / 7))
      byWeek[weekIdx] += e.amount
      if (!e.recurring_expense_id) {
        totalDiscretionary += e.amount
        if (day >= 25) postPaydayDiscretionary += e.amount
      }
    }

    // ── Meta de aporte, fondo de emergencia y flujo del mes (Fase A5) ─────────
    const monthlyInvestGoal = (profileRow as any)?.monthly_invest_goal ?? null
    const investedThisMonth = ((usdDeposits ?? []) as any[]).reduce((s, r) => s + r.total_paid_clp, 0)
    const fundingIncome     = (prevIncomeRow as any)?.amount ?? null
    const disposableIncome  = monthlyInvestGoal && fundingIncome ? fundingIncome - monthlyInvestGoal : null
    const liquidThisMonth   = fundingIncome !== null ? fundingIncome - totalMonthReal - investedThisMonth : null
    const savingsTotal      = ((savingsRows ?? []) as any[]).reduce((s, r) => s + r.balance, 0)
    const maturedLiquid     = ((maturedDeposits ?? []) as any[]).reduce((s, d) => s + d.amount + Math.round(d.amount * (Number(d.interest_rate) / 100)), 0)
    const liquidFund        = savingsTotal + maturedLiquid
    const emergencyFundMonths = avgMonthlyExpense && avgMonthlyExpense > 0
      ? Math.round((liquidFund / avgMonthlyExpense) * 10) / 10
      : null

    // Collect valid expense IDs for later validation (A08) — solo los que
    // realmente se le mostraron a la IA (activeExpenses)
    const validExpenseIds = new Set(activeExpenses.map((e: any) => e.id as string))

    const byCat: Record<string, { name: string; total: number; count: number; recurring: number; budget: number | null }> = {}
    for (const e of activeExpenses) {
      const catId   = e.category?.id ?? 'sin-categoria'
      const catName = e.category?.name ?? 'Sin categoría'
      if (!byCat[catId]) byCat[catId] = { name: catName, total: 0, count: 0, recurring: 0, budget: catBudgetMap.get(catId) ?? null }
      byCat[catId].total += e.amount
      byCat[catId].count++
      if (e.recurring_expense_id) byCat[catId].recurring += e.amount
    }

    // ── A03/LLM01: Sanitize descriptions before sending to AI ────────────────
    // I1.4: 20 → 40 gastos visibles + resumen agregado de la cola larga, para
    // que "gastos pequeños frecuentes" tenga evidencia real en vez de quedar
    // ciego a más de la mitad del mes.
    const sortedExpenses = activeExpenses
    const topExpenses = sortedExpenses.slice(0, 40).map((e: any) => ({
      id:                  e.id,
      description:         sanitize(e.description, 80),  // sanitized, max 80 chars
      amount:              e.amount,
      category:            sanitize(e.category?.name, 40),
      date:                e.date,
      monthly_impact_pct:  Math.round((e.amount / totalMonth) * 100),
      is_recurring:        !!e.recurring_expense_id,
    }))
    const restExpenses = sortedExpenses.slice(40)
    const smallExpensesSummary = restExpenses.length > 0 ? (() => {
      const byCatName: Record<string, number> = {}
      for (const e of restExpenses) {
        const name = sanitize(e.category?.name, 40) || 'Sin categoría'
        byCatName[name] = (byCatName[name] ?? 0) + e.amount
      }
      return {
        count:      restExpenses.length,
        total:      restExpenses.reduce((s: number, e: any) => s + e.amount, 0),
        by_category: byCatName,
      }
    })() : null

    const allAmounts = [...activeHistoryExpenses, ...activeExpenses].map((e: any) => e.amount).sort((a: number, b: number) => a - b)
    const p90Idx     = Math.floor(allAmounts.length * 0.9)
    const p90Amount  = allAmounts[p90Idx] ?? totalMonth

    const MONTH_NAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
    const payload = {
      period:                  `${MONTH_NAMES[month - 1]} ${year}`,
      income,
      total_expense:           totalMonth,
      previous_month_expense:  totalPrev > 0 ? totalPrev : null,
      global_budget:           globalBudget,
      delta_vs_prev_pct:       totalPrev > 0 ? Math.round(((totalMonth - totalPrev) / totalPrev) * 100) : null,
      expense_count:           activeExpenses.length,
      categories: Object.entries(byCat).sort((a, b) => b[1].total - a[1].total).map(([catId, c]) => ({
        name:                 sanitize(c.name, 40),
        total:                c.total,
        count:                c.count,
        recurring_amount:     c.recurring,
        discretionary_amount: c.total - c.recurring,
        budget:               c.budget,
        over_budget:          c.budget ? c.total > c.budget : false,
        budget_pct:           c.budget ? Math.round((c.total / c.budget) * 100) : null,
        // I1.1: serie de 6 meses (5 previos + este), de más antiguo a más reciente
        history_6m:           monthKeys6.map(k => k === currentMonthKey ? c.total : (byCatHistory[catId]?.[k] ?? 0)),
      })),
      top_expenses: topExpenses,
      // I1.4: cola larga fuera del top 40 — evita quedar ciego a la mitad del mes
      small_expenses_summary: smallExpensesSummary,
      // I1.2: gasto agrupado por comercio, mes actual vs promedio 3 meses previos
      merchants,
      // I1.3: distribución dentro del mes — semanas y ventana post-sueldo
      intra_month: {
        by_week: byWeek, // [semana1, semana2, semana3, semana4+] del mes
        post_payday_discretionary_pct: totalDiscretionary > 0
          ? Math.round((postPaydayDiscretionary / totalDiscretionary) * 100) : null,
        note: 'by_week = gasto total por semana calendario del mes. post_payday_discretionary_pct = % del gasto discrecional (no recurrente) que ocurrió en los días 25-31, la ventana post-sueldo (el sueldo llega a fin de mes).',
      },
      // I3 (lite): qué se reportó el mes pasado, para no repetir el mismo hallazgo
      previous_insights: ((previousInsightsRaw ?? []) as any[]).map(i => ({
        type: i.type, title: sanitize(i.title, 120), impact_amount: i.impact_amount,
      })),
      // "Marcar como único": gastos que el usuario YA marcó como excepcionales
      // este mes — quedaron fuera de categories/top_expenses/merchants a
      // propósito. Se informan aparte solo para que la IA pueda explicar el
      // contraste si hace falta (ej. "sin el viaje, Pareja quedó dentro de
      // presupuesto"), nunca para volver a tratarlos como evidencia de patrón.
      excluded_this_month: excludedThisMonth.map((e: any) => ({
        description: sanitize(e.description, 80),
        amount:      e.amount,
        category:    sanitize(e.category?.name, 40),
        date:        e.date,
      })),
      historical_context: {
        p90_single_expense: p90Amount,
        note: 'Un gasto individual muy superior a este percentil sugiere compra atípica.',
      },
      // Fase A5 del asesor financiero: solo se envía si el usuario definió una
      // meta de aporte — sin eso, los patrones 7-10 del prompt no tienen una
      // línea base contra la cual medirse.
      goal_context: monthlyInvestGoal ? {
        monthly_invest_goal:    monthlyInvestGoal,
        invested_this_month:    investedThisMonth,
        disposable_income:      disposableIncome,
        liquid_this_month:      liquidThisMonth,
        emergency_fund_months:  emergencyFundMonths,
        expense_trend_3m:       expenseTrend3m,
        committed_debt_next_6m: committedDebtNext6m,
        note: 'disposable_income = ingreso del mes anterior menos la meta de aporte (lo máximo que se puede gastar sin comprometer la meta). expense_trend_3m son los 3 meses previos al analizado, de más antiguo a más reciente.',
      } : null,
    }

    // ── 3. Hash para cache (total::count::budgets::meta::invertido::categorías) ──
    const budgetFingerprint = ((categoryBudgets ?? []) as any[])
      .map((b: any) => `${b.category_id}:${b.amount}`)
      .sort()
      .join('|')
    // Incluye activeExpenses.length (no el total crudo): así, marcar un gasto
    // como único cambia el hash y dispara una regeneración natural la
    // próxima vez, sin depender del botón "Regenerar".
    // categoryFingerprint: reasignar un gasto a otra categoría NO cambia el
    // total ni el count del mes, así que sin esto el hash queda idéntico y la
    // regeneración nunca detecta el cambio (bug reportado por Cas: recategorizó
    // un gasto de viaje y "Regenerar" siguió mostrando el insight viejo).
    const categoryFingerprint = activeExpenses
      .map((e: any) => `${e.id}:${e.category?.id ?? 'none'}`)
      .sort()
      .join('|')
    const expensesHash = `${totalMonth}::${activeExpenses.length}::${budgetFingerprint}::${monthlyInvestGoal ?? 'x'}::${investedThisMonth}::${categoryFingerprint}`

    // ── 4. Verificar cache + rate limit ───────────────────────────────────────
    // A04: rate limit hard — max 1 AI call each 10 minutes per (user, month, year)
    const { data: existing } = await supabase
      .from('monthly_insights')
      .select('generated_at, expenses_hash')
      .eq('user_id', user.id)
      .eq('month', month)
      .eq('year', year)
      .eq('status', 'active')
      .limit(1)
      .maybeSingle()

    if (existing) {
      const ageMs    = Date.now() - new Date(existing.generated_at).getTime()
      const stale    = ageMs > 6 * 3600 * 1000   // 6 horas
      const cooldown = ageMs < 10 * 60 * 1000    // 10 minutos
      const same     = existing.expenses_hash === expensesHash
      // force=true (botón "Regenerar" del usuario): el cooldown de 10 min solo
      // protege contra doble-click sobre los MISMOS datos (same=true) — si el
      // hash cambió (ej. el usuario recategorizó un gasto) el usuario pidió
      // explícitamente un análisis nuevo y merece verlo de inmediato, no un
      // "cached" silencioso. Antes esto bloqueaba cualquier click dentro de
      // los 10 min sin mirar `same`, dejando "Regenerar" sin efecto real tras
      // recategorizar (bug reportado por Cas).
      if (!force) {
        // Return cached if data hasn't changed (same hash, not stale)
        // Cooldown only applies when data is the same (prevents hammering without blocking budget changes)
        if (!stale && same) {
          return NextResponse.json({ message: 'cached' }, { status: 200 })
        }
        if (cooldown && same) {
          return NextResponse.json({ message: 'cached' }, { status: 200 })
        }
      } else if (cooldown && same) {
        return NextResponse.json({ message: 'cached' }, { status: 200 })
      }
    }

    // ── 5. Llamar a la IA ─────────────────────────────────────────────────────
    // Supports OpenAI and any OpenAI-compatible API (DeepSeek, etc.)
    // Set AI_API_URL + AI_API_KEY + AI_MODEL in env to switch provider
    const apiKey  = process.env.AI_API_KEY ?? process.env.OPENAI_API_KEY
    const apiUrl  = process.env.AI_API_URL ?? 'https://api.openai.com/v1'
    const aiModel = process.env.AI_MODEL   ?? 'gpt-4.1-mini'

    // A05: generic error — don't expose which provider or env var is missing
    if (!apiKey) return NextResponse.json({ error: 'Analysis service unavailable' }, { status: 503 })

    // DeepSeek and most OpenAI-compatible APIs use json_object (not json_schema strict mode)
    const isOpenAI = apiUrl.includes('openai.com')
    const responseFormat = isOpenAI
      ? { type: 'json_schema', json_schema: { name: 'monthly_insights', strict: true, schema: INSIGHTS_SCHEMA } }
      : { type: 'json_object' }

    const aiRes = await fetch(`${apiUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model:           aiModel,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user',   content: JSON.stringify(payload) },
        ],
        response_format: responseFormat,
        temperature:     0.3,
        max_tokens:      1200,
      }),
    })

    if (!aiRes.ok) {
      // A05: don't forward upstream error details to client
      console.error('AI API error:', aiRes.status, await aiRes.text())
      return NextResponse.json({ error: 'Analysis service unavailable' }, { status: 502 })
    }

    const aiJson  = await aiRes.json()
    const content = aiJson.choices?.[0]?.message?.content

    if (!content) {
      console.error('AI empty response')
      return NextResponse.json({ error: 'Analysis service unavailable' }, { status: 502 })
    }

    // ── A08: Defensive parse + structural validation ──────────────────────────
    let result: { opportunities: unknown[] }
    try {
      const parsed = JSON.parse(content)
      if (!parsed || !Array.isArray(parsed.opportunities)) {
        throw new Error('opportunities is not an array')
      }
      result = parsed as { opportunities: unknown[] }
    } catch (err) {
      console.error('AI response parse error:', err)
      return NextResponse.json({ error: 'Analysis service unavailable' }, { status: 502 })
    }

    // DEBUG: log raw DeepSeek response to diagnose validation failures
    // ── A08: Whitelist-validate each insight before saving ────────────────────
    // Re-validate AI output against known enums and filter expense_ids to only
    // IDs that actually belong to this user's expenses (prevents hallucinated UUIDs)
    const safeOpportunities = result.opportunities
      .filter((op): op is Record<string, unknown> => typeof op === 'object' && op !== null)
      .filter(op =>
        typeof op.type        === 'string' && VALID_TYPES.has(op.type)        &&
        typeof op.severity    === 'string' && VALID_SEVERITY.has(op.severity) &&
        typeof op.action      === 'string' && VALID_ACTIONS.has(op.action)    &&
        typeof op.title       === 'string' && op.title.length > 0             &&
        typeof op.description === 'string' && op.description.length > 0
      )
      .slice(0, 3)
      .map(op => ({
        type:          op.type as string,
        title:         String(op.title).slice(0, 120),
        description:   String(op.description).slice(0, 500),
        impact_amount: typeof op.impact_amount === 'number' && Number.isInteger(op.impact_amount) && op.impact_amount > 0
          ? op.impact_amount : null,
        severity:      op.severity as string,
        confidence:    typeof op.confidence === 'number' ? Math.max(0, Math.min(1, op.confidence)) : 0.5,
        // A08: only keep IDs that exist in this user's actual expenses
        expense_ids:   Array.isArray(op.expense_ids)
          ? (op.expense_ids as unknown[]).filter(id => typeof id === 'string' && validExpenseIds.has(id)).slice(0, 20)
          : [],
        action_label:  op.action_label ? String(op.action_label).slice(0, 60) : 'Ver detalle',
        action:        op.action as string,
      }))

    // ── 6. Guardar en Supabase ────────────────────────────────────────────────
    const { error: deleteError } = await supabase
      .from('monthly_insights')
      .delete()
      .eq('user_id', user.id)
      .eq('month', month)
      .eq('year', year)

    if (deleteError) console.error('delete error:', deleteError)

    if (safeOpportunities.length > 0) {
      const { error: insertError } = await supabase.from('monthly_insights').insert(
        safeOpportunities.map(op => ({
          user_id:       user.id,
          month,
          year,
          type:          op.type,
          title:         op.title,
          description:   op.description,
          impact_amount: op.impact_amount,
          severity:      op.severity,
          confidence:    op.confidence,
          expense_ids:   op.expense_ids,
          action_label:  op.action_label,
          action:        op.action,
          expenses_hash: expensesHash,
        }))
      )
      if (insertError) console.error('insert error:', insertError)
      else console.log('inserted', safeOpportunities.length, 'insights')
    }

    return NextResponse.json({ opportunities: safeOpportunities.length }, { status: 200 })
  } catch (err) {
    console.error('analyze-month error:', err)
    // A05: no stack trace, no internals in response
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
