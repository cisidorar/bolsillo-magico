import { NextResponse } from 'next/server'
import { createClient, getServerSession } from '@/lib/supabase/server'
import { computeCommittedDebt } from '@/lib/net-worth'
import { getNowChile } from '@/lib/utils'

// ── B4: Informe de cierre de mes ──────────────────────────────────────────
// Al abrir un mes YA CERRADO en /analisis, genera un resumen narrativo tipo
// asesor (3-4 frases): qué pasó, qué cambió vs el patrón, una recomendación
// para el próximo mes. Reutiliza el mismo patrón que /api/analyze-month:
// hash de datos para cache, cooldown de 10 min, validación estricta del
// output antes de guardar. Se guarda en monthly_insights con
// type='month_review' (una fila fija por mes, no una lista de oportunidades).

export const maxDuration = 30

const REVIEW_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    summary: { type: 'string' },
  },
  required: ['summary'],
}

const SYSTEM_PROMPT = `Eres un asesor financiero personal escribiendo el cierre de mes de un usuario de una app de gastos en pesos chilenos (CLP).

Reglas estrictas:
- No inventes montos ni datos. Usa solo los datos entregados.
- No recomiendes instrumentos de inversión específicos (acciones, fondos, tickers) ni prometas rentabilidades.
- Escribe EXACTAMENTE 3 a 4 frases cortas, en español, tono cercano y profesional (como un asesor, no un robot).
- Estructura: (1) qué pasó este mes en una frase, (2) qué cambió respecto a su patrón habitual (tendencia, aporte, colchón), (3) una recomendación concreta y accionable para el mes que viene.
- No uses viñetas, listas ni markdown. Solo prosa corrida.
- No critiques ni uses tono de regaño. Reconoce lo positivo cuando corresponda.
- Si falta un dato (ej. no hay meta de aporte definida), no lo menciones — trabaja solo con lo disponible.

Responde SIEMPRE con un JSON válido: {"summary": "..."}`

function validateMonthYear(body: unknown): { month: number; year: number } | null {
  if (typeof body !== 'object' || body === null) return null
  const { month, year } = body as Record<string, unknown>
  if (
    typeof month !== 'number' || !Number.isInteger(month) || month < 1 || month > 12 ||
    typeof year  !== 'number' || !Number.isInteger(year)  || year  < 2020 || year > 2099
  ) return null
  return { month, year }
}

