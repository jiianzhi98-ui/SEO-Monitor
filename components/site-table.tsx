'use client'

interface Site {
  id: string
  domain: string
  name: string
  category: 'large' | 'medium' | 'small'
  crawl_type: 'sitemap' | 'html' | 'rss'
  crawl_frequency: 'daily' | 'every3days' | 'weekly'
  enable_version_clean: boolean
  is_enabled: boolean
  created_at: string
}

interface SiteTableProps {
  sites: Site[]
  onEdit: (site: Site) => void
  onDelete: (site: Site) => void
  onToggle: (site: Site) => void
}

const categoryLabel: Record<string, string> = {
  large: '大站',
  medium: '中站',
  small: '小站',
}

const crawlTypeLabel: Record<string, string> = {
  sitemap: 'Sitemap',
  html: 'HTML列表页',
  rss: 'RSS',
}

const frequencyLabel: Record<string, string> = {
  daily: '每天',
  every3days: '每3天',
  weekly: '每周',
}

export default function SiteTable({ sites, onEdit, onDelete, onToggle }: SiteTableProps) {
  if (sites.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400 text-sm">
        暂无网站，点击右上角按钮新增
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead className="bg-gray-50">
          <tr>
            <th className="table-th">域名</th>
            <th className="table-th">名称</th>
            <th className="table-th">分类</th>
            <th className="table-th">抓取类型</th>
            <th className="table-th">频率</th>
            <th className="table-th text-center">版本清洗</th>
            <th className="table-th text-center">状态</th>
            <th className="table-th text-right">操作</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {sites.map((site) => (
            <tr key={site.id} className="hover:bg-gray-50 transition-colors">
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
              <td className="table-td text-gray-600">{site.name}</td>
              <td className="table-td">
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700">
                  {categoryLabel[site.category]}
                </span>
              </td>
              <td className="table-td text-gray-600 text-xs">{crawlTypeLabel[site.crawl_type]}</td>
              <td className="table-td text-gray-600 text-xs">{frequencyLabel[site.crawl_frequency]}</td>
              <td className="table-td text-center">
                {site.enable_version_clean ? (
                  <span className="text-green-600 text-xs font-medium">启用</span>
                ) : (
                  <span className="text-gray-400 text-xs">关闭</span>
                )}
              </td>
              <td className="table-td text-center">
                <button
                  onClick={() => onToggle(site)}
                  className={`relative w-10 h-5 rounded-full transition-colors ${
                    site.is_enabled ? 'bg-green-600' : 'bg-gray-300'
                  }`}
                >
                  <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                    site.is_enabled ? 'translate-x-5' : 'translate-x-0'
                  }`} />
                </button>
              </td>
              <td className="table-td text-right">
                <div className="flex items-center justify-end gap-2">
                  <button
                    onClick={() => onEdit(site)}
                    className="text-xs text-gray-600 hover:text-green-600 px-2 py-1 rounded hover:bg-gray-100 transition-colors"
                  >
                    编辑
                  </button>
                  <button
                    onClick={() => onDelete(site)}
                    className="text-xs text-gray-600 hover:text-red-600 px-2 py-1 rounded hover:bg-gray-100 transition-colors"
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
  )
}
