import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

function escapeCSV(val: string | number | null | undefined): string {
  if (val === null || val === undefined) return ''
  let str = String(val)
  // Prevenir CSV injection: Excel ejecuta celdas que empiezan con =, +, -, @
  if (/^[=+\-@\t\r]/.test(str)) str = `'${str}`
  // Wrap in quotes si contiene coma, comilla o salto de línea
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })

  const { data: expenses, error } = await supabase
    .from('expenses')
    .select('*, category:categories(name), payment_method:payment_methods(name)')
    .eq('user_id', user.id)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })

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
  const bom = '﻿' // UTF-8 BOM para que Excel abra bien tildes y ñ

  return new NextResponse(bom + csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="gstos-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  })
}
