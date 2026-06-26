import { NextResponse } from 'next/server'
import { createClient, getServerSession } from '@/lib/supabase/server'

// ── JSON Schema para Structured Outputs ──────────────────────────────────────
const INSIGHTS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    opportunities: {
      type: 'array',
      maxItems: 3,
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
            ],
          },
          title: { type: 'string' },
          description: { type: 'string' },
          impact_amount: { type: ['integer', 'null'] },
          severity: { type: 'string', enum: ['low', 'medium', 'high'] },
          confidence: { type: 'number' },
          expense_ids: { type: 'array', items: { type: 'string' } },
          action_label: { type: 'string' },
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

const SYSTEM_PROMPT = `Eres un analista financiero personal dentro de una app de gastos en pesos chilenos (CLP).
Tu tarea es encontrar patrones mensuales útiles y convertirlos en oportunidades de mejora accionables.

Reglas estrictas:
- No inventes montos ni datos. Usa solo los datos entregados.
- No des consejos financieros complejos ni de inversión.
- Prioriza oportunidades concretas y accionables.
- Devuelve máximo 3 oportunidades.
- Cada oportunidad debe tener evidencia clara en los datos.
- Si no hay evidencia suficiente, no generes la oportunidad.
- No critiques al usuario. Usa frases prácticas, suaves y empáticas.
- Los montos son siempre en pesos chilenos (CLP), sin decimales.

Busca patrones como:
1. Compras únicas grandes que distorsionan el mes (electrodomésticos, viajes, multas).
2. Suscripciones o servicios sin presupuesto definido.
3. Categorías que subieron mucho frente al historial.
4. Gastos pequeños frecuentes que juntos suman una cantidad relevante.
5. Categorías sobre presupuesto con evidencia de gasto discrecional (no solo recurrentes fijos).
6. Gastos que aparecen por primera vez y podrían volverse recurrentes.`

