import type { SplitKind, SplitMode, TripCategory } from './shared-split'

// Filas de las tablas shared_* tal como las devuelve Supabase.

export interface SharedGroup {
  id:              string
  name:            string
  kind:            'event' | 'household'
  start_date:      string | null
  end_date:        string | null
  member_a:        string
  member_b:        string | null
  split_mode:      SplitMode | null
  ratio_a:         number | null
  ratio_agreed_at: string | null
  pending_mode:    SplitMode | null
  pending_ratio_a: number | null
  pending_by:      string | null
  closed_at:       string | null
  created_at:      string
}

export interface SharedMemberRow {
  group_id:             string
  user_id:              string | null
  status:               'pending' | 'accepted' | 'declined'
  income_consent:       boolean
  personal_category_id: string | null
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
  share_a:           number
  share_b:           number
  created_by:        string
  updated_by:        string | null
  created_at:        string
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
