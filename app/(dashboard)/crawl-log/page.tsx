export default function CrawlLogPage() {
  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">抓取日志</h1>
        <p className="text-gray-500 text-sm mt-1">各模块自动抓取逻辑、数据来源与保留策略</p>
      </div>

      <div className="space-y-4">

        {/* 抓取架构 */}
        <div className="card p-5">
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-base font-semibold text-gray-900">抓取架构</h2>
            <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded font-medium">GitHub Actions → Vercel /api/cron</span>
          </div>
          <div className="space-y-2 text-sm text-gray-600">
            <p>GitHub Actions 按时间触发，逐站点调用 <code className="text-xs bg-gray-100 px-1 rounded">/api/cron?site=域名&step=步骤</code>，每个站点独立一次 Vercel 函数调用。三个步骤相互独立，某步骤失败不影响其他步骤运行。</p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-left px-3 py-2 text-gray-500 font-medium border border-gray-100">步骤</th>
                    <th className="text-left px-3 py-2 text-gray-500 font-medium border border-gray-100">触发时间（Malaysia UTC+8）</th>
                    <th className="text-left px-3 py-2 text-gray-500 font-medium border border-gray-100">站点顺序</th>
                    <th className="text-left px-3 py-2 text-gray-500 font-medium border border-gray-100">站点间隔</th>
                    <th className="text-left px-3 py-2 text-gray-500 font-medium border border-gray-100">预计用时（25站）</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  <tr>
                    <td className="px-3 py-2 border border-gray-100 font-medium text-gray-700">关键词抓取</td>
                    <td className="px-3 py-2 border border-gray-100">00:00（<code>0 16 * * *</code> UTC）</td>
                    <td className="px-3 py-2 border border-gray-100">随机</td>
                    <td className="px-3 py-2 border border-gray-100">3 秒</td>
                    <td className="px-3 py-2 border border-gray-100">~10 分钟</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 border border-gray-100 font-medium text-gray-700">排名变动</td>
                    <td className="px-3 py-2 border border-gray-100">02:00（<code>0 18 * * *</code> UTC）</td>
                    <td className="px-3 py-2 border border-gray-100">随机</td>
                    <td className="px-3 py-2 border border-gray-100">10 秒</td>
                    <td className="px-3 py-2 border border-gray-100">~10 分钟</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 border border-gray-100 font-medium text-gray-700">权重 + 收录</td>
                    <td className="px-3 py-2 border border-gray-100">07:00（<code>0 23 * * *</code> UTC）</td>
                    <td className="px-3 py-2 border border-gray-100">随机</td>
                    <td className="px-3 py-2 border border-gray-100">10 秒</td>
                    <td className="px-3 py-2 border border-gray-100">~10 分钟</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* 关键词抓取 */}
        <div className="card p-5">
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-base font-semibold text-gray-900">关键词抓取</h2>
            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-medium">step=keywords · 每日 00:00</span>
          </div>
          <div className="space-y-4">
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">抓取逻辑</p>
              <div className="space-y-2 text-sm text-gray-600">
                <div className="flex gap-3">
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-medium flex-shrink-0">页面抓取</span>
                  <span>爬取各站点 HTML 列表页，提取标题作为关键词；每日抓取最多 3 页，3 日频率最多 5 页，每周最多 10 页</span>
                </div>
                <div className="flex gap-3">
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-medium flex-shrink-0">翻页延迟</span>
                  <span>每次翻页随机等待 <strong>10～15 秒</strong>，模拟人工操作防止被目标站检测；User-Agent 随机轮换</span>
                </div>
                <div className="flex gap-3">
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-medium flex-shrink-0">去重逻辑</span>
                  <span>新词与数据库近 <strong>7 天</strong>内已有关键词对比去重，重复词不计入新增；批次内也去重（同一次抓取不重复入库）</span>
                </div>
                <div className="flex gap-3">
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-medium flex-shrink-0">写入</span>
                  <span>新词写入 <code className="text-xs bg-gray-100 px-1 rounded">raw_keywords</code>，每日新增数（含 0 条）写入 <code className="text-xs bg-gray-100 px-1 rounded">daily_stats</code>（有配置爬取地址的站点才写）</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 排名变动 */}
        <div className="card p-5">
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-base font-semibold text-gray-900">排名变动</h2>
            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-medium">step=rank · 每日 02:00</span>
          </div>
          <div className="space-y-4">
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">抓取逻辑</p>
              <div className="space-y-2 text-sm text-gray-600">
                <div className="flex gap-3">
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-medium flex-shrink-0">数据来源</span>
                  <span>爱站<strong>移动端</strong> <code className="text-xs bg-gray-100 px-1 rounded">baidurank.aizhan.com/mobile/…</code>（非 PC 端 <code className="text-xs bg-gray-100 px-1 rounded">/baidu/…</code>），抓取当日涨入词与跌出词及搜索量</span>
                </div>
                <div className="flex gap-3">
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-medium flex-shrink-0">并行策略</span>
                  <span>排名段 1-5 <strong>同时并行</strong>抓取，每段内部按页顺序抓取，每页间隔 <strong>300ms</strong>，某段无数据即停止翻页</span>
                </div>
                <div className="flex gap-3">
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-medium flex-shrink-0">UA 轮换</span>
                  <span>每个站点、每次重试均随机选取一个新 User-Agent，避免同一 UA 连续请求被识别限流</span>
                </div>
                <div className="flex gap-3">
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-medium flex-shrink-0">限流保护</span>
                  <span>涨入抓完后等 <strong>500ms</strong> 再抓跌出；当涨入和跌出均为 0 时视为被限流，等待 <strong>30 秒</strong>后重试，最多重试 <strong>2 次</strong>（每次重试换新 UA）</span>
                </div>
                <div className="flex gap-3">
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-medium flex-shrink-0">去重</span>
                  <span>同一关键词可能出现在多个排名段，以<strong>搜索量最高</strong>的记录为准去重后入库</span>
                </div>
                <div className="flex gap-3">
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-medium flex-shrink-0">写入</span>
                  <span>有数据时先删除当日旧记录再写入 <code className="text-xs bg-gray-100 px-1 rounded">rank_changes</code>；涨入词同步更新 <code className="text-xs bg-gray-100 px-1 rounded">keyword_volume</code>（搜索量永久表，已有记录不被 0 覆盖）</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 权重+收录 */}
        <div className="card p-5">
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-base font-semibold text-gray-900">权重 + 收录</h2>
            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-medium">step=weight · 每日 07:00</span>
          </div>
          <div className="space-y-4">
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">抓取逻辑</p>
              <div className="space-y-2 text-sm text-gray-600">
                <div className="flex gap-3">
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-medium flex-shrink-0">数据来源</span>
                  <span>爱站 aizhan.com，抓取 PC/移动权重、收录数、预估来路 IP 区间</span>
                </div>
                <div className="flex gap-3">
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-medium flex-shrink-0">限流保护</span>
                  <span>请求失败时等待 <strong>30 秒</strong>后重试，最多重试 <strong>2 次</strong>（共 3 次尝试）；无论成功与否，每站点后等待 <strong>3 秒</strong>再打下一个</span>
                </div>
                <div className="flex gap-3">
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-medium flex-shrink-0">失败记录</span>
                  <span>3 次重试仍失败时，cron 响应 JSON 记录该站点 <code className="text-xs bg-gray-100 px-1 rounded">count: -1</code> 及错误说明</span>
                </div>
                <div className="flex gap-3">
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-medium flex-shrink-0">写入</span>
                  <span>权重/IP 写入 <code className="text-xs bg-gray-100 px-1 rounded">weight_history</code>，收录数写入 <code className="text-xs bg-gray-100 px-1 rounded">index_snapshots</code>（按日期 upsert，同日重跑不重复）</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 自动删除 */}
        <div className="card p-5">
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-base font-semibold text-gray-900">数据保留策略</h2>
          </div>
          <div className="space-y-3">
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">自动删除（每日随关键词步骤执行）</p>
              <div className="space-y-1.5 text-sm">
                <div className="flex items-center gap-3">
                  <span className="text-xs bg-red-50 text-red-500 px-2 py-0.5 rounded font-medium w-16 text-center flex-shrink-0">30 天</span>
                  <code className="text-xs bg-gray-100 px-1 rounded">raw_keywords</code>
                  <span className="text-gray-500">— discovered_at 早于 30 天</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs bg-red-50 text-red-500 px-2 py-0.5 rounded font-medium w-16 text-center flex-shrink-0">30 天</span>
                  <code className="text-xs bg-gray-100 px-1 rounded">rank_changes</code>
                  <span className="text-gray-500">— stat_date 早于 30 天</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs bg-red-50 text-red-500 px-2 py-0.5 rounded font-medium w-16 text-center flex-shrink-0">30 天</span>
                  <code className="text-xs bg-gray-100 px-1 rounded">daily_stats</code>
                  <span className="text-gray-500">— stat_date 早于 30 天</span>
                </div>
              </div>
            </div>
            <div className="border-t border-gray-100 pt-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">永久保留</p>
              <div className="flex flex-wrap gap-2 text-sm text-gray-500">
                <code className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded">weight_history</code>
                <code className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded">index_snapshots</code>
                <code className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded">keyword_volume</code>
              </div>
            </div>
          </div>
        </div>

        {/* 状态判断规则 */}
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
              <p className="text-sm font-medium text-gray-700 mb-2">新增异常（首页快报）</p>
              <p className="text-xs text-gray-400 mb-2">对比「昨日新增」与「近7日均值」的比例；缺少日期记录视为 0</p>
              <div className="space-y-1.5 text-sm">
                <div className="flex items-center gap-3">
                  <span className="text-xs bg-red-50 text-red-600 px-2 py-0.5 rounded font-medium w-12 text-center flex-shrink-0">异常</span>
                  <span className="text-gray-600">昨日新增 &lt; 7日均值 × 30%</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs bg-yellow-50 text-yellow-600 px-2 py-0.5 rounded font-medium w-12 text-center flex-shrink-0">偏低</span>
                  <span className="text-gray-600">昨日新增在 7日均值 × 30%~60% 之间</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded font-medium w-12 text-center flex-shrink-0">偏高</span>
                  <span className="text-gray-600">昨日新增 &gt; 7日均值 × 150%</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs bg-green-50 text-green-600 px-2 py-0.5 rounded font-medium w-12 text-center flex-shrink-0">正常</span>
                  <span className="text-gray-600">昨日新增在 7日均值 × 60%~150% 之间，或均值为 0</span>
                </div>
              </div>
            </div>

            <div className="border-t border-gray-100 pt-4">
              <p className="text-sm font-medium text-gray-700 mb-2">权重监控排序</p>
              <p className="text-xs text-gray-400 mb-2">三级排序优先级：关注度 → 站点分类 → 平均 IP</p>
              <div className="space-y-1.5 text-sm text-gray-600">
                <div className="flex items-center gap-3">
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-medium flex-shrink-0">第一级</span>
                  <span>关注度：重点关注 → 侧重关注 → 普通关注</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-medium flex-shrink-0">第二级</span>
                  <span>站点分类：大站 → 中站 → 小站</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-medium flex-shrink-0">第三级</span>
                  <span>PC/移动来路 IP 均值（高到低）</span>
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* 热词雷达 */}
        <div className="card p-5">
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-base font-semibold text-gray-900">热词雷达</h2>
            <span className="text-xs bg-purple-50 text-purple-600 px-2 py-0.5 rounded font-medium">/api/hot-radar · 按需查询</span>
          </div>
          <div className="space-y-4">
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">数据来源</p>
              <div className="space-y-2 text-sm text-gray-600">
                <div className="flex gap-3">
                  <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded font-medium flex-shrink-0">共新增词</span>
                  <span>读取近30天 <code className="text-xs bg-gray-100 px-1 rounded">raw_keywords</code>，按关键词聚合，找出被 N 个以上竞品同时新增的词</span>
                </div>
                <div className="flex gap-3">
                  <span className="text-xs bg-orange-50 text-orange-600 px-2 py-0.5 rounded font-medium flex-shrink-0">竞品涨排名</span>
                  <span>读取近30天 <code className="text-xs bg-gray-100 px-1 rounded">rank_changes</code>（type=rankup），找出多个竞品同时涨排名的关键词及最高搜索量</span>
                </div>
                <div className="flex gap-3">
                  <span className="text-xs bg-green-50 text-green-600 px-2 py-0.5 rounded font-medium flex-shrink-0">交叉词</span>
                  <span>同一关键词同时命中共新增词与竞品涨排名，为最强趋势信号；页面默认展示此 Tab</span>
                </div>
              </div>
            </div>
            <div className="border-t border-gray-100 pt-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">聚合规则</p>
              <div className="space-y-1.5 text-sm text-gray-600">
                <div className="flex gap-3">
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-medium flex-shrink-0">阈值</span>
                  <span>API 返回站点数 ≥ 2 的词，页面默认过滤为 ≥ 3 站，可手动调整为 2～5 站</span>
                </div>
                <div className="flex gap-3">
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-medium flex-shrink-0">触发方式</span>
                  <span>进入热词雷达页面时按需查询，无定时任务，不写入额外数据表</span>
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
              <span>读取 <code className="text-xs bg-gray-100 px-1 rounded">rank_changes</code> 指定日期的涨入/跌出词，两个 tab 均默认显示词条数量</span>
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
