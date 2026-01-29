import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Duang.work - 李Duang的个人网站',
  description: '大巴扎实用小工具 - The Bazaar Helper 工具站',
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
