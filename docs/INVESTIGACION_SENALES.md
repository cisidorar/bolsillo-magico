# Investigación de señales — ¿qué predice el motor?

_Generado por `scripts/signal-research.ts` el 2026-11-23. Metodología en `lib/signal-research.ts`; plan en `docs/PLAN_MOTOR_PREDICCION.md`._

- Universo: 65 tickers (watchlist + grandes empresas de varios sectores), 2017-12-06 → 2026-11-23.
- 28400 muestras ticker-semana. Cada una corre `analyze()` solo con velas hasta ese día (ventana de 430, igual que producción).
- Medida: retorno **excedente vs SPY** (dividendos incluidos). "Lift" = excedente de la condición − excedente promedio del universo ese mismo período.
- t: con agrupación por fecha y N efectivo corregido por solapamiento. |t| ≥ 2 **y** mismo signo en ambas mitades = evidencia. Con ~28 condiciones probadas, 1-2 "evidencias" pueden ser suerte.
- Sesgo de supervivencia: todos los tickers existen hoy. Infla el retorno del universo, pero afecta poco el *lift* (comparación dentro del mismo universo).
- La convicción se calcula **sin** track record (el 20% de backtest por ticker), igual que cuando falta historia.

## Condiciones del motor — 20 ruedas (~1 mes)

| Condición | N | Semanas | Exc. vs SPY % | Lift vs universo | t | Lift 1ª mitad | Lift 2ª mitad | ¿Evidencia? |
|---|---|---|---|---|---|---|---|---|
| overextended_ext | 1006 | 345 | +2.87 | +2.32 | +1.30 | +0.76 | +3.90 | estable, débil |
| hot_zone_sell_now | 4194 | 503 | +1.34 | +0.79 | +0.92 | +0.15 | +1.54 | estable, débil |
| zone_caro | 9270 | 597 | +0.84 | +0.30 | +0.42 | +0.27 | +0.32 | estable, débil |
| regime_bear | 2324 | 67 | +0.81 | +0.27 | +0.38 | +0.28 | — | no |
| rsi_overbought | 2256 | 381 | +0.75 | +0.20 | +0.27 | +0.19 | +0.22 | estable, débil |
| trend_up | 15323 | 714 | +0.62 | +0.07 | +0.12 | -0.19 | +0.31 | no |
| overextended | 5661 | 504 | +0.61 | +0.07 | +0.15 | +0.84 | -0.95 | no |
| volume_up | 1639 | 424 | +0.60 | +0.06 | +0.09 | +0.21 | -0.17 | no |
| actionable_buy | 2982 | 474 | +0.58 | +0.04 | +0.10 | -0.18 | +0.33 | no |
| zone_conveniente | 2031 | 459 | +0.52 | -0.02 | -0.05 | -0.46 | +0.57 | no |
| buy_now | 3649 | 489 | +0.47 | -0.07 | -0.19 | -0.25 | +0.16 | no |
| rating_strong_buy | 38 | 36 | +0.45 | -0.09 | -0.04 | -1.25 | +1.74 | no |
| volume_down | 1927 | 418 | +0.43 | -0.12 | -0.18 | +0.35 | -0.76 | no |
| rating_buy | 4262 | 507 | +0.38 | -0.17 | -0.45 | -0.26 | -0.05 | estable, débil |
| macd_bull | 8354 | 562 | +0.27 | -0.27 | -0.61 | -0.41 | -0.11 | estable, débil |
| rsi_oversold | 896 | 263 | +0.23 | -0.31 | -0.33 | +0.10 | -0.81 | no |
| death_cross | 806 | 331 | +0.22 | -0.32 | -0.45 | +0.05 | -0.77 | no |
| near_support | 4610 | 491 | +0.18 | -0.36 | -0.97 | -0.24 | -0.52 | estable, débil |
| zone_justo | 6862 | 583 | +0.15 | -0.39 | -1.40 | -0.29 | -0.50 | estable, débil |
| divergence_bear | 1587 | 418 | +0.10 | -0.44 | -0.73 | -0.12 | -0.88 | estable, débil |
| near_52w_high | 3882 | 480 | +0.11 | -0.44 | -0.84 | -0.40 | -0.48 | estable, débil |
| macd_bear | 8287 | 560 | +0.09 | -0.45 | -0.78 | -0.12 | -0.82 | estable, débil |
| rating_sell | 3892 | 491 | +0.01 | -0.53 | -1.02 | -0.08 | -1.10 | estable, débil |
| near_resistance | 5878 | 546 | -0.06 | -0.61 | -1.29 | -0.26 | -1.00 | estable, débil |
| trend_down | 6102 | 484 | -0.24 | -0.78 | -1.65 | -0.66 | -0.93 | estable, débil |
| near_52w_low | 1554 | 350 | -0.32 | -0.86 | -1.32 | -1.00 | -0.71 | estable, débil |
| golden_cross | 814 | 322 | -0.46 | -1.00 | -1.54 | -0.55 | -1.62 | estable, débil |
| divergence_bull | 925 | 306 | -0.52 | -1.06 | -1.24 | -0.15 | -2.14 | estable, débil |

