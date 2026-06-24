'use client'

import React, { useState, useEffect } from 'react'

// ── Helper components ─────────────────────────────────────────────────────────

function RankBadge({ rank }: { rank: number }) {
  const colors =
    rank === 1 ? 'bg-yellow-400 text-yellow-900' :
    rank === 2 ? 'bg-gray-300 text-gray-700' :
    rank === 3 ? 'bg-orange-400 text-white' :
    'bg-gray-100 text-gray-500'
  return (
    <span className={`inline-flex items-center justify-center w-5 h-5 rounded text-xs font-bold flex-shrink-0 ${colors}`}>
      {rank}
    </span>
  )
}

function SectionHeader({ title, color, updatedAt }: { title: string; color: string; updatedAt: string }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className={`w-1 h-5 rounded-full ${color}`} />
      <h2 className="text-base font-bold text-gray-800">{title}</h2>
      <span className="text-xs text-gray-400 ml-auto">{updatedAt} 更新</span>
    </div>
  )
}

function Card({ title, subtitle, icon, children, accent }: {
  title: string; subtitle?: string; icon: string; children: React.ReactNode; accent?: string
}) {
  return (
    <div className={`bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden`}>
      <div className={`px-4 py-3 border-b border-gray-100 ${accent || 'bg-gray-50'}`}>
        <div className="flex items-center gap-2">
          <span className="text-sm">{icon}</span>
          <div>
            <p className="text-sm font-semibold text-gray-900">{title}</p>
            {subtitle && <p className="text-[10px] text-gray-400">{subtitle}</p>}
          </div>
        </div>
      </div>
      <div className="px-4 py-2">
        {children}
      </div>
    </div>
  )
}

