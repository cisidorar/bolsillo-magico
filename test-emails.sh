#!/bin/bash
# Prueba de todos los correos — datos de muestra, no depende de DB

EMAIL="cisidorar@gmail.com"
BASE="https://nnrmfzpyirsshmmwpogw.supabase.co/functions/v1"

call() {
  local name="$1"
  local fn="$2"
  local data="$3"
  echo ""
  echo "▶ $name"
  result=$(curl -s -X POST "$BASE/$fn" -H "Content-Type: application/json" -d "$data")
  echo "  $result"
}

call "Cierre de tarjeta"       "notify-billing"            "{\"force\":true,\"email\":\"$EMAIL\"}"
call "Alerta de presupuesto"   "notify-budget"             "{\"force\":true,\"email\":\"$EMAIL\"}"
call "Resumen mensual"         "notify-monthly-summary"    "{\"force\":true,\"email\":\"$EMAIL\"}"
call "Recurrente — vence hoy"  "notify-recurring-reminder" "{\"type\":\"due\",\"force\":true,\"email\":\"$EMAIL\"}"
call "Recurrente — atrasado"   "notify-recurring-reminder" "{\"type\":\"overdue\",\"force\":true,\"email\":\"$EMAIL\"}"

echo ""
echo "✓ Revisa cisidorar@gmail.com"
