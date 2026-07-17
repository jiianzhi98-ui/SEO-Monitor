'use client'

import { CompetitorDailyContent } from '@/components/competitor-daily-content'

export default function CompetitorDailyPage() {
  return (
    <div className="p-6">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-gray-900">竞品日收</h1>
        <p className="text-gray-400 text-sm mt-0.5">各站点每日新增关键词数量对比</p>
      </div>
      <CompetitorDailyContent />
    </div>
  )
}
