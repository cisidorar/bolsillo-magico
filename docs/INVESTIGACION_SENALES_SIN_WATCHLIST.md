# Investigación de señales — ¿qué predice el motor?

_Generado por `scripts/signal-research.ts` el 2026-11-23. Metodología en `lib/signal-research.ts`; plan en `docs/PLAN_MOTOR_PREDICCION.md`._

- Universo: 40 tickers (solo grandes empresas de varios sectores, SIN la watchlist), 2017-12-06 → 2026-11-19.
- 18040 muestras ticker-semana. Cada una corre `analyze()` solo con velas hasta ese día (ventana de 430, igual que producción).
- Medida: retorno **excedente vs SPY** (dividendos incluidos). "Lift" = excedente de la condición − excedente promedio del universo ese mismo período.
- t: con agrupación por fecha y N efectivo corregido por solapamiento. |t| ≥ 2 **y** mismo signo en ambas mitades = evidencia. Con ~28 condiciones probadas, 1-2 "evidencias" pueden ser suerte.
- Sesgo de supervivencia: todos los tickers existen hoy. Infla el retorno del universo, pero afecta poco el *lift* (comparación dentro del mismo universo).
- La convicción se calcula **sin** track record (el 20% de backtest por ticker), igual que cuando falta historia.

## Condiciones del motor — 20 ruedas (~1 mes)

| Condición | N | Semanas | Exc. vs SPY % | Lift vs universo | t | Lift 1ª mitad | Lift 2ª mitad | ¿Evidencia? |
|---|---|---|---|---|---|---|---|---|
| overextended_ext | 344 | 175 | +1.92 | +1.98 | +0.96 | +4.39 | -1.04 | no |
| rating_strong_buy | 26 | 25 | +0.68 | +0.74 | +0.36 | -0.94 | +2.55 | no |
| regime_bear | 1480 | 37 | +0.65 | +0.71 | +1.19 | +0.58 | +0.82 | estable, débil |
| overextended | 3523 | 439 | +0.52 | +0.58 | +1.15 | +1.48 | -0.30 | no |
| zone_caro | 5365 | 440 | +0.29 | +0.35 | +0.72 | +1.33 | -0.62 | no |
| volume_up | 1036 | 372 | +0.19 | +0.25 | +0.40 | +0.04 | +0.48 | estable, débil |
| volume_down | 1270 | 375 | +0.19 | +0.25 | +0.40 | +0.54 | -0.03 | no |
| actionable_buy | 1796 | 426 | +0.17 | +0.23 | +0.50 | +0.28 | +0.18 | estable, débil |
| rsi_oversold | 661 | 232 | +0.15 | +0.21 | +0.22 | +0.07 | +0.35 | estable, débil |
| rsi_overbought | 1404 | 330 | +0.14 | +0.21 | +0.33 | +0.92 | -0.48 | no |
| rating_sell | 2634 | 442 | +0.15 | +0.21 | +0.55 | +0.37 | +0.06 | estable, débil |
| near_52w_high | 2184 | 391 | +0.14 | +0.20 | +0.46 | +0.46 | -0.06 | no |
| buy_now | 2163 | 437 | +0.13 | +0.20 | +0.42 | +0.34 | +0.05 | estable, débil |
| trend_up | 8881 | 446 | +0.12 | +0.18 | +0.57 | +0.53 | -0.17 | no |
| hot_zone_sell_now | 2410 | 408 | +0.05 | +0.11 | +0.22 | +0.99 | -0.80 | no |
| rating_buy | 2571 | 433 | +0.02 | +0.08 | +0.19 | +0.36 | -0.20 | no |
| zone_conveniente | 1210 | 412 | -0.04 | +0.03 | +0.05 | -0.08 | +0.13 | no |
| near_resistance | 3716 | 446 | -0.10 | -0.03 | -0.10 | +0.18 | -0.25 | no |
| macd_bear | 5231 | 437 | -0.14 | -0.08 | -0.22 | +0.10 | -0.24 | no |
| near_support | 3044 | 445 | -0.18 | -0.11 | -0.32 | -0.15 | -0.08 | estable, débil |
| divergence_bear | 985 | 341 | -0.24 | -0.17 | -0.31 | +0.24 | -0.61 | no |
| death_cross | 535 | 257 | -0.23 | -0.17 | -0.20 | -0.86 | +0.44 | no |
| zone_justo | 4292 | 446 | -0.34 | -0.28 | -0.97 | -0.24 | -0.33 | estable, débil |
| macd_bull | 5264 | 438 | -0.35 | -0.29 | -0.85 | -0.35 | -0.22 | estable, débil |
| trend_down | 4449 | 423 | -0.38 | -0.31 | -0.76 | -0.36 | -0.26 | estable, débil |
| near_52w_low | 1159 | 324 | -0.41 | -0.35 | -0.49 | -0.81 | 0.00 | estable, débil |
| golden_cross | 546 | 261 | -0.92 | -0.86 | -1.13 | -0.49 | -1.21 | estable, débil |
| divergence_bull | 627 | 259 | -1.33 | -1.27 | -1.35 | -0.71 | -1.72 | estable, débil |

