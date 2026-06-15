import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

/* ── Parsear CSV simple (sin dependencias externas) ─────────────────────── */
function parseCSV(text: string): string[][] {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  return lines
    .filter(l => l.trim())
    .map(line => {
      const cells: string[] = []
      let cur = ''
      let inQ = false
      for (let i = 0; i < line.length; i++) {
        const ch = line[i]
        if (ch === '"') { inQ = !inQ; continue }
        if ((ch === ',' || ch === ';') && !inQ) { cells.push(cur.trim()); cur = ''; continue }
        cur += ch
      }
      cells.push(cur.trim())
      return cells
    })
}

/* ── Detectar índice de columna por nombre ──────────────────────────────── */
function findCol(headers: string[], ...candidates: string[]): number {
  const h = headers.map(s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''))
  for (const c of candidates) {
    const norm = c.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    const idx  = h.findIndex(hh => hh.includes(norm))
    if (idx !== -1) return idx
  }
  return -1
}

/* ── Parsear fecha flexible ─────────────────────────────────────────────── */
function parseDate(raw: string): string | null {
  const s = raw.trim()
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  // DD/MM/YYYY o DD-MM-YYYY
  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/)
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2,'0')}-${dmy[1].padStart(2,'0')}`
  // DD/MM/YY
  const dmy2 = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2})$/)
  if (dmy2) {
    const yr = parseInt(dmy2[3]) < 50 ? `20${dmy2[3]}` : `19${dmy2[3]}`
    return `${yr}-${dmy2[2].padStart(2,'0')}-${dmy2[1].padStart(2,'0')}`
  }
  return null
}

/* ── Parsear monto: acepta $1.234, 1.234, 1234, 1,234 ──────────────────── */
function parseAmount(raw: string): number | null {
  const s = raw.replace(/[$\s]/g, '').trim()
  // Si usa punto como miles y coma como decimal: 1.234,56
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) {
    return parseFloat(s.replace(/\./g, '').replace(',', '.'))
  }
  // Si usa coma como miles: 1,234
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) {
    return parseFloat(s.replace(/,/g, ''))
  }
  // Número limpio
  const n = parseFloat(s.replace(',', '.'))
  return isNaN(n) ? null : Math.abs(n)
}

/* ── Route handler ──────────────────────────────────────────────────────── */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const form = await request.formData()
  const file = form.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No se recibió archivo' }, { status: 400 })

  const text = await file.text()
  const rows = parseCSV(text)
  if (rows.length < 2) return NextResponse.json({ error: 'El archivo está vacío' }, { status: 400 })

  const headers = rows[0]
  const data    = rows.slice(1)

  // Detectar columnas
  const iDate   = findCol(headers, 'fecha', 'date', 'dia', 'día', 'f.')
  const iDesc   = findCol(headers, 'descripcion', 'description', 'nombre', 'detalle', 'concepto', 'glosa', 'desc')
  const iAmount = findCol(headers, 'monto', 'amount', 'valor', 'precio', 'importe', 'total', 'cargo', 'gasto')
  const iCat    = findCol(headers, 'categoria', 'category', 'tipo', 'rubro')
  const iMethod = findCol(headers, 'metodo', 'method', 'pago', 'tarjeta', 'medio')

  if (iDate === -1 || iAmount === -1) {
    return NextResponse.json({
      error: 'No se encontraron las columnas de Fecha y Monto. Revisa los nombres de tus columnas.',
      headers,
    }, { status: 422 })
  }

  // Paleta de colores para categorías creadas automáticamente
  const AUTO_COLORS = [
    { color: '#0F6E56', bg_color: '#E1F5EE' },
    { color: '#185FA5', bg_color: '#E6F1FB' },
    { color: '#854F0B', bg_color: '#FAEEDA' },
    { color: '#993556', bg_color: '#FBEAF0' },
    { color: '#3B6D11', bg_color: '#EAF3DE' },
    { color: '#3C3489', bg_color: '#EEEDFE' },
    { color: '#A32D2D', bg_color: '#FCEBEB' },
    { color: '#1B6DD4', bg_color: '#EEF4FF' },
    { color: '#5F5E5A', bg_color: '#F1EFE8' },
  ]

  // Cargar categorías y métodos del usuario
  const [{ data: cats }, { data: methods }] = await Promise.all([
    supabase.from('categories').select('id, name').eq('user_id', user.id),
    supabase.from('payment_methods').select('id, name').eq('user_id', user.id),
  ])

  const catMap    = new Map((cats ?? []).map(c => [c.name.toLowerCase().trim(), c.id]))
  const methodMap = new Map((methods ?? []).map(m => [m.name.toLowerCase().trim(), m.id]))

  // Detectar categorías del CSV que no existen aún y crearlas
  if (iCat !== -1) {
    const uniqueCatNames = [...new Set(
      data.map(row => (row[iCat] ?? '').trim()).filter(Boolean)
    )]
    const missing = uniqueCatNames.filter(name => !catMap.has(name.toLowerCase()))

    if (missing.length > 0) {
      const maxOrder = (cats ?? []).length
      const newCats = missing.map((name, i) => {
        const palette = AUTO_COLORS[(maxOrder + i) % AUTO_COLORS.length]
        return {
          user_id:    user.id,
          name,
          icon:       'Tag',
          color:      palette.color,
          bg_color:   palette.bg_color,
          is_default: false,
          sort_order: maxOrder + i + 1,
        }
      })

      const { data: created } = await supabase
        .from('categories')
        .insert(newCats)
        .select('id, name')

      for (const c of created ?? []) {
        catMap.set(c.name.toLowerCase().trim(), c.id)
      }
    }
  }

  // Categoría por defecto: "Otros"
  const defaultCatId    = catMap.get('otros') ?? cats?.[0]?.id ?? null
  // Método por defecto: "Efectivo" o el primero
  const defaultMethodId = methodMap.get('efectivo') ?? methodMap.get('debito') ?? methods?.[0]?.id ?? null

  const toInsert: object[] = []
  const skipped: string[]  = []

  for (const row of data) {
    const rawDate   = iDate   !== -1 ? (row[iDate]   ?? '') : ''
    const rawAmount = iAmount !== -1 ? (row[iAmount] ?? '') : ''
    const rawDesc   = iDesc   !== -1 ? (row[iDesc]   ?? '') : ''
    const rawCat    = iCat    !== -1 ? (row[iCat]    ?? '') : ''
    const rawMethod = iMethod !== -1 ? (row[iMethod] ?? '') : ''

    const date   = parseDate(rawDate)
    const amount = parseAmount(rawAmount)

    if (!date || !amount || amount <= 0) {
      skipped.push(rawDate || '(sin fecha)')
      continue
    }

    const catId    = catMap.get(rawCat.toLowerCase().trim())    ?? defaultCatId
    const methodId = methodMap.get(rawMethod.toLowerCase().trim()) ?? defaultMethodId

    toInsert.push({
      user_id:           user.id,
      date,
      amount,
      description:       rawDesc || null,
      category_id:       catId,
      payment_method_id: methodId,
    })
  }

  if (toInsert.length === 0) {
    return NextResponse.json({ error: 'No se pudo procesar ninguna fila. Revisa el formato de fecha y monto.' }, { status: 422 })
  }

  const { error } = await supabase.from('expenses').insert(toInsert)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const newCatsCount = iCat !== -1
    ? [...new Set(data.map(row => (row[iCat] ?? '').trim()).filter(Boolean))]
        .filter(name => !(cats ?? []).some(c => c.name.toLowerCase().trim() === name.toLowerCase()))
        .length
    : 0

  return NextResponse.json({
    imported:      toInsert.length,
    skipped:       skipped.length,
    newCategories: newCatsCount,
    columns:       { date: headers[iDate], amount: headers[iAmount], desc: iDesc !== -1 ? headers[iDesc] : null, cat: iCat !== -1 ? headers[iCat] : null },
  })
}
