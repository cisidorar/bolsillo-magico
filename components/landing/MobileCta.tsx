'use client'

import { useEffect, useState } from 'react'
import { ArrowRight } from 'lucide-react'

// Barra fija inferior solo en teléfono: aparece cuando ya pasaste el hero y se
// va cuando llegas a la sección de acceso (ahí está el formulario de verdad).
export default function MobileCta() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    const hero = document.getElementById('hero-actions')
    const form = document.getElementById('lista')
    if (!hero || !form) return
    let heroVisible = true, formVisible = false
    const update = () => setShow(!heroVisible && !formVisible)
    const io = new IntersectionObserver(entries => {
      for (const e of entries) {
        if (e.target === hero) heroVisible = e.isIntersecting
        else formVisible = e.isIntersecting
      }
      update()
    }, { threshold: 0.1 })
    io.observe(hero); io.observe(form)
    return () => io.disconnect()
  }, [])

  return (
    <div
      className="sm:hidden fixed inset-x-0 bottom-0 z-40 px-4 pt-3 lp-cta-bar"
      data-show={show}
      style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))', background: 'color-mix(in srgb, var(--bg) 92%, transparent)', backdropFilter: 'blur(14px)' }}
      aria-hidden={!show}
    >
      <a href="#lista" tabIndex={show ? 0 : -1}
         className="cta-primary w-full min-h-[52px] rounded-2xl text-base font-bold inline-flex items-center justify-center gap-2">
        Pedir acceso <ArrowRight className="w-4 h-4" aria-hidden />
      </a>
    </div>
  )
}
