import {
  Utensils, Coffee, ShoppingCart, ShoppingBag, Car, Bus, Plane, Bike, Fuel,
  Home, Wrench, Lightbulb, Key, Activity, Heart, Pill, Brain, Dumbbell,
  Music, Gamepad2, Film, Ticket, Star, BookOpen, GraduationCap,
  Briefcase, Monitor, Mic, Camera, FileText, Sparkles, Scissors, Sun,
  Baby, Wallet, CreditCard, Landmark, Gift, Globe, Zap, RefreshCw,
  PawPrint, Shirt, Train, Package, AlertCircle, Hammer,
  type LucideIcon,
} from 'lucide-react'

export type IconOption = {
  name: string
  icon: LucideIcon
  label: string
  defaultColor: string
  defaultBg: string
}

export const ICON_OPTIONS: IconOption[] = [
  // Comida
  { name: 'Utensils',    icon: Utensils,     label: 'Comida',       defaultColor: '#0F6E56', defaultBg: '#E1F5EE' },
  { name: 'Coffee',      icon: Coffee,       label: 'Café',         defaultColor: '#854F0B', defaultBg: '#FAEEDA' },
  { name: 'ShoppingCart',icon: ShoppingCart, label: 'Supermercado', defaultColor: '#185FA5', defaultBg: '#E6F1FB' },
  // Transporte
  { name: 'Car',         icon: Car,          label: 'Auto',         defaultColor: '#3C3489', defaultBg: '#EEEDFE' },
  { name: 'Bus',         icon: Bus,          label: 'Bus',          defaultColor: '#185FA5', defaultBg: '#E6F1FB' },
  { name: 'Train',       icon: Train,        label: 'Metro/Tren',   defaultColor: '#A32D2D', defaultBg: '#FCEBEB' },
  { name: 'Plane',       icon: Plane,        label: 'Vuelos',       defaultColor: '#185FA5', defaultBg: '#E6F1FB' },
  { name: 'Bike',        icon: Bike,         label: 'Bicicleta',    defaultColor: '#3B6D11', defaultBg: '#EAF3DE' },
  { name: 'Fuel',        icon: Fuel,         label: 'Bencina',      defaultColor: '#854F0B', defaultBg: '#FAEEDA' },
  // Hogar
  { name: 'Home',        icon: Home,         label: 'Hogar',        defaultColor: '#854F0B', defaultBg: '#FAEEDA' },
  { name: 'Wrench',      icon: Wrench,       label: 'Reparaciones', defaultColor: '#5F5E5A', defaultBg: '#F1EFE8' },
  { name: 'Lightbulb',   icon: Lightbulb,    label: 'Servicios',    defaultColor: '#854F0B', defaultBg: '#FAEEDA' },
  { name: 'Key',         icon: Key,          label: 'Arriendo',     defaultColor: '#5F5E5A', defaultBg: '#F1EFE8' },
  { name: 'Hammer',      icon: Hammer,       label: 'Construcción', defaultColor: '#854F0B', defaultBg: '#FAEEDA' },
  // Salud
  { name: 'Activity',    icon: Activity,     label: 'Salud',        defaultColor: '#A32D2D', defaultBg: '#FCEBEB' },
  { name: 'Heart',       icon: Heart,        label: 'Bienestar',    defaultColor: '#993556', defaultBg: '#FBEAF0' },
  { name: 'Pill',        icon: Pill,         label: 'Farmacia',     defaultColor: '#A32D2D', defaultBg: '#FCEBEB' },
  { name: 'Brain',       icon: Brain,        label: 'Salud mental', defaultColor: '#6366F1', defaultBg: '#EEF2FF' },
  { name: 'Dumbbell',    icon: Dumbbell,     label: 'Deporte',      defaultColor: '#3B6D11', defaultBg: '#EAF3DE' },
  // Entretenimiento
  { name: 'Music',       icon: Music,        label: 'Música',       defaultColor: '#3C3489', defaultBg: '#EEEDFE' },
  { name: 'Gamepad2',    icon: Gamepad2,     label: 'Videojuegos',  defaultColor: '#6366F1', defaultBg: '#EEF2FF' },
  { name: 'Film',        icon: Film,         label: 'Cine/Series',  defaultColor: '#3C3489', defaultBg: '#EEEDFE' },
  { name: 'Ticket',      icon: Ticket,       label: 'Eventos',      defaultColor: '#854F0B', defaultBg: '#FAEEDA' },
  { name: 'Star',        icon: Star,         label: 'Ocio',         defaultColor: '#B45309', defaultBg: '#FEF3C7' },
  // Educación
  { name: 'BookOpen',    icon: BookOpen,     label: 'Libros',       defaultColor: '#185FA5', defaultBg: '#E6F1FB' },
  { name: 'GraduationCap',icon: GraduationCap,label:'Educación',   defaultColor: '#185FA5', defaultBg: '#E6F1FB' },
  // Trabajo
  { name: 'Briefcase',   icon: Briefcase,    label: 'Trabajo',      defaultColor: '#5F5E5A', defaultBg: '#F1EFE8' },
  { name: 'Monitor',     icon: Monitor,      label: 'Tecnología',   defaultColor: '#185FA5', defaultBg: '#E6F1FB' },
  { name: 'Mic',         icon: Mic,          label: 'Podcast/Audio',defaultColor: '#5F5E5A', defaultBg: '#F1EFE8' },
  { name: 'Camera',      icon: Camera,       label: 'Fotografía',   defaultColor: '#5F5E5A', defaultBg: '#F1EFE8' },
  { name: 'FileText',    icon: FileText,     label: 'Documentos',   defaultColor: '#5F5E5A', defaultBg: '#F1EFE8' },
  // Personal
  { name: 'Sparkles',    icon: Sparkles,     label: 'Cuidado pers.',defaultColor: '#993556', defaultBg: '#FBEAF0' },
  { name: 'Scissors',    icon: Scissors,     label: 'Peluquería',   defaultColor: '#993556', defaultBg: '#FBEAF0' },
  { name: 'Sun',         icon: Sun,          label: 'Bienestar',    defaultColor: '#B45309', defaultBg: '#FEF3C7' },
  { name: 'Shirt',       icon: Shirt,        label: 'Ropa',         defaultColor: '#EC4899', defaultBg: '#FCE7F3' },
  { name: 'Baby',        icon: Baby,         label: 'Niños',        defaultColor: '#185FA5', defaultBg: '#E6F1FB' },
  { name: 'PawPrint',    icon: PawPrint,     label: 'Mascotas',     defaultColor: '#854F0B', defaultBg: '#FAEEDA' },
  // Finanzas
  { name: 'Wallet',      icon: Wallet,       label: 'Efectivo',     defaultColor: '#3B6D11', defaultBg: '#EAF3DE' },
  { name: 'CreditCard',  icon: CreditCard,   label: 'Tarjetas',     defaultColor: '#3C3489', defaultBg: '#EEEDFE' },
  { name: 'Landmark',    icon: Landmark,     label: 'Banco',        defaultColor: '#185FA5', defaultBg: '#E6F1FB' },
  // Varios
  { name: 'Gift',        icon: Gift,         label: 'Regalos',      defaultColor: '#BE185D', defaultBg: '#FCE7F3' },
  { name: 'RefreshCw',   icon: RefreshCw,    label: 'Suscripciones',defaultColor: '#0093BC', defaultBg: '#E1F7FD' },
  { name: 'Globe',       icon: Globe,        label: 'Internacional', defaultColor: '#0E7490', defaultBg: '#E0F7FA' },
  { name: 'Zap',         icon: Zap,          label: 'Imprevistos',  defaultColor: '#B45309', defaultBg: '#FEF3C7' },
  { name: 'ShoppingBag', icon: ShoppingBag,  label: 'Compras',      defaultColor: '#F59E0B', defaultBg: '#FEF3C7' },
  { name: 'AlertCircle', icon: AlertCircle,  label: 'Urgencias',    defaultColor: '#A32D2D', defaultBg: '#FCEBEB' },
  { name: 'Package',     icon: Package,      label: 'Otros',        defaultColor: '#5F5E5A', defaultBg: '#F1EFE8' },
]

const ICON_MAP = new Map(ICON_OPTIONS.map(o => [o.name, o]))

export function getCategoryIconOption(name: string): IconOption {
  return ICON_MAP.get(name) ?? ICON_OPTIONS[ICON_OPTIONS.length - 1]
}

export function getCategoryIcon(name: string): LucideIcon {
  return getCategoryIconOption(name).icon
}

export const COLORS = [
  { color: '#0F6E56', bg: '#E1F5EE' },
  { color: '#185FA5', bg: '#E6F1FB' },
  { color: '#854F0B', bg: '#FAEEDA' },
  { color: '#993556', bg: '#FBEAF0' },
  { color: '#3B6D11', bg: '#EAF3DE' },
  { color: '#3C3489', bg: '#EEEDFE' },
  { color: '#A32D2D', bg: '#FCEBEB' },
  { color: '#5F5E5A', bg: '#F1EFE8' },
  { color: '#0E7490', bg: '#E0F7FA' },
  { color: '#6366F1', bg: '#EEF2FF' },
  { color: '#B45309', bg: '#FEF3C7' },
  { color: '#BE185D', bg: '#FCE7F3' },
]
