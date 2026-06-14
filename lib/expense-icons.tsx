import {
  Car, Bus, Utensils, ShoppingCart, ShoppingBag, Gift, Heart,
  Briefcase, Home, Star, Monitor, Sparkles, RefreshCw, Activity,
  AlertCircle, HelpCircle, Mic, Camera, FileText, Battery, Droplets,
  Baby, Brain, Scissors, Pill, Ticket, Coffee, Package, BookOpen,
  GraduationCap, Dumbbell, Plane, Hotel, Fuel, Wrench, Shirt,
  Music, Gamepad2, Landmark, PawPrint, Sun, Wallet, Hammer,
  type LucideIcon,
} from 'lucide-react'

type IconDef = { icon: LucideIcon; color: string; bg: string }

const desc: Array<{ re: RegExp; icon: LucideIcon; color: string; bg: string }> = [
  // ── Transporte ──────────────────────────────────────────────────────────
  { re: /uber|taxi|cabify/i,                              icon: Car,          color: '#1C1C1E', bg: '#F2F2F7' },
  { re: /metro|subte/i,                                   icon: Activity,     color: '#C0392B', bg: '#FDEDEC' },
  { re: /bus|micro|scooter|transantiago/i,                icon: Bus,          color: '#1D6FA4', bg: '#EAF4FB' },
  { re: /bencina|combustible|gasolina|copec|shell|enex/i, icon: Fuel,        color: '#E67E22', bg: '#FEF5E7' },
  { re: /peaje|autopista/i,                               icon: Car,          color: '#7F8C8D', bg: '#F2F3F4' },
  { re: /vuelo|avión|airline|latam|sky|jet/i,             icon: Plane,        color: '#2980B9', bg: '#EBF5FB' },
  { re: /hotel|hostal|airbnb|alojamiento/i,               icon: Hotel,        color: '#8E44AD', bg: '#F5EEF8' },

  // ── Comidas y bebidas ───────────────────────────────────────────────────
  { re: /café|coffee|starbucks/i,                         icon: Coffee,       color: '#6F4E37', bg: '#F5EDE3' },
  { re: /pizza/i,                                         icon: Utensils,     color: '#C0392B', bg: '#FDEDEC' },
  { re: /sushi|japonés/i,                                 icon: Utensils,     color: '#2E86AB', bg: '#E8F4F8' },
  { re: /taco|mexicano/i,                                 icon: Utensils,     color: '#E67E22', bg: '#FEF5E7' },
  { re: /tiramisu|torta|pastel|postre|helado/i,           icon: Utensils,     color: '#8E44AD', bg: '#F5EEF8' },
  { re: /comida|almuerzo|cena|lunch|desayuno|fideos|invite/i, icon: Utensils, color: '#27AE60', bg: '#EAFAF1' },
  { re: /cerveza|vino|trago|bar|pub|bebida/i,             icon: Utensils,     color: '#E67E22', bg: '#FEF5E7' },

  // ── Supermercado ────────────────────────────────────────────────────────
  { re: /agua|jugo/i,                                     icon: Droplets,     color: '#2980B9', bg: '#EBF5FB' },
  { re: /huevo|jamón|queso|salmón|congelado|abarrote|distribuidora/i, icon: ShoppingCart, color: '#16A085', bg: '#E8F8F5' },

  // ── Educación y libros ──────────────────────────────────────────────────
  { re: /libro|lectura|novela|manual|texto escolar/i,     icon: BookOpen,     color: '#1A5276', bg: '#D6EAF8' },
  { re: /curso|taller|clase|capacitación|workshop/i,      icon: GraduationCap, color: '#1A5276', bg: '#D6EAF8' },
  { re: /colegio|escuela|universidad|matrícula|mensualidad colegio/i, icon: GraduationCap, color: '#2471A3', bg: '#D6EAF8' },
  { re: /cuaderno|útiles|lápiz|mochila|calculadora/i,     icon: BookOpen,     color: '#2471A3', bg: '#D6EAF8' },
  { re: /certificado|título|postítulo|diplomado/i,        icon: GraduationCap, color: '#1A5276', bg: '#D6EAF8' },

  // ── Salud ───────────────────────────────────────────────────────────────
  { re: /farmacia|remedios?|medicina|pastillas?/i,        icon: Pill,         color: '#E74C3C', bg: '#FDEDEC' },
  { re: /psicólog[ao]|psiquiatr[ao]|terapeuta/i,          icon: Brain,        color: '#8E44AD', bg: '#F5EEF8' },
  { re: /proteína|suplemento/i,                           icon: Activity,     color: '#27AE60', bg: '#EAFAF1' },
  { re: /examen|médico|doctor|clínica|hospital/i,         icon: Activity,     color: '#E74C3C', bg: '#FDEDEC' },
  { re: /gym|gimnasio|yoga|pilates|crossfit|deporte/i,    icon: Dumbbell,     color: '#27AE60', bg: '#EAFAF1' },
  { re: /dentista|dental|ortodoncia/i,                    icon: Activity,     color: '#3498DB', bg: '#EBF5FB' },
  { re: /óptica|lentes|oftalmólog/i,                      icon: Activity,     color: '#1ABC9C', bg: '#E8F8F5' },

  // ── Tecnología ──────────────────────────────────────────────────────────
  { re: /micrófono|micro\b/i,                             icon: Mic,          color: '#2C3E50', bg: '#EAECEE' },
  { re: /cámara|camara/i,                                 icon: Camera,       color: '#2C3E50', bg: '#EAECEE' },
  { re: /batería|pila\b/i,                                icon: Battery,      color: '#F39C12', bg: '#FEF9E7' },
  { re: /padmouse|mouse|teclado|ipad|tablet/i,            icon: Monitor,      color: '#2980B9', bg: '#EBF5FB' },
  { re: /carcasa|funda/i,                                 icon: Monitor,      color: '#7F8C8D', bg: '#F2F3F4' },
  { re: /celular|teléfono|smartphone|iphone|samsung/i,    icon: Monitor,      color: '#2C3E50', bg: '#EAECEE' },
  { re: /computador|laptop|notebook|pc\b/i,               icon: Monitor,      color: '#2980B9', bg: '#EBF5FB' },
  { re: /audífonos|auriculares|earbuds|airpods/i,         icon: Music,        color: '#2C3E50', bg: '#EAECEE' },
  { re: /videojuego|consola|playstation|xbox|nintendo/i,  icon: Gamepad2,     color: '#6C3483', bg: '#F5EEF8' },

  // ── Documentos / trámites ───────────────────────────────────────────────
  { re: /contrato|notaría|impresión|documentos?/i,        icon: FileText,     color: '#5D6D7E', bg: '#EBF5FB' },
  { re: /trámite|registro civil|municipalidad|permiso/i,  icon: Landmark,     color: '#5D6D7E', bg: '#EAECEE' },

  // ── Hogar / casa ────────────────────────────────────────────────────────
  { re: /arriendo|renta|alquiler/i,                       icon: Home,         color: '#795548', bg: '#EFEBE9' },
  { re: /luz|electricidad|enel|cge/i,                     icon: Activity,     color: '#F1C40F', bg: '#FEFDE7' },
  { re: /gas\b|gasco|abastible/i,                         icon: Activity,     color: '#E67E22', bg: '#FEF5E7' },
  { re: /internet|wifi|vtr|entel|movistar|claro/i,        icon: Monitor,      color: '#2980B9', bg: '#EBF5FB' },
  { re: /gasfiter|plomero|electricista|reparación|arreglo/i, icon: Wrench,   color: '#7F8C8D', bg: '#F2F3F4' },
  { re: /pintura|mueble|decoración|cortina|sábana/i,      icon: Hammer,       color: '#795548', bg: '#EFEBE9' },
  { re: /limpieza|aseo|detergente|cloro|escoba/i,         icon: Sparkles,     color: '#1ABC9C', bg: '#E8F8F5' },

  // ── Ropa ────────────────────────────────────────────────────────────────
  { re: /ropa|zapatos|zapatillas|polera|jeans|vestido|chaqueta|camisa/i, icon: Shirt, color: '#8E44AD', bg: '#F5EEF8' },
  { re: /zara|h&m|ripley|falabella|paris/i,               icon: ShoppingBag,  color: '#8E44AD', bg: '#F5EEF8' },

  // ── Cuidado personal ────────────────────────────────────────────────────
  { re: /shampoo|jabón|crema|maquillaje|cosmétic/i,       icon: Sparkles,     color: '#AF7AC5', bg: '#F5EEF8' },
  { re: /piercing|tatuaje/i,                              icon: Sparkles,     color: '#E91E8C', bg: '#FCE4F0' },
  { re: /peluquería|barbería|corte de pelo|tinte/i,       icon: Scissors,     color: '#AF7AC5', bg: '#F5EEF8' },
  { re: /spa|masaje|manicure|pedicure/i,                  icon: Sun,          color: '#F39C12', bg: '#FEF9E7' },
  { re: /perfume|desodorante|colonia/i,                   icon: Sparkles,     color: '#8E44AD', bg: '#F5EEF8' },

  // ── Mascotas ────────────────────────────────────────────────────────────
  { re: /veterinari[ao]|vet\b|mascota|perro|gato|pellet|comida mascota/i, icon: PawPrint, color: '#E67E22', bg: '#FEF5E7' },

  // ── Entretenimiento ─────────────────────────────────────────────────────
  { re: /pista de hielo|cine|concierto|show|festival|teatro/i, icon: Ticket, color: '#E67E22', bg: '#FEF5E7' },
  { re: /salida amigas?|junta|reunión/i,                   icon: Star,        color: '#F1C40F', bg: '#FEFDE7' },
  { re: /música|streaming|spotify|deezer/i,                icon: Music,       color: '#1DB954', bg: '#E8F8EF' },

  // ── Hobbies ─────────────────────────────────────────────────────────────
  { re: /lana|crochet|tejido|bordar|costura/i,             icon: Scissors,    color: '#E91E8C', bg: '#FCE4F0' },
  { re: /pintura|dibujo|arte|acuarela|pincel/i,            icon: Sun,         color: '#E67E22', bg: '#FEF5E7' },
  { re: /fotografía|foto/i,                                icon: Camera,      color: '#2C3E50', bg: '#EAECEE' },
  { re: /jardinería|plantas|semillas/i,                    icon: Sun,         color: '#27AE60', bg: '#EAFAF1' },

  // ── Finanzas ────────────────────────────────────────────────────────────
  { re: /seguro|isapre|fonasa|previsión/i,                 icon: Wallet,      color: '#1A5276', bg: '#D6EAF8' },
  { re: /banco|cuenta|transferencia|comisión/i,            icon: Landmark,    color: '#1A5276', bg: '#D6EAF8' },

  // ── Regalos ─────────────────────────────────────────────────────────────
  { re: /regalo|día de las|día del|navidad|cumpleaños/i,   icon: Gift,        color: '#E91E8C', bg: '#FCE4F0' },
]