## Condiciones del motor — 60 ruedas (~3 meses)

| Condición | N | Semanas | Exc. vs SPY % | Lift vs universo | t | Lift 1ª mitad | Lift 2ª mitad | ¿Evidencia? |
|---|---|---|---|---|---|---|---|---|
| overextended_ext | 986 | 333 | +10.38 | +8.63 | +1.21 | +3.65 | +13.77 | estable, débil |
| hot_zone_sell_now | 4135 | 487 | +4.83 | +3.08 | +0.80 | +2.19 | +4.18 | estable, débil |
| zone_caro | 9139 | 580 | +3.36 | +1.61 | +0.54 | +1.26 | +2.03 | estable, débil |
| overextended | 5570 | 493 | +2.40 | +0.65 | +0.40 | +2.07 | -1.16 | no |
| regime_bear | 2324 | 67 | +2.05 | +0.30 | +0.19 | +0.64 | -4.30 | no |
| rating_strong_buy | 37 | 35 | +1.60 | -0.16 | -0.02 | -4.01 | +5.05 | no |
| actionable_buy | 2904 | 461 | +1.59 | -0.16 | -0.13 | -0.47 | +0.29 | no |
| trend_up | 15031 | 690 | +1.59 | -0.17 | -0.07 | -0.42 | +0.04 | no |
| volume_down | 1892 | 410 | +1.49 | -0.26 | -0.14 | +0.93 | -1.81 | no |
| buy_now | 3561 | 476 | +1.36 | -0.39 | -0.34 | -0.56 | -0.11 | estable, débil |
| rsi_overbought | 2228 | 374 | +1.23 | -0.52 | -0.24 | +1.34 | -2.64 | no |
| death_cross | 798 | 326 | +1.19 | -0.56 | -0.25 | -0.35 | -0.77 | estable, débil |
| zone_conveniente | 1964 | 446 | +1.18 | -0.57 | -0.40 | -0.90 | -0.05 | estable, débil |
| macd_bear | 8143 | 546 | +1.04 | -0.71 | -0.36 | -0.48 | -0.94 | estable, débil |
| rating_buy | 4166 | 493 | +1.02 | -0.73 | -0.62 | -0.95 | -0.40 | estable, débil |
| near_resistance | 5759 | 532 | +0.91 | -0.84 | -0.42 | -1.03 | -0.58 | estable, débil |
| near_support | 4498 | 478 | +0.73 | -1.02 | -0.88 | -0.25 | -1.97 | estable, débil |
| golden_cross | 792 | 312 | +0.72 | -1.04 | -0.43 | +0.82 | -3.55 | no |
| divergence_bear | 1569 | 410 | +0.66 | -1.09 | -0.57 | -0.22 | -2.18 | estable, débil |
| rating_sell | 3837 | 482 | +0.66 | -1.10 | -0.62 | -0.61 | -1.66 | estable, débil |
| macd_bull | 8203 | 548 | +0.61 | -1.15 | -0.70 | -1.07 | -1.20 | estable, débil |
| zone_justo | 6702 | 568 | +0.51 | -1.24 | -1.58 | -0.68 | -1.83 | estable, débil |
| volume_up | 1619 | 418 | +0.34 | -1.41 | -0.81 | -1.01 | -1.89 | estable, débil |
| near_52w_high | 3845 | 472 | -0.24 | -2.00 | -1.42 | -0.97 | -3.16 | estable, débil |
| rsi_oversold | 876 | 255 | -0.30 | -2.06 | -0.72 | +0.08 | -4.61 | no |
| divergence_bull | 910 | 299 | -0.99 | -2.74 | -1.15 | -0.97 | -4.77 | estable, débil |
| trend_down | 6014 | 476 | -1.25 | -3.00 | -1.95 | -2.46 | -3.61 | estable, débil |
| near_52w_low | 1533 | 342 | -1.74 | -3.50 | -1.77 | -2.91 | -4.08 | estable, débil |

