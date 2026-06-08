'use client'

import { useEffect, useState } from 'react'
import { getBrowserClient } from '@/lib/supabase'

interface HotKeyword {
  id: string
  keyword: string
  site_count: number
  site_list: string[]
  suggestions: string[]
  suggestion_count: number
  priority: 'urgent' | 'today' | 'queue'
  period_start: string
  period_end: string
  created_at: string
}

type Period = 'today' | 'week' | 'month'

const priorityConfig: Record<string, { label: string; className: string }> = {
  urgent: { label: '紧急', className: 'badge-urgent' },
  today: { label: '今日', className: 'badge-today' },
  queue: { label: '待处理', className: 'badge-queue' },
}

export default function HotKeywordsPage() {
  const [keywords, setKeywords] = useState<HotKeyword[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [period, setPeriod] = useState<Period>('today')
  const [copiedId, setCopiedId] = useState<string | null>(null)

  useEffect(() => {
    loadKeywords()
  }, [period])

  async function loadKeywords() {
    setLoading(true)
    setError(null)
    try {
      const supabase = getBrowserClient()
      const today = new Date()
      let startDate: string

      if (period === 'today') {
        startDate = today.toISOString().slice(0, 10)
      } else if (period === 'week') {
        const d = new Date(today)
        d.setDate(d.getDate() - 7)
        startDate = d.toISOString().slice(0, 10)
      } else {
        const d = new Date(today)
        d.setDate(d.getDate() - 30)
        startDate = d.toISOString().slice(0, 10)
      }

      const { data, error: err } = await supabase
        .from('hot_keywords')
        .select('*')
        .gte('period_start', startDate)
        .order('site_count', { ascending: false })
        .order('suggestion_count', { ascending: false })
        .limit(100)

      if (err) throw err
      setKeywords(data || [])
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }

  async function copyKeyword(kw: HotKeyword) {
    await navigator.clipboard.writeText(kw.keyword)
    setCopiedId(kw.id)
    setTimeout(() => setCopiedId(null), 1500)
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">热词雷达</h1>
          <p className="text-gray-500 text-sm mt-1">多站点重复出现的下载关键词汇总</p>
        </div>
        {/* Period Filter */}
        <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg">
          {([
            { value: 'today', label: '今日' },
            { value: 'week', label: '本周' },
            { value: 'month', label: '本月' },
          ] as { value: Period; label: string }[]).map((opt) => (
            <button
              key={opt.value}
              onClick={() => setPeriod(opt.value)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                period === opt.value
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-400 gap-3">
            <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            加载中...
          </div>
        ) : error ? (
          <div className="p-6">
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-600 text-sm">{error}</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="table-th w-12">排名</th>
                  <th className="table-th">关键词</th>
                  <th className="table-th text-center">出现站数</th>
                  <th className="table-th text-center">下拉词数</th>
                  <th className="table-th text-center">优先级</th>
                  <th className="table-th">统计时间</th>
                  <th className="table-th text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {keywords.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="table-td text-center text-gray-400 py-10">
                      暂无热词数据
                    </td>
                  </tr>
                ) : (
                  keywords.map((kw, index) => {
                    const p = priorityConfig[kw.priority]
                    return (
                      <tr key={kw.id} className="hover:bg-gray-50 transition-colors">
                        <td className="table-td text-gray-400 font-medium">{index + 1}</td>
                        <td className="table-td">
                          <div>
                            <span className="font-medium text-gray-900">{kw.keyword}</span>
                            {kw.suggestions && kw.suggestions.length > 0 && (
                              <p className="text-xs text-gray-400 mt-0.5 truncate max-w-xs">
                                {kw.suggestions.slice(0, 3).join(' / ')}
                              </p>
                            )}
                          </div>
                        </td>
                        <td className="table-td text-center">
                          <span className="text-gray-900 font-medium">{kw.site_count}</span>
                        </td>
                        <td className="table-td text-center">{kw.suggestion_count}</td>
                        <td className="table-td text-center">
                          <span className={p.className}>{p.label}</span>
                        </td>
                        <td className="table-td text-xs text-gray-500">
                          {kw.period_start}
                          {kw.period_start !== kw.period_end && ` ~ ${kw.period_end}`}
                        </td>
                        <td className="table-td text-right">
                          <button
                            onClick={() => copyKeyword(kw)}
                            className="text-xs text-gray-500 hover:text-green-600 px-2 py-1 rounded hover:bg-gray-100 transition-colors"
                          >
                            {copiedId === kw.id ? '已复制 ✓' : '复制词'}
                          </button>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