## Condiciones del motor — 60 ruedas (~3 meses)

| Condición | N | Semanas | Exc. vs SPY % | Lift vs universo | t | Lift 1ª mitad | Lift 2ª mitad | ¿Evidencia? |
|---|---|---|---|---|---|---|---|---|
| overextended_ext | 344 | 175 | +5.88 | +6.16 | +0.83 | +15.75 | -5.58 | no |
| zone_caro | 5309 | 433 | +1.24 | +1.53 | +0.80 | +3.91 | -0.84 | no |
| overextended | 3476 | 431 | +1.19 | +1.48 | +0.81 | +2.90 | +0.08 | estable, débil |
| death_cross | 527 | 252 | +1.07 | +1.36 | +0.55 | -0.07 | +2.62 | no |
| rating_strong_buy | 25 | 24 | +0.97 | +1.26 | +0.20 | -2.96 | +6.17 | no |
| hot_zone_sell_now | 2390 | 403 | +0.84 | +1.12 | +0.52 | +4.16 | -2.00 | no |
| regime_bear | 1480 | 37 | +0.74 | +1.03 | +0.71 | -1.39 | +1.91 | no |
| trend_up | 8721 | 438 | +0.44 | +0.73 | +0.62 | +1.61 | -0.14 | no |
| buy_now | 2106 | 429 | +0.26 | +0.55 | +0.33 | +0.52 | +0.58 | estable, débil |
| actionable_buy | 1744 | 418 | +0.24 | +0.53 | +0.34 | +0.29 | +0.77 | estable, débil |
| volume_down | 1245 | 367 | +0.20 | +0.48 | +0.26 | +1.26 | -0.28 | no |
| zone_conveniente | 1166 | 404 | +0.12 | +0.40 | +0.24 | -0.11 | +0.91 | no |
| rating_buy | 2507 | 425 | +0.03 | +0.32 | +0.20 | +0.39 | +0.24 | estable, débil |
| near_resistance | 3639 | 438 | -0.12 | +0.17 | +0.18 | +0.60 | -0.26 | no |
| rating_sell | 2593 | 434 | -0.14 | +0.14 | +0.10 | +0.76 | -0.45 | no |
| rsi_overbought | 1391 | 327 | -0.21 | +0.08 | +0.04 | +2.56 | -2.29 | no |
| near_support | 2966 | 437 | -0.20 | +0.08 | +0.08 | -0.08 | +0.25 | no |
| near_52w_high | 2172 | 384 | -0.20 | +0.08 | +0.06 | +1.29 | -1.15 | no |
| macd_bear | 5151 | 429 | -0.24 | +0.04 | +0.04 | +0.56 | -0.46 | no |
| golden_cross | 534 | 254 | -0.37 | -0.09 | -0.03 | +2.40 | -2.53 | no |
| zone_justo | 4192 | 438 | -0.42 | -0.13 | -0.16 | +0.08 | -0.34 | no |
| macd_bull | 5170 | 430 | -0.63 | -0.34 | -0.36 | -0.49 | -0.19 | estable, débil |
| divergence_bear | 977 | 338 | -0.65 | -0.36 | -0.17 | +1.29 | -2.07 | no |
| rsi_oversold | 646 | 226 | -0.97 | -0.68 | -0.22 | -0.57 | -0.67 | estable, débil |
| volume_up | 1024 | 366 | -1.10 | -0.82 | -0.44 | -0.81 | -0.84 | estable, débil |
| near_52w_low | 1146 | 317 | -1.43 | -1.14 | -0.56 | -1.61 | -0.69 | estable, débil |
| divergence_bull | 617 | 252 | -1.54 | -1.26 | -0.50 | -1.63 | -0.87 | estable, débil |
| trend_down | 4390 | 415 | -1.73 | -1.44 | -1.15 | -1.36 | -1.47 | estable, débil |

