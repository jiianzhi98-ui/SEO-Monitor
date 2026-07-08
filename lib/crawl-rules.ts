// Crawl rules reference — single source of truth for how each step works.
// IMPORTANT: Update this file whenever you change:
//   - Step timing or trigger source (GitHub Actions / Vercel)
//   - Which Supabase tables are written to
//   - Inter-site delays, retry counts, or rate-limit behaviour
//   - Dedup logic or data-retention periods
//   - A new crawl step is added or an existing one is removed
// The crawl-log page imports this to render the [规则] modal.

export interface RuleSection {
  key: string
  title: string
  badge: string
  items: { label: string; text: string }[]
}

export const CRAWL_RULES: RuleSection[] = [
  {
    key: 'keywords',
    title: '关键词抓取',
    badge: 'step=keywords · GitHub Actions · 目标 00:00 MYT（cron 23:00 MYT + 排队约 1h）',
    items: [
      { label: '触发方式', text: 'GitHub Actions daily-crawl.yml (cron 0 15 * * * UTC = 23:00 MYT 前一天)，动态 matrix job 并行（每2个站点1个job，由 setup job 查询当前站点总数自动计算），每组抓约2个站点；实际执行脚本：scripts/crawl.ts（非 /api/cron，两条路径）；GitHub runner 排队约1小时，实际执行约 00:00 MYT。失败/空站由 retry-crawl.yml (cron 45 21 UTC = 05:45 MYT) 自动补抓' },
      { label: '抓取对象', text: '仅 is_enabled=true 且 list_url 已填写的站点；is_enabled 由用户在网站管理"关键词数据"开关控制，关闭后跳过关键词抓取但权重/排名照常运行' },
      { label: '频率规则', text: '所有站点均为 daily（每天）' },
      { label: '翻页策略', text: '最多3页；正式 GitHub Actions 抓取每页间隔随机等待10~15秒；单站手动重试跳过等待直接顺序翻页' },
      { label: '去重', text: '与数据库同日期已有词对比去重，批次内也去重；新词写入 raw_keywords' },
      { label: '写入表', text: 'raw_keywords（新词）/ competitor_kw_stats（app/game分类计数）' },
      { label: '清理', text: '每日关键词步骤结束后由 group0 执行：raw_keywords 30天，rank_changes 30天，competitor_kw_stats 10天' },
      { label: '静默失败风险', text: 'HTML fetch 返回空时不报错，只在 activity_log 标记 empty；选择器配置错误会导致持续为空' },
    ],
  },
  {
    key: 'weight',
    title: '权重+收录',
    badge: 'step=weight · GitHub Actions · 目标 01:00 MYT（cron 00:00 MYT + 排队约 1h）',
    items: [
      { label: '触发方式', text: 'GitHub Actions daily-crawl.yml (cron 0 16 * * * UTC = 00:00 MYT 当天)，动态 matrix job 并行（每2个站点1个job）；实际执行脚本：scripts/crawl.ts；实际执行约 01:00 MYT。失败站由 retry-crawl.yml (cron 0 22 UTC = 06:00 MYT) 自动补抓' },
      { label: '数据来源', text: '爱站 aizhan.com，抓取 PC/移动权重、收录数、来路IP区间' },
      { label: '限流保护', text: '失败后等30秒重试，最多3次（共3次尝试，每次换新UA）；站点间隔3秒' },
      { label: '写入表', text: 'weight_history（pc/mobile权重+IP区间，按 site_id+record_date upsert）/ index_snapshots（收录数，按 site_id+snapshot_date upsert）' },
      { label: '手动重抓', text: '页面"重抓"按钮 → /api/trigger-crawl → /api/cron?step=weight&site=xxx，IP来自 Vercel，记录为 cron_manual' },
    ],
  },
  {
    key: 'rank',
    title: '排名变动',
    badge: 'step=rank · GitHub Actions · 目标 02:00 MYT（cron 01:00 MYT + 排队约 1h）',
    items: [
      { label: '触发方式', text: 'GitHub Actions daily-crawl.yml (cron 0 17 * * * UTC = 01:00 MYT 当天)，动态 matrix job 并行（每2个站点1个job）；实际执行脚本：scripts/crawl.ts；实际执行约 02:00 MYT。失败/空站由 retry-crawl.yml (cron 15 22 UTC = 06:15 MYT) 自动补抓' },
      { label: '抓取对象', text: '仅 is_enabled=true 且 has_rank_data=true 的站点；has_rank_data 由用户在网站管理手动开关，cron 不会自动修改该字段' },
      { label: '数据来源', text: '爱站移动端 baidurank.aizhan.com/mobile/…，抓涨入词与跌出词及搜索量' },
      { label: '并行策略', text: '排名段1-5同时并行，段内按页顺序，每页间隔300ms' },
      { label: '限流保护', text: '涨入完成后等2秒抓跌出；涨跌均为0时等5秒重试1次；连续3站为空触发熔断，暂停5分钟后补抓这3站；站点间45秒间隔' },
      { label: '去重', text: '同关键词出现在多个排名段时保留搜索量最高的记录' },
      { label: '写入表', text: 'rank_changes（有数据时先删当日旧记录再插入）/ keyword_volume（涨入词搜索量，永久表，已有记录不被0覆盖）' },
      { label: '静默失败风险', text: '爱站IP限流后返回空，两次重试都空则不写数据，activity_log 标记 empty；无法区分"真的无涨跌"与"被限流"' },
    ],
  },
  {
    key: 'cron_manual',
    title: '手动重抓',
    badge: '触发方式：页面按钮 → Vercel /api/trigger-crawl',
    items: [
      { label: 'IP来源', text: 'Vercel serverless（与 GitHub Actions IP 不同），仅用于单站补抓，不适合替代 GitHub Actions 跑全量' },
      { label: '触发路径', text: '页面按钮 → POST /api/trigger-crawl { site, step }（需 admin/super 权限）→ GET /api/cron?site=xxx&step=yyy → 单站抓取（走 /api/cron，与 GitHub Actions 的 scripts/crawl.ts 是两条不同执行路径）；trigger-crawl 超时限制 50s，为避免超时：keywords 步骤去掉翻页间隔延迟（正常 10-15s，单站模式跳过），weight 步骤重试间隔缩短为 5s（正常为 30s）' },
      { label: '写入', text: '与定时任务相同的写入逻辑；weight 步骤写入 weight_history + index_snapshots；keywords 步骤写入 raw_keywords + competitor_kw_stats' },
      { label: '日志', text: '记录为 cron_manual，来源 Vercel，detail 显示写入行数' },
    ],
  },
  {
    key: 'index-pages',
    title: '收录页面追踪',
    badge: 'step=index-pages · GitHub Actions · 03:00 MYT（cron 19:00 UTC）',
    items: [
      { label: '触发方式', text: 'GitHub Actions daily-crawl.yml (cron 0 19 * * * UTC = 03:00 MYT)，动态 matrix job 并行（每站一个job，SPG=1）；retry-crawl.yml (cron 0 22 UTC = 06:00 MYT) 自动补抓；支持页面手动重抓 → /api/trigger-crawl → /api/cron?step=index-pages' },
      { label: '抓取对象', text: '仅 has_index_pages=true 的站点（在收录页面追踪页面逐站开关，默认 false）' },
      { label: '抓取方式', text: '百度 site:domain 搜索，带近31天 gpc 时间过滤（gpc=stf={now-31d},{now}|stftype=1 + tfflag=1），过滤依据是百度内部重新收录时间而非页面发布日期；带 ct=2097152/si=domain/fenlei=256 开启百度站内搜索模式以获取更完整结果；pn=0/10/20... 翻页，无页数上限；停止条件：空页、被拦截、或整页URL相同立即停；页间延迟 1.5-3 秒（有 Cookie），4-7 秒（无 Cookie）；站间延迟 10 秒' },
      { label: '去重', text: '按 (site_id, url) 唯一索引 upsert；新页面写入 first_seen_date=today（DB trigger 保护，UPDATE 时不覆盖）；已知页面更新 last_seen_date=today；抓完后仅将 last_seen_date 在近30天内但本次未出现的页面标记 disappeared_date=today（30天可观测窗口：超出范围的历史页面不作脱收判定，因月度抓取不能代表其是否还被收录）；重新出现则清 disappeared_date 为 null' },
      { label: '写入表', text: 'site_indexed_pages（url, title, snippet, baidu_date_str, first_seen_date, last_seen_date, disappeared_date）；500条/批写入' },
      { label: '风险', text: '百度对 GitHub Actions IP 有反爬限制，若返回 "百度安全验证" 页则自动停止该站抓取；empty 状态表示疑似被拦截' },
    ],
  },
  {
    key: 'rank-title',
    title: '排名抓取（全站点）',
    badge: 'step=rank-title · daily-crawl.yml · GitHub Actions · 02:00 MYT（cron 18:00 UTC）；retry 05:30 MYT',
    items: [
      { label: '触发方式', text: 'GitHub Actions daily-crawl.yml (cron 0 18 * * * UTC = 02:00 MYT)，动态 matrix job 并行（每2个站点1个job）；retry-crawl.yml (cron 30 21 UTC = 05:30 MYT) 全组重跑（无失败记录机制）；脚本：scripts/crawl-rank.ts；支持手动 workflow_dispatch 选 step=rank-title' },
      { label: '抓取对象', text: 'sites 表中 has_rank_title=true 的站点；动态读取，每次运行重新查询' },
      { label: '数据来源', text: '爱站 baidurank.aizhan.com，移动端（/mobile/）+ PC端（/baidu/），各抓涨入和跌出，共 4 个组合；含标题（title）和排名页 URL（url）' },
      { label: '并行策略', text: '排名段 1-5 同时并行，段内按页顺序，每页间隔 300ms；4 个组合顺序执行，组合间隔 2 秒；站点间间隔 60 秒' },
      { label: '翻页上限', text: '每段最多 15 页；抓取全部词（不过滤 volume=0）' },
      { label: '排名字段', text: '新排名（rank_position）= "第11名" → 11；原排名（prev_rank）= "50名外" → NULL；含页面标题（title）和排名页 URL' },
      { label: '写入表', text: 'site_keyword_ranks（永久保留，含 prev_rank + title + url，按 site_id+keyword+stat_date+platform+type 唯一，每次运行先删当日全部记录再写入）/ keyword_volume（仅移动端 rankup 且 volume>0 的词，upsert）' },
      { label: '数据保留', text: 'site_keyword_ranks 永久保留，不自动删除' },
      { label: '限流风险', text: '爱站返回空时标记为"无数据（疑似限流或无词）"，不写入；站点间 60s 间隔降低限流概率' },
    ],
  },
  {
    key: 'search',
    title: '站点情报查询',
    badge: '类型：search · 触发方式：页面搜索',
    items: [
      { label: '数据来源', text: '已追踪站点：Supabase 历史数据（weight_history / index_snapshots / rank_changes / raw_keywords）；未追踪站点：爱站实时接口' },
      { label: '不写入', text: '搜索操作不修改任何数据库表' },
      { label: '日志', text: '记录为 search，domain=查询域名，summary 显示是否已追踪及数据最新日期' },
    ],
  },
]

// Data retention periods (for reference in the rules modal)
export const RETENTION = {
  raw_keywords: '30天（按 discovered_at）',
  rank_changes: '30天（按 stat_date）',
  competitor_kw_stats: '10天（按 stat_date）',
  weight_history: '永久保留',
  index_snapshots: '永久保留',
  keyword_volume: '永久保留',
  site_keyword_ranks: '永久保留',
  activity_log: '7天（按 logged_at）',
  activity_site_log: '7天（随 activity_log 级联删除）',
}
