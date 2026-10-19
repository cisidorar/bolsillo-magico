import type { SplitKind, SplitMode, TripCategory } from './shared-split'

// Filas de las tablas shared_* tal como las devuelve Supabase.

export interface SharedGroup {
  id:          string
  name:        string
  kind:        'event' | 'household'
  start_date:  string | null
  end_date:    string | null
  created_by:  string
  split_mode:  SplitMode
  /** 'no_income_data': el modo sueldo no se puede calcular todavía. */
  split_error: 'no_income_data' | null
  closed_at:   string | null
  created_at:  string
  /** Presupuesto estimado por categoría (CLP) */
  budget:         Partial<Record<TripCategory, number>>
  /** Cuántos se espera que vayan (antes de invitar) */
  planned_people: number | null
}

export interface SharedMemberRow {
  group_id:             string
  user_id:              string
  status:               'pending' | 'accepted' | 'declined'
  income_consent:       boolean
  personal_category_id: string | null
  savings_goal_id?:     string | null
}

/** Resultado de shared_member_names (incluye invitados pendientes). */
export interface SharedMemberInfo {
  user_id:        string
  display_name:   string
  username:       string
  avatar_url:     string | null
  status:         'accepted' | 'pending'
  income_consent: boolean
  is_creator:     boolean
}

export interface SharedExpenseRow {
  id:                string
  group_id:          string
  trip_category:     TripCategory
  description:       string
  date:              string
  amount:            number
  paid_by:           string
  payment_method_id: string | null
  split_kind:        SplitKind
  everyone:          boolean
  created_by:        string
  updated_by:        string | null
  created_at:        string
}

export interface SharedShareRow {
  expense_id: string
  group_id:   string
  user_id:    string
  share:      number
}

export interface SettlementRow {
  id:         string
  group_id:   string
  from_user:  string
  to_user:    string
  amount:     number
  date:       string
  created_at: string
}
