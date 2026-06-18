import React from 'react'

export default function CrawlLogPage() {
  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">抓取规则</h1>
        <p className="text-gray-500 text-sm mt-1">各模块自动抓取逻辑与数据来源说明</p>
      </div>

      <div className="space-y-4">

        {/* 收录监控 */}
        <div className="card p-5">
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-base font-semibold text-gray-900">收录监控</h2>
            <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded">每日 05:00~08:00 随机执行</span>
          </div>
          <ul className="space-y-2 text-sm text-gray-600">
            <li className="flex gap-2"><span className="text-gray-300">·</span>抓取爱站网当天百度收录快照</li>
            <li className="flex gap-2"><span className="text-gray-300">·</span>数据类型：当天最新收录数</li>
          </ul>
        </div>

        {/* 竞品日收 */}
        <div className="card p-5">
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-base font-semibold text-gray-900">竞品日收</h2>
          </div>
          <div className="space-y-3">

            <div className="flex gap-3">
              <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-1 rounded flex-shrink-0 self-start">昨日新词</span>
              <span className="text-sm text-gray-600">未配置 HTML 抓取地址则按钮不显示；显示指定日期内该站点新增的关键词</span>
            </div>

            <div className="flex gap-3">
              <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-1 rounded flex-shrink-0 self-start">更新词库</span>
              <span className="text-sm text-gray-600">未配置 HTML 抓取地址则按钮不显示；从近30天数据中按前缀自动归类，显示有2个以上变体的词组</span>
            </div>

            <div className="flex gap-3">
              <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-1 rounded flex-shrink-0 self-start">排名变动</span>
              <span className="text-sm text-gray-600 flex-1">
                每日 05:00~08:00 随机执行；抓取爱站当日涨入 / 跌出词及搜索量
              </span>
            </div>

            <div className="flex gap-3">
              <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-1 rounded flex-shrink-0 self-start">不稳定词</span>
              <span className="text-sm text-gray-600">统计近30天内涨入与跌出均有出现的词条；同一词出现天数不足3天则不显示</span>
            </div>

          </div>
        </div>

        {/* 权重监控 */}
        <div className="card p-5">
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-base font-semibold text-gray-900">权重监控</h2>
            <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded">每日 05:00~08:00 随机执行</span>
          </div>
          <ul className="space-y-2 text-sm text-gray-600">
            <li className="flex gap-2"><span className="text-gray-300">·</span>抓取爱站网当天权重快照</li>
            <li className="flex gap-2"><span className="text-gray-300">·</span>数据类型：PC权重、移动权重、预估IP访问量</li>
          </ul>
        </div>

      </div>
    </div>
  )
}
