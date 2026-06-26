'use client'

import { useState } from 'react'
import { SimplePagination, PAGE_SIZE } from './simple-pagination'

interface Site {
  id: string
  domain: string
  name: string
  category: 'large' | 'medium' | 'small'
  crawl_type: 'html'
  focus_level: number
  list_url: string
  title_selector: string
  date_selector: string
  source_types: string
  crawl_frequency: 'daily' | 'every3days' | 'weekly'
  enable_version_clean: boolean
  version_suffixes: string[]
  is_enabled: boolean
  has_rank_data: boolean
  created_at: string
}

interface SiteTableProps {
  sites: Site[]
  onEdit: (site: Site) => void
  onDelete: (site: Site) => void
  onToggle: (site: Site) => void
  onToggleRank: (site: Site) => void
}

const categoryLabel: Record<string, string> = {
  large: '大站',
  medium: '中站',
  small: '小站',
}

const focusConfig: Record<number, { label: string; className: string }> = {
  1: { label: '重点', className: 'bg-red-50 text-red-600' },
  2: { label: '侧重', className: 'bg-orange-50 text-orange-600' },
  3: { label: '普通', className: 'bg-gray-50 text-gray-400' },
}

const frequencyLabel: Record<string, string> = {
  daily: '每天',
  every3days: '每3天',
  weekly: '每周',
}

export default function SiteTable({ sites, onEdit, onDelete, onToggle, onToggleRank }: SiteTableProps) {
  const [page, setPage] = useState(0)
  const sorted = [...sites].sort((a, b) => a.focus_level - b.focus_level)
  const paged = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  if (sorted.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400 text-sm">
        暂无网站，点击右上角按钮新增
      </div>
    )
  }

  return (
    <>
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead className="bg-gray-50">
          <tr>
            <th className="table-th">域名</th>
            <th className="table-th">名称</th>
            <th className="table-th">分类</th>
            <th className="table-th">关注</th>
            <th className="table-th">频率</th>
            <th className="table-th text-center">版本清洗</th>
            <th className="table-th text-center">关键词</th>
            <th className="table-th text-center">排名</th>
            <th className="table-th text-right">操作</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {paged.map((site) => (
            <tr key={site.id} className="hover:bg-gray-50/50 transition-colors">
              <td className="table-td">
                <a
                  href={`https://${site.domain}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-green-600 hover:underline font-medium"
                >
                  {site.domain}
                </a>
              </td>
              <td className="table-td text-gray-500">{site.name}</td>
              <td className="table-td">
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-600">
                  {categoryLabel[site.category]}
                </span>
              </td>
              <td className="table-td">
                <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${focusConfig[site.focus_level]?.className ?? 'bg-gray-50 text-gray-400'}`}>
                  {focusConfig[site.focus_level]?.label ?? '普通'}
                </span>
              </td>
              <td className="table-td text-gray-500">{frequencyLabel[site.crawl_frequency]}</td>
              <td className="table-td text-center">
                {site.enable_version_clean
                  ? <span className="text-green-600 font-medium">启用</span>
                  : <span className="text-gray-300">—</span>}
              </td>
              <td className="table-td text-center">
                <button
                  onClick={() => onToggle(site)}
                  className={`relative w-9 h-[18px] rounded-full transition-colors ${site.is_enabled ? 'bg-green-600' : 'bg-gray-200'}`}
                >
                  <div className={`absolute top-0.5 left-0.5 w-3.5 h-3.5 bg-white rounded-full shadow transition-transform ${site.is_enabled ? 'translate-x-[18px]' : 'translate-x-0'}`} />
                </button>
              </td>
              <td className="table-td text-center">
                <button
                  onClick={() => onToggleRank(site)}
                  className={`relative w-9 h-[18px] rounded-full transition-colors ${site.has_rank_data ? 'bg-purple-500' : 'bg-gray-200'}`}
                >
                  <div className={`absolute top-0.5 left-0.5 w-3.5 h-3.5 bg-white rounded-full shadow transition-transform ${site.has_rank_data ? 'translate-x-[18px]' : 'translate-x-0'}`} />
                </button>
              </td>
              <td className="table-td text-right">
                <div className="flex items-center justify-end gap-1.5">
                  <button
                    onClick={() => onEdit(site)}
                    className="text-xs text-gray-400 hover:text-gray-700 border border-gray-200 rounded px-1.5 py-0.5 hover:border-gray-300 transition-colors"
                  >
                    编辑
                  </button>
                  <button
                    onClick={() => onDelete(site)}
                    className="text-xs text-red-400 hover:text-red-600 border border-red-100 rounded px-1.5 py-0.5 hover:border-red-200 transition-colors"
                  >
                    删除
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    <SimplePagination page={page} total={sorted.length} onChange={setPage} />
    </>
  )
}