export async function POST(request: Request) {
  try {
    const user = await getServerSession()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { month, year } = await request.json() as { month: number; year: number }
    if (!month || !year) return NextResponse.json({ error: 'month and year required' }, { status: 400 })

    const supabase = await createClient()

    // ── 1. Construir payload de análisis ──────────────────────────────────────
    const monthStr   = String(month).padStart(2, '0')
    const startDate  = `${year}-${monthStr}-01`
    const endDate    = `${month === 12 ? year + 1 : year}-${String(month === 12 ? 1 : month + 1).padStart(2, '0')}-01`

    const prevMonth  = month === 1 ? 12 : month - 1
    const prevYear   = month === 1 ? year - 1 : year
    const prevStart  = `${prevYear}-${String(prevMonth).padStart(2, '0')}-01`

    const [
      { data: expenses },
      { data: prevExpenses },
      { data: categoryBudgets },
      { data: incomeRow },
      { data: monthBudget },
    ] = await Promise.all([
      supabase
        .from('expenses')
        .select('id, amount, description, date, category:categories(id, name), recurring_expense_id')
        .eq('user_id', user.id)
        .gte('date', startDate)
        .lt('date', endDate)
        .order('amount', { ascending: false }),
      supabase
        .from('expenses')
        .select('amount')
        .eq('user_id', user.id)
        .gte('date', prevStart)
        .lt('date', startDate),
      supabase.from('category_budgets').select('*').eq('user_id', user.id),
      supabase.from('incomes').select('amount').eq('user_id', user.id).eq('month', month).eq('year', year).maybeSingle(),
      supabase.from('budgets').select('amount').eq('user_id', user.id).eq('month', month).eq('year', year).maybeSingle(),
    ])

    if (!expenses || expenses.length === 0) {
      return NextResponse.json({ message: 'no_expenses' }, { status: 200 })
    }

    // ── 2. Calcular señales para enriquecer el payload ────────────────────────
    const totalMonth    = expenses.reduce((s: number, e: any) => s + e.amount, 0)
    const totalPrev     = (prevExpenses ?? []).reduce((s: number, e: any) => s + e.amount, 0)
    const income        = (incomeRow as any)?.amount ?? null
    const globalBudget  = (monthBudget as any)?.amount ?? null
    const catBudgetMap  = new Map(((categoryBudgets ?? []) as any[]).map((b: any) => [b.category_id, b.amount]))

    // Agrupar por categoría
    const byCat: Record<string, { name: string; total: number; count: number; recurring: number; budget: number | null }> = {}
    for (const e of (expenses ?? []) as any[]) {
      const catId   = e.category?.id ?? 'sin-categoria'
      const catName = e.category?.name ?? 'Sin categoría'
      if (!byCat[catId]) byCat[catId] = { name: catName, total: 0, count: 0, recurring: 0, budget: catBudgetMap.get(catId) ?? null }
      byCat[catId].total += e.amount
      byCat[catId].count++
      if (e.recurring_expense_id) byCat[catId].recurring += e.amount
    }

    // Gastos individuales con señales pre-calculadas (top 20 por monto)
    const topExpenses = ((expenses ?? []) as any[]).slice(0, 20).map((e: any) => ({
      id: e.id,
      description: e.description ?? 'Sin descripción',
      amount: e.amount,
      category: e.category?.name ?? 'Sin categoría',
      date: e.date,
      monthly_impact_pct: Math.round((e.amount / totalMonth) * 100),
      is_recurring: !!e.recurring_expense_id,
    }))

    // Percentil 90 de montos históricos (proxy simple: mes anterior)
    const allAmounts  = [...(prevExpenses ?? []) as any[], ...(expenses ?? []) as any[]].map((e: any) => e.amount).sort((a: number, b: number) => a - b)
    const p90Idx      = Math.floor(allAmounts.length * 0.9)
    const p90Amount   = allAmounts[p90Idx] ?? totalMonth

    const payload = {
      period: `${['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'][month - 1]} ${year}`,
      income,
      total_expense: totalMonth,
      previous_month_expense: totalPrev > 0 ? totalPrev : null,
      global_budget: globalBudget,
      delta_vs_prev_pct: totalPrev > 0 ? Math.round(((totalMonth - totalPrev) / totalPrev) * 100) : null,
      expense_count: (expenses ?? []).length,
      categories: Object.values(byCat).sort((a: any, b: any) => b.total - a.total).map((c: any) => ({
        name: c.name,
        total: c.total,
        count: c.count,
        recurring_amount: c.recurring,
        discretionary_amount: c.total - c.recurring,
        budget: c.budget,
        over_budget: c.budget ? c.total > c.budget : false,
        budget_pct: c.budget ? Math.round((c.total / c.budget) * 100) : null,
      })),
      top_expenses: topExpenses,
      historical_context: {
        p90_single_expense: p90Amount,
        note: 'Un gasto individual muy superior a este percentil sugiere compra atípica.',
      },
    }

    // ── 3. Hash para cache (total::count) ─────────────────────────────────────
    const expensesHash = `${totalMonth}::${(expenses ?? []).length}`

    // ── 4. Verificar cache: ¿ya existe insight fresco con mismo hash? ──────────
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
      const ageMs  = Date.now() - new Date(existing.generated_at).getTime()
      const stale  = ageMs > 6 * 3600 * 1000  // 6 horas
      const same   = existing.expenses_hash === expensesHash
      if (!stale && same) return NextResponse.json({ message: 'cached' }, { status: 200 })
    }

    // ── 5. Llamar a la IA ─────────────────────────────────────────────────────
    const apiKey   = process.env.OPENAI_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'AI not configured' }, { status: 503 })

    const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: process.env.AI_MODEL ?? 'gpt-4.1-mini',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user',   content: JSON.stringify(payload) },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'monthly_insights', strict: true, schema: INSIGHTS_SCHEMA },
        },
        temperature: 0.3,
        max_tokens: 1200,
      }),
    })

    if (!aiRes.ok) {
      const err = await aiRes.text()
      console.error('AI API error:', err)
      return NextResponse.json({ error: 'AI call failed' }, { status: 502 })
    }

    const aiJson   = await aiRes.json()
    const content  = aiJson.choices?.[0]?.message?.content
    if (!content) return NextResponse.json({ error: 'Empty AI response' }, { status: 502 })

    const result = JSON.parse(content) as { opportunities: any[] }

    // ── 6. Guardar en Supabase (borrar anteriores del mismo mes primero) ───────
    await supabase
      .from('monthly_insights')
      .delete()
      .eq('user_id', user.id)
      .eq('month', month)
      .eq('year', year)

    if (result.opportunities.length > 0) {
      await supabase.from('monthly_insights').insert(
        result.opportunities.map((op: any) => ({
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
    }

    return NextResponse.json({ opportunities: result.opportunities.length }, { status: 200 })
  } catch (err) {
    console.error('analyze-month error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