const cat: Record<string, IconDef> = {
  transporte:        { icon: Car,          color: '#1D6FA4', bg: '#EAF4FB' },
  supermercado:      { icon: ShoppingCart, color: '#16A085', bg: '#E8F8F5' },
  comidas:           { icon: Utensils,     color: '#27AE60', bg: '#EAFAF1' },
  suscripciones:     { icon: RefreshCw,    color: '#8E44AD', bg: '#F5EEF8' },
  salud:             { icon: Activity,     color: '#E74C3C', bg: '#FDEDEC' },
  entretenimiento:   { icon: Star,         color: '#F1C40F', bg: '#FEFDE7' },
  tecnología:        { icon: Monitor,      color: '#2980B9', bg: '#EBF5FB' },
  'cuidado personal':{ icon: Sparkles,     color: '#AF7AC5', bg: '#F5EEF8' },
  trabajo:           { icon: Briefcase,    color: '#5D6D7E', bg: '#EAECEE' },
  pareja:            { icon: Heart,        color: '#E91E8C', bg: '#FCE4F0' },
  regalos:           { icon: Gift,         color: '#E91E8C', bg: '#FCE4F0' },
  casa:              { icon: Home,         color: '#795548', bg: '#EFEBE9' },
  imprevistos:       { icon: AlertCircle,  color: '#E67E22', bg: '#FEF5E7' },
  kida:              { icon: Baby,         color: '#2980B9', bg: '#EBF5FB' },
  'compras para mi': { icon: ShoppingBag,  color: '#8E44AD', bg: '#F5EEF8' },
  educación:         { icon: GraduationCap, color: '#1A5276', bg: '#D6EAF8' },
  libros:            { icon: BookOpen,     color: '#1A5276', bg: '#D6EAF8' },
  deporte:           { icon: Dumbbell,     color: '#27AE60', bg: '#EAFAF1' },
  mascotas:          { icon: PawPrint,     color: '#E67E22', bg: '#FEF5E7' },
  viajes:            { icon: Plane,        color: '#2980B9', bg: '#EBF5FB' },
  ropa:              { icon: Shirt,        color: '#8E44AD', bg: '#F5EEF8' },
  hogar:             { icon: Home,         color: '#795548', bg: '#EFEBE9' },
  finanzas:          { icon: Landmark,     color: '#1A5276', bg: '#D6EAF8' },
  otros:             { icon: HelpCircle,   color: '#95A5A6', bg: '#F2F3F4' },
}

const FALLBACK: IconDef = { icon: Package, color: '#95A5A6', bg: '#F2F3F4' }

export function getExpenseIcon(description: string | null, categoryName: string | null): IconDef {
  if (description) {
    for (const entry of desc) {
      if (entry.re.test(description)) {
        return { icon: entry.icon, color: entry.color, bg: entry.bg }
      }
    }
  }
  const key = (categoryName ?? '').toLowerCase().trim()
  return cat[key] ?? FALLBACK
}
