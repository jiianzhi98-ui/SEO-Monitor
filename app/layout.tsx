import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'SEO Monitor — 监控后台',
  description: 'SEO关键词监控与竞品分析系统',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  )
}
