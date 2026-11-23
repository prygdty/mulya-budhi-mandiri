'use client'

import { SessionProvider } from 'next-auth/react'
import { Suspense } from 'react'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    // Membungkus pelacak sesi dengan Suspense agar lolos Vercel Build
    <Suspense fallback={<div className="min-h-screen bg-slate-900 flex items-center justify-center text-emerald-400 font-bold">Memuat Sistem Keamanan...</div>}>
      <SessionProvider>
        {children}
      </SessionProvider>
    </Suspense>
  )
}