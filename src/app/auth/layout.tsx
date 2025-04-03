import type { Metadata } from 'next'
import { Inter } from 'next/font/google'

// Font configuration
const inter = Inter({ subsets: ['latin'] })

// Metadata
export const metadata: Metadata = {
  title: 'Network Proxy Authentication',
  description: 'Authentication portal for the Network Proxy system',
}

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className={inter.className}>
      <div className="bg-gray-100 min-h-screen">{children}</div>
    </div>
  )
}