export async function POST(request: Request) {
  try {
    const user = await getServerSession()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const parsed = validateMonthYear(body)
    if (!parsed) return NextResponse.json({ error: 'Invalid month or year' }, { status: 400 })
    const { month, year } = parsed

    // Solo meses YA CERRADOS — un mes en curso no tiene cierre que narrar.
    const { year: curYear, month: curMonth } = getNowChile()
    const isClosed = year < curYear || (year === curYear && month < curMonth)
    if (!isClosed) return NextResponse.json({ message: 'not_closed' }, { status: 200 })

    const supabase = await createClient()

    const monthStr  = String(month).padStart(2, '0')
    const startDate  = `${year}-${monthStr}-01`
    const endDate    = `${month === 12 ? year + 1 : year}-${String(month === 12 ? 1 : month + 1).padStart(2, '0')}-01`
    const prevMonth  = month === 1 ? 12 : month - 1
    const prevYear   = month === 1 ? year - 1 : year
    const prevPrevMonth = prevMonth === 1 ? 12 : prevMonth - 1
    const prevPrevYear  = prevMonth === 1 ? prevYear - 1 : prevYear

    const [
      { data: expenses },
      { data: fundingIncomeRow },
      { data: prevExpenses },
      { data: profileRow },
      { data: usdDeposits },
      { data: savingsRows },
      { data: maturedDeposits },
      { data: sixMonthExpenses },
      { data: netWorthCur },
      { data: netWorthPrev },
      committedDebtNext6m,
    ] = await Promise.all([
      supabase.from('expenses').select('amount').eq('user_id', user.id).gte('date', startDate).lt('date', endDate),
      // Sueldo que financió este mes — por convención de la app, el del mes ANTERIOR
      supabase.from('incomes').select('amount').eq('user_id', user.id).eq('month', prevMonth).eq('year', prevYear).maybeSingle(),
      supabase.from('expenses').select('amount').eq('user_id', user.id)
        .gte('date', `${prevYear}-${String(prevMonth).padStart(2, '0')}-01`).lt('date', startDate),
      supabase.from('profiles').select('monthly_invest_goal').eq('id', user.id).maybeSingle(),
      supabase.from('usd_purchases').select('total_paid_clp').eq('user_id', user.id).eq('kind', 'deposit')
        .gte('purchase_date', startDate).lt('purchase_date', endDate),
      supabase.from('savings_accounts').select('balance').eq('user_id', user.id),
      supabase.from('term_deposits').select('amount, interest_rate').eq('user_id', user.id).lt('maturity_date', endDate),
      // 6 meses previos al mes analizado, para el promedio de gasto (fondo de emergencia)
      supabase.from('expenses').select('amount, date').eq('user_id', user.id)
        .gte('date', `${new Date(year, month - 7, 1).getFullYear()}-${String(new Date(year, month - 7, 1).getMonth() + 1).padStart(2, '0')}-01`)
        .lt('date', startDate),
      supabase.from('net_worth_snapshots').select('net_clp').eq('user_id', user.id).eq('month', month).eq('year', year).maybeSingle(),
      supabase.from('net_worth_snapshots').select('net_clp').eq('user_id', user.id).eq('month', prevPrevMonth).eq('year', prevPrevYear).maybeSingle(),
      computeCommittedDebt(supabase, user.id, new Date(year, month, 0)),
    ])

    if (!expenses || expenses.length === 0) {
      return NextResponse.json({ message: 'no_expenses' }, { status: 200 })
    }

    const totalMonth = expenses.reduce((s: number, e: { amount: number }) => s + e.amount, 0)
    const totalPrev  = (prevExpenses ?? []).reduce((s: number, e: { amount: number }) => s + e.amount, 0)
    const fundingIncome     = (fundingIncomeRow as { amount?: number } | null)?.amount ?? null
    const monthlyInvestGoal = (profileRow as { monthly_invest_goal?: number | null } | null)?.monthly_invest_goal ?? null
    const investedThisMonth = ((usdDeposits ?? []) as { total_paid_clp: number }[]).reduce((s, r) => s + r.total_paid_clp, 0)
    const savingsRatePct    = fundingIncome && fundingIncome > 0
      ? Math.round(((fundingIncome - totalMonth - investedThisMonth) / fundingIncome) * 100)
      : null

    const monthTotals: Record<string, number> = {}
    for (const e of (sixMonthExpenses ?? []) as { amount: number; date: string }[]) {
      const k = e.date.slice(0, 7)
      monthTotals[k] = (monthTotals[k] ?? 0) + e.amount
    }
    const completedTotals   = Object.values(monthTotals).filter(v => v > 0)
    const avgMonthlyExpense = completedTotals.length > 0
      ? Math.round(completedTotals.reduce((s, v) => s + v, 0) / completedTotals.length)
      : null
    const savingsTotal  = ((savingsRows ?? []) as { balance: number }[]).reduce((s, r) => s + r.balance, 0)
    const maturedLiquid = ((maturedDeposits ?? []) as { amount: number; interest_rate: number }[])
      .reduce((s, d) => s + d.amount + Math.round(d.amount * (Number(d.interest_rate) / 100)), 0)
    const emergencyFundMonths = avgMonthlyExpense && avgMonthlyExpense > 0
      ? Math.round(((savingsTotal + maturedLiquid) / avgMonthlyExpense) * 10) / 10
      : null

    const curNet  = (netWorthCur as { net_clp?: number | null } | null)?.net_clp ?? null
    const prevNet = (netWorthPrev as { net_clp?: number | null } | null)?.net_clp ?? null
    const netWorthDelta = curNet !== null && prevNet !== null ? curNet - prevNet : null

    const MONTH_NAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
    const payload = {
      period:                  `${MONTH_NAMES[month - 1]} ${year}`,
      total_expense:           totalMonth,
      previous_month_expense:  totalPrev > 0 ? totalPrev : null,
      delta_vs_prev_pct:       totalPrev > 0 ? Math.round(((totalMonth - totalPrev) / totalPrev) * 100) : null,
      funding_income:          fundingIncome,
      savings_rate_pct:        savingsRatePct,
      monthly_invest_goal:     monthlyInvestGoal,
      invested_this_month:     investedThisMonth,
      invest_goal_met:         monthlyInvestGoal ? investedThisMonth >= monthlyInvestGoal : null,
      emergency_fund_months:   emergencyFundMonths,
      committed_debt_next_6m:  committedDebtNext6m,
      net_worth_delta_clp:     netWorthDelta,
    }

    // ── Cache + rate limit (mismo patrón que analyze-month) ──────────────────
    const dataHash = `${totalMonth}::${totalPrev}::${monthlyInvestGoal ?? 'x'}::${investedThisMonth}::${netWorthDelta ?? 'x'}::${emergencyFundMonths ?? 'x'}`

    const { data: existing } = await supabase
      .from('monthly_insights')
      .select('generated_at, expenses_hash')
      .eq('user_id', user.id)
      .eq('month', month)
      .eq('year', year)
      .eq('type', 'month_review')
      .eq('status', 'active')
      .limit(1)
      .maybeSingle()

    if (existing) {
      const ageMs    = Date.now() - new Date(existing.generated_at).getTime()
      const cooldown = ageMs < 10 * 60 * 1000
      const same     = existing.expenses_hash === dataHash
      // Un mes cerrado rara vez cambia — solo regenerar si el hash cambió
      // (ej. el usuario cargó gastos tarde) y respetando el cooldown.
      if (same) return NextResponse.json({ message: 'cached' }, { status: 200 })
      if (cooldown) return NextResponse.json({ message: 'cached' }, { status: 200 })
    }

    const apiKey  = process.env.AI_API_KEY ?? process.env.OPENAI_API_KEY
    const apiUrl  = process.env.AI_API_URL ?? 'https://api.openai.com/v1'
    const aiModel = process.env.AI_MODEL   ?? 'gpt-4.1-mini'

    if (!apiKey) return NextResponse.json({ error: 'Analysis service unavailable' }, { status: 503 })

    const isOpenAI = apiUrl.includes('openai.com')
    const responseFormat = isOpenAI
      ? { type: 'json_schema', json_schema: { name: 'month_review', strict: true, schema: REVIEW_SCHEMA } }
      : { type: 'json_object' }

    const aiRes = await fetch(`${apiUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: aiModel,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: JSON.stringify(payload) },
        ],
        response_format: responseFormat,
        temperature: 0.4,
        max_tokens: 400,
      }),
    })

    if (!aiRes.ok) {
      console.error('AI API error:', aiRes.status, await aiRes.text())
      return NextResponse.json({ error: 'Analysis service unavailable' }, { status: 502 })
    }

    const aiJson  = await aiRes.json()
    const content = aiJson.choices?.[0]?.message?.content

    if (!content) {
      console.error('AI empty response')
      return NextResponse.json({ error: 'Analysis service unavailable' }, { status: 502 })
    }

    let summary: string
    try {
      const parsedContent = JSON.parse(content)
      if (typeof parsedContent.summary !== 'string' || !parsedContent.summary.trim()) {
        throw new Error('summary missing or empty')
      }
      summary = parsedContent.summary.trim().slice(0, 700)
    } catch (err) {
      console.error('AI response parse error:', err)
      return NextResponse.json({ error: 'Analysis service unavailable' }, { status: 502 })
    }

    await supabase.from('monthly_insights').delete()
      .eq('user_id', user.id).eq('month', month).eq('year', year).eq('type', 'month_review')

    const { error: insertError } = await supabase.from('monthly_insights').insert({
      user_id:       user.id,
      month,
      year,
      type:          'month_review',
      title:         `Resumen de ${MONTH_NAMES[month - 1]}`,
      description:   summary,
      impact_amount: null,
      severity:      null,
      confidence:    1,
      expense_ids:   [],
      action_label:  null,
      action:        null,
      expenses_hash: dataHash,
    })
    if (insertError) console.error('insert error:', insertError)

    return NextResponse.json({ generated: true }, { status: 200 })
  } catch (err) {
    console.error('month-review error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
