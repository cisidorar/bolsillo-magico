import { Bed, Car, Utensils, Ticket, ShoppingBag, Package, type LucideIcon } from 'lucide-react'
import type { TripCategory } from './shared-split'

export const TRIP_CATEGORY_ICON: Record<TripCategory, LucideIcon> = {
  alojamiento: Bed,
  transporte:  Car,
  comida:      Utensils,
  actividades: Ticket,
  compras:     ShoppingBag,
  otros:       Package,
}