## Score de convicción por tramo (20 ruedas)

| Condición | N | Semanas | Exc. vs SPY % | Lift vs universo | t | Lift 1ª mitad | Lift 2ª mitad | ¿Evidencia? |
|---|---|---|---|---|---|---|---|---|
| convicción 0–39 | 5661 | 447 | -0.04 | +0.03 | +0.08 | -0.15 | +0.20 | no |
| convicción 40–54 | 7454 | 447 | -0.13 | -0.07 | -0.30 | -0.08 | -0.05 | estable, débil |
| convicción 55–69 | 3463 | 444 | -0.20 | -0.14 | -0.42 | +0.17 | -0.44 | no |
| convicción 70–100 | 1302 | 410 | +0.09 | +0.15 | +0.25 | +0.37 | -0.07 | no |

## Factores continuos — quintiles transversales

Cada semana se ordenan las acciones por la variable y se reparten en 5 grupos (Q1 = más bajo). Q5−Q1 > 0 = valores altos rinden más.

| Variable | Q1 | Q2 | Q3 | Q4 | Q5 | Q5−Q1 | Q5−Q1 1ª mitad | Q5−Q1 2ª mitad |
|---|---|---|---|---|---|---|---|---|
| mom12_1 (20r) | +0.16 | -0.44 | -0.20 | +0.15 | +0.02 | **-0.14** | -0.02 | -0.26 |
| mom12_1 (60r) | -0.04 | -0.98 | -0.65 | -0.07 | +0.32 | **+0.36** | +0.18 | +0.55 |
| distHigh (20r) | +0.11 | 0.00 | -0.28 | +0.06 | -0.20 | **-0.31** | -0.12 | -0.51 |
| distHigh (60r) | +0.07 | -0.05 | -0.65 | -0.13 | -0.66 | **-0.73** | -0.74 | -0.71 |
| distSma200 (20r) | +0.15 | -0.14 | -0.22 | -0.19 | +0.08 | **-0.07** | +0.85 | -1.00 |
| distSma200 (60r) | -0.11 | -0.58 | -0.70 | -0.07 | +0.04 | **+0.15** | +1.79 | -1.57 |
| conviction (20r) | -0.14 | +0.04 | -0.13 | 0.00 | -0.09 | **+0.05** | +0.30 | -0.21 |
| conviction (60r) | -0.30 | -0.51 | -0.62 | -0.19 | +0.20 | **+0.50** | +0.43 | +0.57 |
| rsi (20r) | +0.10 | -0.23 | +0.10 | -0.14 | -0.15 | **-0.25** | +0.12 | -0.64 |
| rsi (60r) | +0.04 | -0.36 | -0.17 | -0.65 | -0.29 | **-0.33** | +1.36 | -2.12 |
| atrPct (20r) | -0.52 | -0.31 | +0.24 | +0.17 | +0.11 | **+0.63** | +0.44 | +0.80 |
| atrPct (60r) | -1.23 | -0.86 | +0.60 | -0.21 | +0.27 | **+1.50** | +2.14 | +0.82 |

- `mom12_1`: retorno de 12 meses excluyendo el último. `distHigh`: % bajo el máximo de 52 semanas (0 = en máximos). `distSma200`: % sobre la media de 200. `atrPct`: volatilidad diaria.