## Score de convicción por tramo (20 ruedas)

| Condición | N | Semanas | Exc. vs SPY % | Lift vs universo | t | Lift 1ª mitad | Lift 2ª mitad | ¿Evidencia? |
|---|---|---|---|---|---|---|---|---|
| convicción 0–39 | 8184 | 533 | +0.12 | -0.42 | -0.85 | -0.06 | -0.80 | estable, débil |
| convicción 40–54 | 11820 | 635 | -0.04 | -0.58 | -1.49 | -0.14 | -1.10 | estable, débil |
| convicción 55–69 | 5942 | 555 | +0.83 | +0.29 | +0.63 | -0.08 | +0.73 | no |
| convicción 70–100 | 2194 | 466 | +0.98 | +0.44 | +0.66 | +0.20 | +0.77 | estable, débil |

## Factores continuos — quintiles transversales

Cada semana se ordenan las acciones por la variable y se reparten en 5 grupos (Q1 = más bajo). Q5−Q1 > 0 = valores altos rinden más.

| Variable | Q1 | Q2 | Q3 | Q4 | Q5 | Q5−Q1 | Q5−Q1 1ª mitad | Q5−Q1 2ª mitad |
|---|---|---|---|---|---|---|---|---|
| mom12_1 (20r) | +0.40 | -0.20 | +0.16 | +0.24 | +0.78 | **+0.38** | -0.08 | +1.09 |
| mom12_1 (60r) | +1.17 | -0.44 | +0.36 | +0.46 | +2.67 | **+1.50** | -0.77 | +5.13 |
| distHigh (20r) | +0.53 | +0.42 | +0.09 | +0.31 | +0.01 | **-0.52** | -0.85 | -0.02 |
| distHigh (60r) | +1.65 | +1.64 | +0.39 | +0.76 | -0.26 | **-1.91** | -2.35 | -1.22 |
| distSma200 (20r) | +0.21 | -0.05 | +0.16 | +0.22 | +0.85 | **+0.64** | +0.45 | +0.92 |
| distSma200 (60r) | +0.47 | -0.16 | +0.45 | +0.68 | +2.84 | **+2.37** | +1.33 | +4.06 |
| conviction (20r) | +0.13 | +0.14 | +0.11 | +0.38 | +0.64 | **+0.51** | -0.06 | +1.37 |
| conviction (60r) | +0.45 | +0.37 | +0.53 | +1.32 | +1.60 | **+1.15** | -0.25 | +3.38 |
| rsi (20r) | +0.23 | +0.21 | +0.34 | +0.32 | +0.26 | **+0.03** | -0.05 | +0.15 |
| rsi (60r) | +0.50 | +0.93 | +1.29 | +0.82 | +0.67 | **+0.17** | +0.45 | -0.28 |
| atrPct (20r) | -0.24 | -0.26 | +0.22 | +0.29 | +1.41 | **+1.65** | +1.24 | +2.25 |
| atrPct (60r) | -0.58 | -0.78 | +0.58 | +0.31 | +4.82 | **+5.40** | +4.19 | +7.33 |

- `mom12_1`: retorno de 12 meses excluyendo el último. `distHigh`: % bajo el máximo de 52 semanas (0 = en máximos). `distSma200`: % sobre la media de 200. `atrPct`: volatilidad diaria.
