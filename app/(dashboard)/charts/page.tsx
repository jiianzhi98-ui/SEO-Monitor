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

function Change({ v, isNew }: { v: number; isNew?: boolean }) {
  if (isNew) return <span className="text-[10px] bg-blue-500 text-white px-1.5 py-0.5 rounded-full font-bold flex-shrink-0">NEW</span>
  if (v > 0) return <span className="text-[11px] text-green-600 font-bold flex-shrink-0">▲{v}</span>
  if (v < 0) return <span className="text-[11px] text-red-500 font-bold flex-shrink-0">▼{Math.abs(v)}</span>
  return <span className="text-[11px] text-gray-300 flex-shrink-0">—</span>
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

function CardHeader({ title, subtitle, icon }: { title: string; subtitle?: string; icon: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 pb-3 mb-3 border-b border-gray-100">
      <span className="text-base">{icon}</span>
      <div>
        <p className="text-sm font-semibold text-gray-900">{title}</p>
        {subtitle && <p className="text-xs text-gray-400">{subtitle}</p>}
      </div>
    </div>
  )
}

// ── Mock Data ─────────────────────────────────────────────────────────────────

const foxdataGPGames = [
  { rank: 1, change: 0, name: 'Plague Inc.', cat: 'Simulation', isNew: false },
  { rank: 2, change: 0, name: 'Arrows – Puzzle Escape', cat: 'Puzzle', isNew: false },
  { rank: 3, change: 0, name: '离线游戏 - 不用网络的游戏', cat: 'Casual', isNew: false },
  { rank: 4, change: 3, name: 'TheoTown: 城市模拟', cat: 'Simulation', isNew: false },
  { rank: 5, change: 0, name: 'Limbus Company', cat: 'Strategy', isNew: false },
  { rank: 6, change: 5, name: '披萨好了！', cat: 'Simulation', isNew: false },
  { rank: 7, change: 2, name: 'Amaze GO! · 箭头解谜', cat: 'Puzzle', isNew: false },
  { rank: 8, change: 2, name: 'War Thunder Mobile', cat: 'Action', isNew: false },
  { rank: 9, change: -3, name: 'Warframe', cat: 'Action', isNew: false },
  { rank: 10, change: -6, name: 'Standoff 2', cat: 'Action', isNew: false },
  { rank: 11, change: 2, name: 'War Drone: Army Bomber', cat: 'Action', isNew: false },
  { rank: 12, change: -4, name: 'CarX Street', cat: 'Racing', isNew: false },
  { rank: 13, change: 2, name: '愤怒的小鸟 – 新冒险', cat: 'Puzzle', isNew: false },
  { rank: 14, change: 0, name: 'Egg, Inc.', cat: 'Simulation', isNew: false },
  { rank: 15, change: 0, name: 'GTA: San Andreas', cat: 'Action', isNew: true },
]

const foxdataGPApps = [
  { rank: 1, change: 0, name: 'X（前身为Twitter）', cat: '新闻杂志', isNew: false },
  { rank: 2, change: 2, name: 'Instagram', cat: '社交', isNew: false },
  { rank: 3, change: 0, name: 'Open Chat - AI全能助手', cat: '效率', isNew: false },
  { rank: 4, change: -2, name: 'Telegram', cat: '通讯', isNew: false },
  { rank: 5, change: 2, name: 'Google', cat: '工具', isNew: false },
  { rank: 6, change: -1, name: 'Google Chrome 浏览器', cat: '通讯', isNew: false },
  { rank: 7, change: -1, name: 'YouTube', cat: '视频播放', isNew: false },
  { rank: 8, change: 0, name: 'Gmail', cat: '效率', isNew: false },
  { rank: 9, change: 0, name: 'Telegram X', cat: '社交', isNew: false },
  { rank: 10, change: 0, name: 'Steam', cat: '娱乐', isNew: false },
  { rank: 11, change: 4, name: 'WhatsApp Messenger', cat: '通讯', isNew: false },
  { rank: 12, change: 0, name: 'Google 地图', cat: '地图', isNew: false },
  { rank: 13, change: 0, name: 'V2VPN - 高速安全', cat: '工具', isNew: true },
  { rank: 14, change: 0, name: 'Threads', cat: '社交', isNew: false },
  { rank: 15, change: 3, name: 'Proton VPN – 高速安全', cat: '工具', isNew: false },
]

const foxdataGPNew = [
  { rank: 3, name: '离线游戏 - 不用网络的游戏', cat: 'Casual', type: 'game' },
  { rank: 7, name: 'Amaze GO! · 箭头解谜', cat: 'Puzzle', type: 'game' },
  { rank: 13, name: 'V2VPN - 高速安全', cat: '工具', type: 'app' },
  { rank: 15, name: 'GTA: San Andreas', cat: 'Action', type: 'game' },
  { rank: 17, name: '超自然行动组', cat: 'RPG', type: 'game' },
  { rank: 19, name: 'Capcut - 视频编辑器', cat: '视频', type: 'app' },
]

const foxdataASGames = [
  { rank: 1, change: 0, name: 'Plague Inc.', cat: 'Strategy', isNew: false },
  { rank: 2, change: 1, name: 'Alto\'s Odyssey', cat: 'Adventure', isNew: false },
  { rank: 3, change: -1, name: 'Monument Valley 3', cat: 'Puzzle', isNew: false },
  { rank: 4, change: 0, name: '原神', cat: 'RPG', isNew: false },
  { rank: 5, change: 2, name: '王者荣耀', cat: 'MOBA', isNew: false },
  { rank: 6, change: 0, name: '光遇', cat: 'Adventure', isNew: false },
  { rank: 7, change: 3, name: '蛋仔派对', cat: 'Casual', isNew: false },
  { rank: 8, change: -2, name: 'Limbus Company', cat: 'Strategy', isNew: false },
  { rank: 9, change: 0, name: '和平精英', cat: 'Action', isNew: false },
  { rank: 10, change: 0, name: '鸣潮', cat: 'RPG', isNew: true },
]

const foxdataASApps = [
  { rank: 1, change: 0, name: 'YouTube', cat: '视频', isNew: false },
  { rank: 2, change: 0, name: 'TikTok', cat: '娱乐', isNew: false },
  { rank: 3, change: 1, name: 'WeChat 微信', cat: '社交', isNew: false },
  { rank: 4, change: -1, name: 'WhatsApp Messenger', cat: '通讯', isNew: false },
  { rank: 5, change: 2, name: 'Telegram', cat: '通讯', isNew: false },
  { rank: 6, change: 0, name: 'Google Maps', cat: '地图', isNew: false },
  { rank: 7, change: 0, name: 'Instagram', cat: '社交', isNew: false },
  { rank: 8, change: -3, name: 'Spotify 音乐与播客', cat: '音乐', isNew: false },
  { rank: 9, change: 2, name: '小红书', cat: '社交', isNew: true },
  { rank: 10, change: 0, name: 'Gmail - Google 邮件', cat: '效率', isNew: false },
]

const foxdataASNew = [
  { rank: 5, name: 'Telegram', cat: '通讯', type: 'app' },
  { rank: 9, name: '小红书', cat: '社交', type: 'app' },
  { rank: 10, name: '鸣潮', cat: 'RPG', type: 'game' },
  { rank: 14, name: '抖音极速版', cat: '娱乐', type: 'app' },
]

const apparkGP = [
  { rank: 1, change: 0, name: 'X（前身为Twitter）', cat: '新闻杂志', badge: '霸榜8天' },
  { rank: 2, change: 2, name: 'Instagram', cat: '社交', badge: null },
  { rank: 3, change: 0, name: 'Open Chat - AI全能助手', cat: '效率', badge: null },
  { rank: 4, change: -2, name: 'Telegram', cat: '可佩戴设备', badge: null },
  { rank: 5, change: 2, name: 'Google', cat: '工具', badge: null },
  { rank: 6, change: -1, name: 'Google Chrome 浏览器', cat: '通讯', badge: null },
  { rank: 7, change: -1, name: 'YouTube', cat: '视频播放', badge: null },
  { rank: 8, change: 0, name: 'Gmail', cat: '可佩戴设备', badge: null },
  { rank: 9, change: 0, name: 'Telegram X', cat: '社交', badge: null },
  { rank: 10, change: 0, name: 'Steam', cat: '娱乐', badge: null },
]

const apparkAS = [
  { rank: 1, change: 0, name: 'YouTube', cat: '视频', badge: null },
  { rank: 2, change: 0, name: 'TikTok', cat: '娱乐', badge: '霸榜3天' },
  { rank: 3, change: 1, name: 'WeChat 微信', cat: '社交', badge: null },
  { rank: 4, change: -1, name: 'WhatsApp Messenger', cat: '通讯', badge: null },
  { rank: 5, change: 2, name: 'Telegram', cat: '通讯', badge: null },
  { rank: 6, change: 0, name: 'Google Maps', cat: '地图', badge: null },
  { rank: 7, change: 0, name: 'Instagram', cat: '社交', badge: null },
  { rank: 8, change: -3, name: 'Spotify 音乐与播客', cat: '音乐', badge: null },
  { rank: 9, change: 2, name: '小红书', cat: '社交', badge: null },
  { rank: 10, change: 0, name: 'Gmail', cat: '效率', badge: null },
]

const apparkNew = [
  { rank: 5, name: 'Telegram', source: 'GP', cat: '通讯' },
  { rank: 9, name: '小红书', source: 'AS', cat: '社交' },
  { rank: 13, name: 'V2VPN', source: 'GP', cat: '工具' },
  { rank: 17, name: '超自然行动组', source: 'GP', cat: 'RPG' },
  { rank: 14, name: '抖音极速版', source: 'AS', cat: '娱乐' },
  { rank: 22, name: 'CapCut - 视频编辑器', source: 'GP', cat: '视频' },
]

// ── Sub-components ─────────────────────────────────────────────────────────────

function RankListItem({ rank, name, sub, change, isNew, badge }: {
  rank: number; name: string; sub?: string; change?: number; isNew?: boolean; badge?: string | null
}) {
  return (
    <li className="flex items-center gap-2 py-1.5 border-b border-gray-50 last:border-0">
      <RankBadge rank={rank} />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-gray-800 truncate">{name}</p>
        {sub && <p className="text-[10px] text-gray-400 truncate">{sub}</p>}
      </div>
      {badge && (
        <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full flex-shrink-0 font-medium">{badge}</span>
      )}
      {change !== undefined && <Change v={change} isNew={isNew} />}
      {change === undefined && isNew && <Change v={0} isNew={true} />}
    </li>
  )
}

function NewEntryItem({ rank, name, cat, source }: { rank: number; name: string; cat: string; source?: string }) {
  return (
    <li className="flex items-center gap-2 py-1.5 border-b border-gray-50 last:border-0">
      <span className="text-xs font-bold text-gray-400 w-6 text-right flex-shrink-0">#{rank}</span>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-gray-800 truncate">{name}</p>
        <p className="text-[10px] text-gray-400 truncate">{cat}</p>
      </div>
      {source && (
        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold flex-shrink-0 ${
          source === 'GP' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
        }`}>{source}</span>
      )}
      <span className="text-[10px] bg-blue-500 text-white px-1.5 py-0.5 rounded-full font-bold flex-shrink-0">NEW</span>
    </li>
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
        <p className="text-gray-500 text-sm mt-1">TapTap · FoxData · Appark 实时榜单汇总</p>
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

      {/* ── FoxData · Google Play ── */}
      <div>
        <SectionHeader title="FoxData · Google Play (中国区 · 免费榜)" color="bg-green-500" updatedAt="06/21 15:17" />
        <div className="grid grid-cols-3 gap-5">

          <Card title="应用榜 TOP 15" subtitle="免费 · 全分类" icon="📱" accent="bg-green-50">
            <ShowMoreList initialCount={10} items={foxdataGPApps.map((a) => (
              <RankListItem key={a.rank} rank={a.rank} name={a.name} sub={a.cat} change={a.change} isNew={a.isNew} />
            ))} />
          </Card>

          <Card title="游戏榜 TOP 15" subtitle="免费 · 全分类" icon="🕹️" accent="bg-green-50">
            <ShowMoreList initialCount={10} items={foxdataGPGames.map((a) => (
              <RankListItem key={a.rank} rank={a.rank} name={a.name} sub={a.cat} change={a.change} isNew={a.isNew} />
            ))} />
          </Card>

          <Card title="新入榜" subtitle="本期新进入榜单" icon="✨" accent="bg-green-50">
            <ul>
              {foxdataGPNew.map((a, i) => (
                <NewEntryItem key={i} rank={a.rank} name={a.name} cat={a.cat} />
              ))}
            </ul>
          </Card>

        </div>
      </div>

      {/* ── FoxData · App Store ── */}
      <div>
        <SectionHeader title="FoxData · App Store (中国区 · 免费榜)" color="bg-blue-500" updatedAt="06/21 15:17" />
        <div className="grid grid-cols-3 gap-5">

          <Card title="应用榜 TOP 10" subtitle="免费 · 全分类" icon="📱" accent="bg-blue-50">
            <ul>
              {foxdataASApps.map((a) => (
                <RankListItem key={a.rank} rank={a.rank} name={a.name} sub={a.cat} change={a.change} isNew={a.isNew} />
              ))}
            </ul>
          </Card>

          <Card title="游戏榜 TOP 10" subtitle="免费 · 全分类" icon="🕹️" accent="bg-blue-50">
            <ul>
              {foxdataASGames.map((a) => (
                <RankListItem key={a.rank} rank={a.rank} name={a.name} sub={a.cat} change={a.change} isNew={a.isNew} />
              ))}
            </ul>
          </Card>

          <Card title="新入榜" subtitle="本期新进入榜单" icon="✨" accent="bg-blue-50">
            <ul>
              {foxdataASNew.map((a, i) => (
                <NewEntryItem key={i} rank={a.rank} name={a.name} cat={a.cat} />
              ))}
            </ul>
          </Card>

        </div>
      </div>

      {/* ── Appark.ai ── */}
      <div>
        <SectionHeader title="Appark.ai · 中国区免费榜 (Google Play + App Store)" color="bg-orange-500" updatedAt="06/21 15:08" />
        <div className="grid grid-cols-3 gap-5">

          <Card title="Google Play 免费榜" subtitle="中国区 · 全分类" icon="▶️" accent="bg-orange-50">
            <ShowMoreList initialCount={10} items={apparkGP.map((a) => (
              <RankListItem key={a.rank} rank={a.rank} name={a.name} sub={a.cat} change={a.change} badge={a.badge} />
            ))} />
          </Card>

          <Card title="App Store 免费榜" subtitle="中国区 · 全分类" icon="🍎" accent="bg-orange-50">
            <ShowMoreList initialCount={10} items={apparkAS.map((a) => (
              <RankListItem key={a.rank} rank={a.rank} name={a.name} sub={a.cat} change={a.change} badge={a.badge} />
            ))} />
          </Card>

          <Card title="新入榜" subtitle="GP + AS 新进入" icon="✨" accent="bg-orange-50">
            <ul>
              {apparkNew.map((a, i) => (
                <NewEntryItem key={i} rank={a.rank} name={a.name} cat={a.cat} source={a.source} />
              ))}
            </ul>
            <p className="text-[10px] text-gray-400 mt-3 text-center">Appark 共 199 条数据（10页）</p>
            <button className="w-full mt-1.5 py-1.5 text-[11px] text-orange-600 hover:text-orange-800 border border-orange-200 hover:border-orange-400 rounded-lg transition-colors">
              查看完整榜单 →
            </button>
          </Card>

        </div>
      </div>

    </div>
  )
}