function ShowMoreList({ items, initialCount = 10 }: { items: React.ReactNode[]; initialCount?: number }) {
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? items : items.slice(0, initialCount)
  return (
    <>
      <ul>{visible}</ul>
      {items.length > initialCount && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full mt-2 py-1.5 text-[11px] text-gray-400 hover:text-gray-600 transition-colors border border-dashed border-gray-200 rounded-lg"
        >
          {expanded ? '收起' : `查看更多 (${items.length - initialCount} 条)`}
        </button>
      )}
    </>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

interface HotItem { rank: number; name: string; labels: string[] }
interface TodayGame { title: string; tag: string; startDate: string; startTime: string; endDate: string; rating: number | null; labels: string[]; icon: string }

const tagColors2: Record<string, string> = {
  '首发': 'bg-green-100 text-green-700',
  '新游预约': 'bg-blue-100 text-blue-700',
  '限量测试': 'bg-purple-100 text-purple-700',
  '测试招募': 'bg-orange-100 text-orange-700',
  '付费测试': 'bg-orange-100 text-orange-700',
  '公测': 'bg-teal-100 text-teal-700',
  '更新': 'bg-gray-100 text-gray-600',
  '活动': 'bg-pink-100 text-pink-700',
}

function GameItem({ g, showDate }: { g: TodayGame; showDate?: boolean }) {
  const timeStr = showDate && g.startDate ? g.startDate : g.startTime || g.startDate
  const subParts = [timeStr, g.labels.length > 0 ? g.labels[0] : ''].filter(Boolean).join(' · ')
  return (
    <li className="flex items-center gap-2 py-1.5 border-b border-gray-50 last:border-0">
      <p className="flex-1 text-xs text-gray-900 truncate min-w-0">
        {g.title}
        {subParts && <span className="text-gray-400 font-normal"> · {subParts}</span>}
      </p>
      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ${tagColors2[g.tag] || 'bg-gray-100 text-gray-500'}`}>{g.tag}</span>
    </li>
  )
}

export default function ChartsPage() {
  const [hotItems, setHotItems] = useState<HotItem[]>([])
  const [hotLoading, setHotLoading] = useState(true)
  const [todayGames, setTodayGames] = useState<TodayGame[]>([])
  const [upcomingGames, setUpcomingGames] = useState<TodayGame[]>([])
  const [topEvents, setTopEvents] = useState<TodayGame[]>([])
  const [todayLoading, setTodayLoading] = useState(true)
  const [topExpanded, setTopExpanded] = useState(false)
  const [todayExpanded, setTodayExpanded] = useState(false)
  const [upcomingExpanded, setUpcomingExpanded] = useState(false)
  const [hotUpdatedAt, setHotUpdatedAt] = useState('')

  useEffect(() => {
    const now = new Date()
    const ts = `${String(now.getMonth() + 1).padStart(2,'0')}/${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`
    fetch('/api/charts/taptap-hot')
      .then((r) => r.json())
      .then((d) => { setHotItems(d.items ?? []); setHotUpdatedAt(ts) })
      .catch(() => {})
      .finally(() => setHotLoading(false))

    fetch('/api/charts/taptap-today')
      .then((r) => r.json())
      .then((d) => {
        setTodayGames(d.todayGames ?? [])
        setUpcomingGames(d.upcomingGames ?? [])
        setTopEvents(d.topEvents ?? [])
      })
      .catch(() => {})
      .finally(() => setTodayLoading(false))
  }, [])

  const visibleToday = todayExpanded ? todayGames : todayGames.slice(0, 5)
  const visibleUpcoming = upcomingExpanded ? upcomingGames : upcomingGames.slice(0, 6)

  return (
    <div className="p-8 space-y-10">
      <div className="mb-2">
        <h1 className="text-2xl font-bold text-gray-900">近期榜单</h1>
        <p className="text-gray-500 text-sm mt-1">TapTap 实时榜单汇总</p>
      </div>

      {/* ── TapTap ── */}
      <div>
        <SectionHeader title="TapTap" color="bg-teal-500" updatedAt={hotUpdatedAt || '加载中…'} />
        <div className="grid grid-cols-3 gap-5">

          {/* 今日游戏（含近期焦点折叠） */}
          <Card title={`今日游戏${todayGames.length ? ` · ${todayGames.length} 款` : ''}`} subtitle="首发 / 新游预约 / 测试" icon="🎮" accent="bg-teal-50">
            {todayLoading ? (
              <p className="text-xs text-gray-400 py-4 text-center">加载中…</p>
            ) : (
              <>
                {/* 近期焦点 折叠区 */}
                {topEvents.length > 0 && (
                  <div className="mb-3 border border-teal-100 rounded-lg overflow-hidden">
                    <button
                      onClick={() => setTopExpanded(!topExpanded)}
                      className="w-full flex items-center justify-between px-3 py-2 bg-teal-50 hover:bg-teal-100 transition-colors"
                    >
                      <span className="text-[11px] font-semibold text-teal-700">近期焦点 · {topEvents.length} 条</span>
                      <span className="text-[10px] text-teal-500">{topExpanded ? '▲ 收起' : '▼ 展开'}</span>
                    </button>
                    {topExpanded && (
                      <ul className="px-3">
                        {topEvents.map((g, i) => <GameItem key={i} g={g} showDate />)}
                      </ul>
                    )}
                  </div>
                )}
                {/* 今日游戏列表 */}
                {todayGames.length === 0 ? (
                  <p className="text-xs text-gray-400 py-3 text-center">暂无数据</p>
                ) : (
                  <>
                    <ul>{visibleToday.map((g, i) => <GameItem key={i} g={g} />)}</ul>
                    {todayGames.length > 5 && (
                      <button onClick={() => setTodayExpanded(!todayExpanded)} className="w-full mt-2 py-1.5 text-[11px] text-gray-400 hover:text-gray-600 transition-colors border border-dashed border-gray-200 rounded-lg">
                        {todayExpanded ? '收起' : `查看更多 (${todayGames.length - 5} 款)`}
                      </button>
                    )}
                  </>
                )}
              </>
            )}
          </Card>

          {/* 即将上线 */}
          <Card title={`即将上线${upcomingGames.length ? ` · ${upcomingGames.length} 款` : ''}`} subtitle="未来 30 天预约 / 首发" icon="📅" accent="bg-teal-50">
            {todayLoading ? (
              <p className="text-xs text-gray-400 py-4 text-center">加载中…</p>
            ) : upcomingGames.length === 0 ? (
              <p className="text-xs text-gray-400 py-4 text-center">暂无数据</p>
            ) : (
              <>
                <ul>{visibleUpcoming.map((g, i) => <GameItem key={i} g={g} showDate />)}</ul>
                {upcomingGames.length > 6 && (
                  <button onClick={() => setUpcomingExpanded(!upcomingExpanded)} className="w-full mt-2 py-1.5 text-[11px] text-gray-400 hover:text-gray-600 transition-colors border border-dashed border-gray-200 rounded-lg">
                    {upcomingExpanded ? '收起' : `查看更多 (${upcomingGames.length - 6} 款)`}
                  </button>
                )}
              </>
            )}
          </Card>

          {/* 热搜榜 */}
          <Card title="热搜榜 TOP 20" subtitle="每 20 分钟更新" icon="🔥" accent="bg-teal-50">
            {hotLoading ? (
              <p className="text-xs text-gray-400 py-4 text-center">加载中…</p>
            ) : hotItems.length === 0 ? (
              <p className="text-xs text-gray-400 py-4 text-center">暂无数据</p>
            ) : (
              <ShowMoreList initialCount={10} items={hotItems.map((g) => (
                <li key={g.rank} className="flex items-center gap-2 py-1.5 border-b border-gray-50 last:border-0">
                  <RankBadge rank={g.rank} />
                  <p className="flex-1 text-xs font-medium text-gray-800 truncate">{g.name}</p>
                  {g.labels.length > 0 && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                      g.labels[0] === '上升' ? 'bg-orange-100 text-orange-600' :
                      g.labels[0] === '首发' ? 'bg-green-100 text-green-700' :
                      'bg-purple-100 text-purple-700'
                    }`}>{g.labels[0]}</span>
                  )}
                </li>
              ))} />
            )}
          </Card>

        </div>
      </div>

    </div>
  )
}
