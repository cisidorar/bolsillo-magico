// ── Curva de rendimiento 10Y-2Y: la señal macro más citada de recesión ───────
// Cuando el bono a 10 años rinde MENOS que el de 2 años ("curva invertida"),
// el mercado está diciendo que espera tasas más bajas en el futuro — casi
// siempre porque anticipa una desaceleración. No es un cálculo opinado: es
// una resta y una comparación, el mismo hecho que cualquier analista mira en
// el mismo dato público (FRED DGS10/DGS2).

export interface YieldCurveResult {
  spread:   number    // DGS10 - DGS2, en puntos porcentuales (puede ser negativo)
  inverted: boolean   // true si spread < 0
}

export function computeYieldCurve(dgs10: number, dgs2: number): YieldCurveResult {
  const spread = dgs10 - dgs2
  return { spread, inverted: spread < 0 }
}
