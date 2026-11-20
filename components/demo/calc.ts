import { RECURRING, METHODS, CATEGORIES, type DExpense } from './data'

export interface MonthCtx {
  dateStr: string; year: number; month: number; todayDate: number; hour: number; daysInMonth: number
}

export const pad = (n: number) => String(n).padStart(2, '0')
export const sum = (xs: number[]) => xs.reduce((t, x) => t + x, 0)
export const monthPrefix = (ctx: MonthCtx) => `${ctx.year}-${pad(ctx.month)}`

export function inMonth(expenses: DExpense[], prefix: string) {
  return expenses.filter(e => e.date.startsWith(prefix))
}

export function summarize(expenses: DExpense[], ctx: MonthCtx, prevTotal: number) {
  const list = inMonth(expenses, monthPrefix(ctx))
  const total = sum(list.map(e => e.amount))
  const fixedSoFar = sum(list.filter(e => e.fixed).map(e => e.amount))
  const upcoming = sum(RECURRING.filter(r => r.day > ctx.todayDate).map(r => r.amount))
  const debitSpent = sum(list.filter(e => METHODS.find(m => m.id === e.methodId)!.type !== 'credit').map(e => e.amount))
  const projection = ctx.todayDate > 0
    ? Math.round(((total - fixedSoFar) / ctx.todayDate) * ctx.daysInMonth) + fixedSoFar + upcoming
    : total
  const delta = prevTotal > 0 ? Math.round(((total - prevTotal) / prevTotal) * 100) : null

  const byCat = CATEGORIES
    .map(c => ({ cat: c, total: sum(list.filter(e => e.categoryId === c.id).map(e => e.amount)) }))
    .filter(x => x.total > 0)
    .sort((a, b) => b.total - a.total)

  return { list, total, fixedSoFar, upcoming, debitSpent, projection, delta, byCat }
}

export function nextChargeDate(day: number, ctx: MonthCtx): string {
  let y = ctx.year, m = ctx.month
  if (day < ctx.todayDate) { m += 1; if (m === 13) { m = 1; y += 1 } }
  const last = new Date(y, m, 0).getDate()
  return `${y}-${pad(m)}-${pad(Math.min(day, last))}`
}
