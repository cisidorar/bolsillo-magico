import { CreditCard, Landmark, Smartphone, Banknote } from 'lucide-react'

interface Props {
  cardType: string
  className?: string
}

export function PaymentIcon({ cardType, className = 'w-3 h-3 flex-shrink-0' }: Props) {
  if (cardType === 'credit')  return <CreditCard  className={className} />
  if (cardType === 'digital') return <Smartphone  className={className} />
  if (cardType === 'cash')    return <Banknote    className={className} />
  return                             <Landmark    className={className} />
}
