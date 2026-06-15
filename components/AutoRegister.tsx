'use client'

import { useEffect } from 'react'
import { runAutoRegister } from '@/app/actions/auto-register'

export default function AutoRegister() {
  useEffect(() => {
    runAutoRegister()
  }, [])

  return null
}
