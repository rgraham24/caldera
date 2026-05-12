'use client'

/**
 * Once-per-user 'youre funded' nudge that appears the first time a
 * signed-in user lands on the app. Caldera-purple wash instead of
 * the older bright-green tone so it reads as a Caldera component
 * rather than a generic system success toast — and so it doesnt
 * fight the green Buy YES button for semantic ownership.
 *
 * Auto-dismisses after 15 seconds, or immediately on X button.
 * Either path persists dismissal in localStorage so the banner
 * never re-renders for a returning user.
 */

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { useAppStore } from '@/store'

const DISMISSED_KEY = 'caldera_starter_banner_dismissed'
const AUTO_DISMISS_MS = 15_000

export default function StarterBanner() {
  const [show, setShow] = useState(false)
  const { isConnected, desoBalanceDeso } = useAppStore()

  useEffect(() => {
    if (!isConnected) return
    try {
      if (localStorage.getItem(DISMISSED_KEY) === '1') return
    } catch {
      // localStorage blocked (private mode etc) — fall through to show.
    }
    setShow(true)
    const t = setTimeout(() => dismiss(), AUTO_DISMISS_MS)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected])

  function dismiss() {
    try {
      localStorage.setItem(DISMISSED_KEY, '1')
    } catch {
      // localStorage blocked — banner stays hidden for this session only.
    }
    setShow(false)
  }

  if (!show) return null

  return (
    <div className="fixed top-16 left-0 right-0 z-50 flex justify-center px-4 pointer-events-none">
      <div className="pointer-events-auto max-w-md w-full bg-caldera/8 border border-caldera/25 rounded-xl p-4 shadow-lg flex items-start gap-3 animate-slide-down backdrop-blur-md">
        <div className="flex-1 min-w-0">
          <p className="text-text-primary font-semibold text-sm">
            🎉 You&apos;re funded
          </p>
          <p className="text-text-muted text-xs mt-1 leading-relaxed">
            DeSo gave you starter DESO. Place your first prediction.
          </p>
          {desoBalanceDeso > 0 && (
            <p className="text-caldera/80 text-xs mt-1 font-mono">
              Balance: {desoBalanceDeso.toFixed(4)} DESO
            </p>
          )}
        </div>
        <button
          onClick={dismiss}
          aria-label="Dismiss"
          className="shrink-0 rounded p-0.5 text-text-muted hover:text-text-primary transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
