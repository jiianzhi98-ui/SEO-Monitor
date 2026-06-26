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

function Card({ title, subtitle, icon, list, footer, accent }: {
  title: string; subtitle?: string; icon: string
  list: React.ReactNode; footer?: React.ReactNode; accent?: string
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
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
        {list}
      </div>
      <div className="px-4 pb-3 min-h-[36px]">
        {footer}
      </div>
    </div>
  )
}

function MoreModal({ title, items, onClose }: { title: string; items: React.ReactNode[]; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm flex flex-col" style={{ maxHeight: '80vh' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 flex-shrink-0">
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="overflow-y-auto flex-1 px-4 py-1">
          <ul>{items}</ul>
        </div>
        <div className="px-4 py-2 border-t border-gray-100 flex-shrink-0 text-center">
          <span className="text-xs text-gray-400">共 {items.length} 条</span>
        </div>
      </div>
    </div>
  )
}

function MoreButton({ total, shown, onClick }: { total: number; shown: number; onClick: () => void }) {
  if (total <= shown) return null
  return (
    <button
      onClick={onClick}
      className="w-full mt-2 py-1.5 text-[11px] text-gray-400 hover:text-gray-600 transition-colors border border-dashed border-gray-200 rounded-lg"
    >
      查看全部 {total} 条
    </button>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

interface HotItem { rank: number; name: string; labels: string[] }
interface TodayGame { title: string; tag: string; startDate: string; startTime: string; endDate: string; rating: number | null; labels: string[]; icon: string }
interface HaoyouItem { name: string; tags: string[]; score: string; status: string; url: string; btnText: string; date: string }
interface HaoyouHotItem { rank: number; name: string; tags: string[] }
interface ModalState { title: string; items: React.ReactNode[] }

const haoyouTagColors: Record<string, string> = {
  '限量测试': 'bg-purple-100 text-purple-700',
  '公测': 'bg-teal-100 text-teal-700',
  '测试招募': 'bg-orange-100 text-orange-700',
  '测试': 'bg-orange-100 text-orange-600',
  '预下载': 'bg-blue-100 text-blue-600',
  '首发': 'bg-green-100 text-green-700',
  '上线': 'bg-green-100 text-green-700',
  '预约': 'bg-blue-100 text-blue-600',
  '下载': 'bg-gray-100 text-gray-600',
  '更新': 'bg-gray-100 text-gray-600',
}

function deriveHaoyouTag(status: string, btnText: string): string {
  if (status.includes('限量测试') || status.includes('限测')) return '限量测试'
  if (status.includes('公测') || status.includes('不限量')) return '公测'
  if (status.includes('测试招募')) return '测试招募'
  if (status.includes('测试')) return '测试'
  if (status.includes('预下载')) return '预下载'
  if (status.includes('正式上线') || status.includes('首发')) return '首发'
  if (status.includes('上线')) return '上线'
  if (status.includes('更新')) return '更新'
  return btnText || ''
}

function HaoyouGameItem({ g, hideDownload, index }: { g: HaoyouItem; hideDownload?: boolean; index?: number }) {
  const rawTag = deriveHaoyouTag(g.status, g.btnText)
  const tag = hideDownload ? (rawTag === '下载' || !rawTag ? '更新' : rawTag) : rawTag
  const showTag = !!tag
  return (
    <li className="flex items-center gap-2 py-1.5 border-b border-gray-50 last:border-0">
      <span className="inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-medium text-gray-400 bg-gray-50 flex-shrink-0">{index ?? ''}</span>
      <p className="flex-1 text-xs text-gray-900 truncate min-w-0">
        {g.date && <span className="text-gray-400 font-normal">{g.date} · </span>}
        {g.name}
        {g.status && <span className="text-gray-400 font-normal"> · {g.status}</span>}
      </p>
      {showTag && tag && (
        <span className={`text-xs px-1.5 rounded-full font-medium flex-shrink-0 ${haoyouTagColors[tag] || 'bg-gray-100 text-gray-500'}`}>
          {tag}
        </span>
      )}
    </li>
  )
}

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

function GameItem({ g, showDate, index }: { g: TodayGame; showDate?: boolean; index?: number }) {
  const timeStr = showDate && g.startDate ? g.startDate : g.startTime || g.startDate
  return (
    <li className="flex items-center gap-2 py-1.5 border-b border-gray-50 last:border-0">
      <span className="inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-medium text-gray-400 bg-gray-50 flex-shrink-0">{index ?? ''}</span>
      <p className="flex-1 text-xs text-gray-900 truncate min-w-0">
        {timeStr && <span className="text-gray-400 font-normal">{timeStr} · </span>}
        {g.title}
        {g.labels.length > 0 && <span className="text-gray-400 font-normal"> · {g.labels[0]}</span>}
      </p>
      <span className={`text-xs px-1.5 rounded-full font-medium flex-shrink-0 ${tagColors2[g.tag] || 'bg-gray-100 text-gray-500'}`}>{g.tag}</span>
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
  const [hotUpdatedAt, setHotUpdatedAt] = useState('')

  const [haoyouUpcoming, setHaoyouUpcoming] = useState<HaoyouItem[]>([])
  const [haoyouUpdates, setHaoyouUpdates] = useState<HaoyouItem[]>([])
  const [haoyouHotItems, setHaoyouHotItems] = useState<HaoyouHotItem[]>([])
  const [haoyouLoading, setHaoyouLoading] = useState(true)
  const [haoyouUpdatedAt, setHaoyouUpdatedAt] = useState('')

  const [modal, setModal] = useState<ModalState | null>(null)

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

    fetch('/api/charts/haoyou')
      .then((r) => r.json())
      .then((d) => {
        setHaoyouUpcoming(d.upcoming ?? [])
        setHaoyouUpdates(d.updates ?? [])
        setHaoyouHotItems(d.hotItems ?? [])
        setHaoyouUpdatedAt(ts)
      })
      .catch(() => {})
      .finally(() => setHaoyouLoading(false))
  }, [])

  function openModal(title: string, items: React.ReactNode[]) {
    setModal({ title, items })
  }

  const PREVIEW = 10

  // Pre-build ranked list items for reuse
  const hotItemNodes = hotItems.map((g) => (
    <li key={g.rank} className="flex items-center gap-2 py-1.5 border-b border-gray-50 last:border-0">
      <RankBadge rank={g.rank} />
      <p className="flex-1 text-xs font-medium text-gray-800 truncate">{g.name}</p>
      {g.labels.length > 0 && (
        <span className={`text-xs px-1.5 rounded-full flex-shrink-0 ${
          g.labels[0] === '上升' ? 'bg-orange-100 text-orange-600' :
          g.labels[0] === '首发' ? 'bg-green-100 text-green-700' :
          'bg-purple-100 text-purple-700'
        }`}>{g.labels[0]}</span>
      )}
    </li>
  ))

  const haoyouHotNodes = haoyouHotItems.map((g) => (
    <li key={g.rank} className="flex items-center gap-2 py-1.5 border-b border-gray-50 last:border-0">
      <RankBadge rank={g.rank} />
      <p className="flex-1 text-xs font-medium text-gray-800 truncate">{g.name}</p>
      {g.tags[0] && (
        <span className="text-xs px-1.5 rounded-full bg-gray-100 text-gray-500 flex-shrink-0">{g.tags[0]}</span>
      )}
    </li>
  ))

  return (
    <div className="p-8 space-y-10">
      <div className="mb-2">
        <h1 className="text-2xl font-bold text-gray-900">近期榜单</h1>
        <p className="text-gray-500 text-sm mt-1">TapTap · 好游快爆 榜单汇总</p>
      </div>

      {/* ── TapTap ── */}
      <div>
        <SectionHeader title="TapTap" color="bg-teal-500" updatedAt={hotUpdatedAt || '加载中…'} />
        <div className="grid grid-cols-3 gap-5">

          {/* 今日游戏 */}
          <Card
            title={`今日游戏${todayGames.length ? ` · ${todayGames.length} 款` : ''}`}
            subtitle="首发 / 新游预约 / 测试" icon="🎮" accent="bg-teal-50"
            list={todayLoading ? <p className="text-xs text-gray-400 py-4 text-center">加载中…</p>
              : todayGames.length === 0 ? <p className="text-xs text-gray-400 py-3 text-center">暂无数据</p>
              : (
                <ul>
                  {topEvents.length > 0 && (
                    <li className="flex items-center gap-2 py-1.5 border-b border-gray-50">
                      <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-teal-100 text-teal-600 text-[10px] font-bold flex-shrink-0">★</span>
                      <p className="flex-1 text-xs font-semibold text-teal-700 truncate min-w-0">近期焦点 · {topEvents.length} 条</p>
                      <button
                        onClick={() => openModal('近期焦点', topEvents.map((g, i) => <GameItem key={i} g={g} showDate index={i + 1} />))}
                        className="text-xs text-teal-500 hover:text-teal-700 flex-shrink-0 border border-teal-200 rounded px-1.5 transition-colors"
                      >查看</button>
                    </li>
                  )}
                  {todayGames.slice(0, topEvents.length > 0 ? PREVIEW - 1 : PREVIEW).map((g, i) => (
                    <GameItem key={i} g={g} index={topEvents.length > 0 ? i + 2 : i + 1} />
                  ))}
                </ul>
              )}
            footer={!todayLoading && todayGames.length > (topEvents.length > 0 ? PREVIEW - 1 : PREVIEW)
              ? <MoreButton total={todayGames.length} shown={topEvents.length > 0 ? PREVIEW - 1 : PREVIEW} onClick={() => openModal(`今日游戏 · ${todayGames.length} 款`, todayGames.map((g, i) => <GameItem key={i} g={g} index={i + 1} />))} />
              : undefined}
          />

          {/* 即将上线 */}
          <Card
            title={`即将上线${upcomingGames.length ? ` · ${upcomingGames.length} 款` : ''}`}
            subtitle="未来 30 天预约 / 首发" icon="📅" accent="bg-teal-50"
            list={todayLoading ? <p className="text-xs text-gray-400 py-4 text-center">加载中…</p>
              : upcomingGames.length === 0 ? <p className="text-xs text-gray-400 py-4 text-center">暂无数据</p>
              : <ul>{upcomingGames.slice(0, PREVIEW).map((g, i) => <GameItem key={i} g={g} showDate index={i + 1} />)}</ul>}
            footer={!todayLoading && upcomingGames.length > PREVIEW
              ? <MoreButton total={upcomingGames.length} shown={PREVIEW} onClick={() => openModal(`即将上线 · ${upcomingGames.length} 款`, upcomingGames.map((g, i) => <GameItem key={i} g={g} showDate index={i + 1} />))} />
              : undefined}
          />

          {/* 热搜榜 */}
          <Card
            title="热搜榜 TOP 20" subtitle="每 20 分钟更新" icon="🔥" accent="bg-teal-50"
            list={hotLoading ? <p className="text-xs text-gray-400 py-4 text-center">加载中…</p>
              : hotItems.length === 0 ? <p className="text-xs text-gray-400 py-4 text-center">暂无数据</p>
              : <ul>{hotItemNodes.slice(0, PREVIEW)}</ul>}
            footer={!hotLoading && hotItemNodes.length > PREVIEW
              ? <MoreButton total={hotItemNodes.length} shown={PREVIEW} onClick={() => openModal('TapTap 热搜榜', hotItemNodes)} />
              : undefined}
          />

        </div>
      </div>

      {/* ── 好游快爆 ── */}
      <div>
        <SectionHeader title="好游快爆" color="bg-green-500" updatedAt={haoyouUpdatedAt || '加载中…'} />
        <div className="grid grid-cols-3 gap-5">

          {/* 即将上线 */}
          <Card
            title={`即将上线${haoyouUpcoming.length ? ` · ${haoyouUpcoming.length} 款` : ''}`}
            subtitle="手机游戏 / 免费" icon="🚀" accent="bg-green-50"
            list={haoyouLoading ? <p className="text-xs text-gray-400 py-4 text-center">加载中…</p>
              : haoyouUpcoming.length === 0 ? <p className="text-xs text-gray-400 py-4 text-center">暂无数据</p>
              : <ul>{haoyouUpcoming.slice(0, PREVIEW).map((g, i) => <HaoyouGameItem key={i} g={g} index={i + 1} />)}</ul>}
            footer={!haoyouLoading && haoyouUpcoming.length > PREVIEW
              ? <MoreButton total={haoyouUpcoming.length} shown={PREVIEW} onClick={() => openModal(`好游快爆 即将上线 · ${haoyouUpcoming.length} 款`, haoyouUpcoming.map((g, i) => <HaoyouGameItem key={i} g={g} index={i + 1} />))} />
              : undefined}
          />

          {/* 即将更新 */}
          <Card
            title={`即将更新${haoyouUpdates.length ? ` · ${haoyouUpdates.length} 款` : ''}`}
            subtitle="手机游戏 / 免费" icon="🔄" accent="bg-green-50"
            list={haoyouLoading ? <p className="text-xs text-gray-400 py-4 text-center">加载中…</p>
              : haoyouUpdates.length === 0 ? <p className="text-xs text-gray-400 py-4 text-center">暂无数据</p>
              : <ul>{haoyouUpdates.slice(0, PREVIEW).map((g, i) => <HaoyouGameItem key={i} g={g} hideDownload index={i + 1} />)}</ul>}
            footer={!haoyouLoading && haoyouUpdates.length > PREVIEW
              ? <MoreButton total={haoyouUpdates.length} shown={PREVIEW} onClick={() => openModal(`好游快爆 即将更新 · ${haoyouUpdates.length} 款`, haoyouUpdates.map((g, i) => <HaoyouGameItem key={i} g={g} hideDownload index={i + 1} />))} />
              : undefined}
          />

          {/* 热门榜 */}
          <Card
            title="热门榜 TOP 20" subtitle="实时热门游戏" icon="🔥" accent="bg-green-50"
            list={haoyouLoading ? <p className="text-xs text-gray-400 py-4 text-center">加载中…</p>
              : haoyouHotItems.length === 0 ? <p className="text-xs text-gray-400 py-4 text-center">暂无数据</p>
              : <ul>{haoyouHotNodes.slice(0, PREVIEW)}</ul>}
            footer={!haoyouLoading && haoyouHotNodes.length > PREVIEW
              ? <MoreButton total={haoyouHotNodes.length} shown={PREVIEW} onClick={() => openModal('好游快爆 热门榜', haoyouHotNodes)} />
              : undefined}
          />

        </div>
      </div>

      {modal && <MoreModal title={modal.title} items={modal.items} onClose={() => setModal(null)} />}
    </div>
  )
}
