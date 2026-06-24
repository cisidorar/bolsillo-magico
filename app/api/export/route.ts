import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

function escapeCSV(val: string | number | null | undefined): string {
  if (val === null || val === undefined) return ''
  let str = String(val)
  if (/^[=+\-@\t\r]/.test(str)) str = `'${str}`
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })

  const { searchParams } = req.nextUrl
  const from = searchParams.get('from') // YYYY-MM-DD
  const to   = searchParams.get('to')   // YYYY-MM-DD (inclusive)

  let query = supabase
    .from('expenses')
    .select('*, category:categories(name), payment_method:payment_methods(name)')
    .eq('user_id', user.id)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })

  if (from) query = query.gte('date', from)
  if (to)   query = query.lte('date', to)

  const { data: expenses, error } = await query
  if (error) return new NextResponse('Error fetching expenses', { status: 500 })

  const rows = expenses ?? []
  const header = ['Fecha', 'Descripción', 'Categoría', 'Monto', 'Método de pago'].join(',')
  const lines = rows.map(e => [
    escapeCSV(e.date),
    escapeCSV(e.description),
    escapeCSV((e.category as { name: string } | null)?.name),
    escapeCSV(e.amount),
    escapeCSV((e.payment_method as { name: string } | null)?.name ?? 'Efectivo'),
  ].join(','))

  const csv = [header, ...lines].join('\n')
  const bom = '﻿'

  const suffix = from && to ? `${from}_${to}` : new Date().toISOString().slice(0, 10)

  return new NextResponse(bom + csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="gstos-${suffix}.csv"`,
    },
  })
}
