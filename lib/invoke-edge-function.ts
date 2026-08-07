// ── Invocar una Edge Function de Supabase desde un cron de Vercel ────────────
//
// Ago 2026 (bug encontrado revisando el repo, después del reporte de Cas "hace
// el análisis pero no llega correo diario"). El patrón de toda la app es:
//
//   cron de Vercel (Node) → calcula y persiste en una tabla
//                         → Edge Function (Deno) lee la tabla y manda el mail
//
// La primera mitad estaba escrita y funcionando; la segunda mitad NUNCA se
// llamaba. Las Edge Functions existían, los comentarios de cada cron decían
// "la lee la Edge Function X para mandar el correo", pero no había ni un
// pg_cron configurado ni un fetch en el código que las disparara. Resultado:
// daily_signals / weekly_reports / fomc_alerts se llenaban prolijamente todos
// los días y ningún correo salía jamás.
//
// Este helper centraliza esa llamada para que el patrón quede en UN lugar y no
// se pueda volver a olvidar la mitad. Es deliberadamente tolerante a fallos: el
// correo es secundario respecto a tener los datos del día persistidos, así que
// un error acá se loguea con prefijo grepeable y se devuelve, nunca se lanza.

export interface EdgeInvokeResult {
  ok:      boolean
  /** Cuerpo JSON devuelto por la Edge Function (sent/skipped/users/error). */
  body?:   unknown
  /** Mensaje de error si la llamada ni siquiera llegó a completarse. */
  error?:  string
}

export async function invokeEdgeFunction(
  supabaseUrl:  string,
  serviceKey:   string,
  functionName: string,
  { timeoutMs = 20_000 }: { timeoutMs?: number } = {},
): Promise<EdgeInvokeResult> {
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type':  'application/json',
      },
      signal: AbortSignal.timeout(timeoutMs),
    })

    const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))

    if (!res.ok) {
      console.error(`[edge/${functionName}] error HTTP ${res.status}:`, body)
      return { ok: false, body }
    }
    console.log(`[edge/${functionName}] ok:`, body)
    return { ok: true, body }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[edge/${functionName}] no alcanzó a enviarse:`, message)
    return { ok: false, error: message }
  }
}
