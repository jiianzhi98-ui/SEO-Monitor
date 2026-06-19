export default function CrawlLogPage() {
  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">抓取日志</h1>
        <p className="text-gray-500 text-sm mt-1">各模块自动抓取逻辑、数据来源与保留策略</p>
      </div>

      <div className="space-y-4">

        {/* 每日 cron */}
        <div className="card p-5">
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-base font-semibold text-gray-900">主 Cron</h2>
            <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded font-medium">/api/cron · 每日 06:00</span>
          </div>
          <div className="space-y-4">

            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">抓取内容</p>
              <div className="space-y-2 text-sm text-gray-600">
                <div className="flex gap-3">
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-medium flex-shrink-0">竞品关键词</span>
                  <span>爬取各站点 HTML 列表页，提取新标题存入 <code className="text-xs bg-gray-100 px-1 rounded">raw_keywords</code>，每日新增数记录到 <code className="text-xs bg-gray-100 px-1 rounded">daily_stats</code>；每次翻页随机等待 2-5 秒，User-Agent 随机轮换</span>
                </div>
                <div className="flex gap-3">
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-medium flex-shrink-0">排名变动</span>
                  <span>从爱站抓取各站点当日涨入 / 跌出词及搜索量，存入 <code className="text-xs bg-gray-100 px-1 rounded">rank_changes</code>（每日覆盖）</span>
                </div>
                <div className="flex gap-3">
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-medium flex-shrink-0">权重 + 收录</span>
                  <span>从爱站抓取 PC/移动权重、收录数、预估 IP 区间，分别存入 <code className="text-xs bg-gray-100 px-1 rounded">weight_history</code> 和 <code className="text-xs bg-gray-100 px-1 rounded">index_snapshots</code></span>
                </div>
              </div>
            </div>

            <div className="border-t border-gray-100 pt-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">自动删除</p>
              <div className="space-y-1.5 text-sm">
                <div className="flex items-center gap-3">
                  <span className="text-xs bg-red-50 text-red-500 px-2 py-0.5 rounded font-medium w-24 text-center flex-shrink-0">30 天</span>
                  <code className="text-xs bg-gray-100 px-1 rounded">raw_keywords</code>
                  <span className="text-gray-500">— discovered_at 早于 30 天</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs bg-red-50 text-red-500 px-2 py-0.5 rounded font-medium w-24 text-center flex-shrink-0">30 天</span>
                  <code className="text-xs bg-gray-100 px-1 rounded">rank_changes</code>
                  <span className="text-gray-500">— stat_date 早于 30 天</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs bg-red-50 text-red-500 px-2 py-0.5 rounded font-medium w-24 text-center flex-shrink-0">30 天</span>
                  <code className="text-xs bg-gray-100 px-1 rounded">daily_stats</code>
                  <span className="text-gray-500">— stat_date 早于 30 天</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs bg-red-50 text-red-500 px-2 py-0.5 rounded font-medium w-24 text-center flex-shrink-0">90 天</span>
                  <code className="text-xs bg-gray-100 px-1 rounded">hot_keywords</code>
                  <span className="text-gray-500">— created_at 早于 90 天</span>
                </div>
              </div>
            </div>

            <div className="border-t border-gray-100 pt-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">永久保留</p>
              <div className="flex flex-wrap gap-2 text-sm text-gray-500">
                <code className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded">index_snapshots</code>
                <code className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded">weight_history</code>
              </div>
            </div>

          </div>
        </div>

        {/* 百度收录 cron */}
        <div className="card p-5">
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-base font-semibold text-gray-900">百度收录 Cron</h2>
            <span className="text-xs bg-teal-50 text-teal-600 px-2 py-0.5 rounded font-medium">/api/cron/baidu-index · 每日 06:00</span>
          </div>
          <div className="space-y-4">

            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">抓取内容</p>
              <div className="space-y-2 text-sm text-gray-600">
                <div className="flex gap-3">
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-medium flex-shrink-0">月收录</span>
                  <span>抓取百度 <code className="text-xs bg-gray-100 px-1 rounded">site:</code> 近30天全量结果，覆盖当日 month 记录，存入 <code className="text-xs bg-gray-100 px-1 rounded">baidu_index</code></span>
                </div>
                <div className="flex gap-3">
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-medium flex-shrink-0">周收录</span>
                  <span>抓取近7天结果，仅存入月收录中没有的标题（week 独有）</span>
                </div>
                <div className="flex gap-3">
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-medium flex-shrink-0">日收录</span>
                  <span>抓取今日结果，仅存入月/周均没有的标题（day 独有）</span>
                </div>
                <div className="flex gap-3">
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-medium flex-shrink-0">收录变动</span>
                  <span>对比今日与昨日全量标题，新增/消失记录写入 <code className="text-xs bg-gray-100 px-1 rounded">baidu_index_changes</code></span>
                </div>
              </div>
            </div>

            <div className="border-t border-gray-100 pt-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">自动删除</p>
              <div className="space-y-1.5 text-sm">
                <div className="flex items-center gap-3">
                  <span className="text-xs bg-red-50 text-red-500 px-2 py-0.5 rounded font-medium w-24 text-center flex-shrink-0">3 天</span>
                  <code className="text-xs bg-gray-100 px-1 rounded">baidu_index</code>
                  <span className="text-gray-500">— stat_date 早于 3 天（仅作对比用，不需长期保留）</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs bg-red-50 text-red-500 px-2 py-0.5 rounded font-medium w-24 text-center flex-shrink-0">30 天</span>
                  <code className="text-xs bg-gray-100 px-1 rounded">baidu_index_changes</code>
                  <span className="text-gray-500">— change_date 早于 30 天</span>
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* 状态规则 */}
        <div className="card p-5">
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-base font-semibold text-gray-900">状态判断规则</h2>
          </div>
          <div className="space-y-5">

            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">收录监控</p>
              <p className="text-xs text-gray-400 mb-2">对比「最新快照」与「7天前快照」的周变化率</p>
              <div className="space-y-1.5 text-sm">
                <div className="flex items-center gap-3">
                  <span className="text-xs bg-green-50 text-green-600 px-2 py-0.5 rounded font-medium w-12 text-center flex-shrink-0">正常</span>
                  <span className="text-gray-600">周变化率 ≥ −10%，或数据不足 7 天</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs bg-yellow-50 text-yellow-600 px-2 py-0.5 rounded font-medium w-12 text-center flex-shrink-0">警告</span>
                  <span className="text-gray-600">周变化率 −20% ~ −10%</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs bg-red-50 text-red-600 px-2 py-0.5 rounded font-medium w-12 text-center flex-shrink-0">危险</span>
                  <span className="text-gray-600">周变化率 &lt; −20%</span>
                </div>
              </div>
            </div>

            <div className="border-t border-gray-100 pt-4">
              <p className="text-sm font-medium text-gray-700 mb-2">竞品日收</p>
              <p className="text-xs text-gray-400 mb-2">对比「昨日新增」与「近7日均值」的比例</p>
              <div className="space-y-1.5 text-sm">
                <div className="flex items-center gap-3">
                  <span className="text-xs bg-green-50 text-green-600 px-2 py-0.5 rounded font-medium w-12 text-center flex-shrink-0">正常</span>
                  <span className="text-gray-600">昨日新增 ≥ 7日均值 × 60%，或均值为 0</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs bg-yellow-50 text-yellow-600 px-2 py-0.5 rounded font-medium w-12 text-center flex-shrink-0">偏低</span>
                  <span className="text-gray-600">昨日新增在 7日均值 × 30%~60% 之间</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs bg-red-50 text-red-600 px-2 py-0.5 rounded font-medium w-12 text-center flex-shrink-0">异常</span>
                  <span className="text-gray-600">昨日新增 &lt; 7日均值 × 30%</span>
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* 竞品日收手动操作 */}
        <div className="card p-5">
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-base font-semibold text-gray-900">竞品日收（手动按钮）</h2>
          </div>
          <div className="space-y-2 text-sm text-gray-600">
            <div className="flex gap-3">
              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-medium flex-shrink-0">昨日新词</span>
              <span>读取 <code className="text-xs bg-gray-100 px-1 rounded">raw_keywords</code> 指定日期数据；需配置 HTML 抓取地址才可用</span>
            </div>
            <div className="flex gap-3">
              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-medium flex-shrink-0">更新词库</span>
              <span>读取近30天 <code className="text-xs bg-gray-100 px-1 rounded">raw_keywords</code>，按前缀自动归类，显示有2个以上变体的词组</span>
            </div>
            <div className="flex gap-3">
              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-medium flex-shrink-0">排名变动</span>
              <span>读取 <code className="text-xs bg-gray-100 px-1 rounded">rank_changes</code> 指定日期数据</span>
            </div>
            <div className="flex gap-3">
              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-medium flex-shrink-0">不稳定词</span>
              <span>统计 <code className="text-xs bg-gray-100 px-1 rounded">rank_changes</code> 近30天中涨入与跌出均出现、总天数 ≥ 3 的词</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
