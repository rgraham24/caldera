'use client'

import { useEffect, useState } from 'react'
import { useAppStore } from '@/store'

export default function StarterBanner() {
  const [show, setShow] = useState(false)
  const { isConnected, desoBalanceDeso, desoUsername } = useAppStore()

  useEffect(() => {
    if (!isConnected) return
    const welcomed = localStorage.getItem('caldera_welcomed')
    if (welcomed === 'true') return
    setShow(true)
    localStorage.setItem('caldera_welcomed', 'true')
    const t = setTimeout(() => setShow(false), 8000)
    return () => clearTimeout(t)
  }, [isConnected])

  if (!show) return null

  return (
    <div className="fixed top-16 left-0 right-0 z-50 flex justify-center px-4 pointer-events-none">
      <div className="pointer-events-auto max-w-md w-full bg-green-950 border border-green-700 rounded-xl p-4 shadow-lg flex items-start gap-3 animate-slide-down">
        <span className="text-2xl">🎉</span>
        <div className="flex-1">
          <p className="text-green-300 font-semibold text-sm">
            You&apos;re already funded!
          </p>
          <p className="text-green-400 text-xs mt-0.5 leading-relaxed">
            DeSo gave you starter DESO when you signed up.
            You can place your first prediction right now.
          </p>
          {desoBalanceDeso > 0 && (
            <p className="text-green-300 text-xs mt-1 font-mono">
              Balance: {desoBalanceDeso.toFixed(4)} DESO
            </p>
          )}
        </div>
        <button
          onClick={() => setShow(false)}
          className="text-green-600 hover:text-green-400 text-lg leading-none"
        >
          ×
        </button>
      </div>
    </div>
  )
}
