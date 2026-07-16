import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase-server'

export async function POST(req: Request) {
  const authClient = createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const prompt: string = (body.prompt ?? '').trim()
  if (!prompt) return NextResponse.json({ error: 'No prompt' }, { status: 400 })

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = createServiceClient() as any

  // Fetch context data in parallel
  const [{ data: rules }, { data: sites }, { data: kwStats }] = await Promise.all([
    service.from('rules').select('name, type, description, status').limit(50),
    service.from('sites').select('domain, name, category, is_enabled').limit(30),
    service.from('member_claimed_keywords').select('status, effectiveness').limit(500),
  ])

  let contextStr = ''

  if (sites?.length) {
    contextStr += `\n## 已监控站点（${sites.length} 个）\n`
    for (const s of (sites as { domain: string; name: string | null; category: string | null; is_enabled: boolean }[]).slice(0, 20)) {
      contextStr += `- ${s.domain}${s.name ? ` (${s.name})` : ''} [${s.category ?? '未分类'}${s.is_enabled ? '' : ', 已停用'}]\n`
    }
  } else {
    contextStr += `\n## 已监控站点\n暂无数据（需要在站点管理页添加站点）。\n`
  }

  if (rules?.length) {
    contextStr += `\n## 现有规则（${rules.length} 条，避免重复）\n`
    for (const r of (rules as { name: string; type: string; description: string | null; status: string }[]).slice(0, 30)) {
      contextStr += `- [${r.type}][${r.status}] ${r.name}${r.description ? `：${r.description.slice(0, 80)}` : ''}\n`
    }
  } else {
    contextStr += `\n## 现有规则\n暂无规则，这将是第一条规则。\n`
  }

  if (kwStats?.length) {
    const submitted = kwStats.filter((k: { status: string }) => k.status === 'submitted').length
    const pending = kwStats.filter((k: { status: string }) => k.status === 'pending').length
    const ranked = kwStats.filter((k: { effectiveness: string }) => k.effectiveness === '获取排名').length
    const indexed = kwStats.filter((k: { effectiveness: string }) => k.effectiveness === '获取收录').length
    contextStr += `\n## 关键词追踪状态\n- 已提交追踪: ${submitted} 条\n- 待认领: ${pending} 条\n- 已获取排名: ${ranked} 条\n- 已获取收录（未排名）: ${indexed} 条\n`
  } else {
    contextStr += `\n## 关键词追踪状态\n暂无数据（需要在分组任务页认领关键词后运行成效追踪 cron）。\n`
  }

  const systemPrompt = `你是 SEO Monitor 平台的策略顾问 AI，帮助用户根据现有数据建立 SEO 操作规则。

## 平台背景
目标搜索引擎：**百度**（全球华人使用最广泛的搜索引擎，用户主要来自中国）。
数据来源：**爱站（aizhan.com）**，每日通过 GitHub Actions cron 自动抓取。

## 平台功能模块
- **热词雷达**：监控竞品在百度的关键词涨排名/跌排名/新增词库变化
- **分组任务**：团队成员认领关键词，追踪从提交到排名的全过程
- **成效追踪**：每日记录自有站点的百度收录状态和排名变化
- **规则中心**：记录经过验证的百度 SEO 操作规则

## 数据库表结构（所有可用数据）

### 核心站点数据
**sites**（站点信息）
- domain, name, category（large/medium/small 站规模分类）
- is_enabled（是否启用关键词抓取）
- has_rank_data（是否开启排名变动追踪）
- has_rank_title（是否开启全站排名抓取）
- has_index_pages（是否开启收录页面追踪）

**weight_history**（百度权重历史，永久保留）
- site_id, record_date, pc_weight, mobile_weight, ip_range
- 数据来源：爱站，每日 01:00 MYT 抓取

**index_snapshots**（百度收录数量快照，永久保留）
- site_id, snapshot_date, indexed_count
- 数据来源：爱站，每日 01:00 MYT 抓取

### 关键词数据
**raw_keywords**（竞品关键词库，30天保留）
- site_id, keyword, content_date, source_url（竞品文章链接）
- 数据来源：每日 00:00 MYT 爬取竞品站点页面

**rank_changes**（百度排名变动，30天保留）
- site_id, keyword, stat_date, type（rankup 涨 / rankdown 跌）
- volume（搜索量）
- 数据来源：爱站移动端排名，每日 02:00 MYT

**keyword_volume**（关键词搜索量，永久保留）
- keyword, volume（百度移动端搜索量）
- 所有出现过的关键词搜索量存档

**site_keyword_ranks**（全站排名详情，永久保留）
- site_id, keyword, stat_date, platform（mobile/pc）, type（rankup/rankdown）
- rank_position（当前排名位置，数字越小越好）
- prev_rank（上次排名，NULL 表示新进入排名）
- title（页面标题）, url（排名页面 URL）
- volume（搜索量）
- 数据来源：爱站，每日 02:00 MYT（含 PC 和移动端）

### 收录页面数据
**site_indexed_pages**（百度收录页面，永久保留）
- site_id, url, title, snippet
- first_seen_date（首次发现收录日期）
- last_seen_date（最后一次确认收录日期）
- disappeared_date（脱收确认日期，NULL 表示仍在收录）
- missed_count（连续未见次数）, verify_needed（是否需要验证脱收）
- 数据来源：百度 site:domain 搜索，每日 03:00 MYT

### 成效追踪数据
**member_claimed_keywords**（团队认领关键词）
- group_id, user_id, keyword, final_keyword
- page_url（对应的自有站页面 URL）
- status（pending/submitted）, claimed_date, submit_date
- operation_type（add 新增 / update 更新）
- search_volume（搜索量）

**site_tracking_records**（自有站成效追踪，每日快照，永久保留）
- claim_id, record_date, group_id, user_id
- keyword, final_keyword, page_url, operation_type
- is_indexed（页面是否被百度收录）
- index_first_seen（首次收录日期）, index_disappeared（脱收日期）
- rank_keyword（实际排名关键词）, rank_position（百度排名位置）
- prev_rank_position（上次排名，用于计算变化）
- rank_volume（排名关键词搜索量）, rank_date（排名数据日期）
- effectiveness（获取排名 / 获取收录 / 追踪中 / 无效）
- 判断逻辑：rank_position 不为空 → 获取排名；is_indexed=true 且无排名 → 获取收录；提交<90天且未收录 → 追踪中；超90天未有结果 → 无效

**competitor_tracking_records**（竞品成效追踪，永久保留）
- site_id, keyword, discovery_date
- rank_type（rankup/rankdown/new_indexed）
- rank_position, prev_rank（与 site_keyword_ranks 对应）
- effectiveness（有效 / 追踪中 / 无效）
- rule_id（命中的规则编号，如 900=跌后更新观察，901=批量下拉词更新）

### 当前系统数据摘要
${contextStr}

## Cron 任务时间表
- 00:00 MYT：关键词抓取（raw_keywords）
- 01:00 MYT：权重+收录数（weight_history, index_snapshots）
- 02:00 MYT：排名变动（rank_changes, site_keyword_ranks, keyword_volume）
- 03:00 MYT：收录页面追踪（site_indexed_pages）
- 06:15 MYT：成效追踪（site_tracking_records, competitor_tracking_records）

## 规则 JSON 结构
\`\`\`
{
  "name": "规则名称（简洁，20字以内）",
  "type": "add（新增内容） | update（更新内容） | mixed（新增+更新）",
  "status": "active（立即启用） | testing（先测试）",
  "stage_applicability": ["起站期", "成长期", "成熟期", "通用"] 中的一个或多个,
  "description": "触发条件（哪些数据信号） → 执行动作（做什么 SEO 操作） → 预期效果（怎么衡量成功，用具体字段如 rank_position、is_indexed 来描述）（50-150字）",
  "confidence": 0-100（对这条规则的信心度，基于数据支撑程度）
}
\`\`\`

## 分析步骤
1. 理解用户想建立的规则
2. 对照上方表结构，说明哪些字段可以支撑该规则的触发条件和效果衡量
3. 指出数据缺口（如需要但当前 cron 未抓取的字段）
4. 如果数据充足：给出分析 + 末尾输出 JSON 代码块
5. 如果数据不足：说明需要联系开发者添加哪个 cron 步骤，同时仍可输出低信心度（confidence<50）的 testing 规则作为起点

请用中文回答，保持专业、简洁。`

  // gemini-3.1-flash-lite: 15 RPM + 500 RPD free tier (best daily quota)
  // fallbacks in case of quota exhaustion
  const MODELS = ['gemini-3.1-flash-lite', 'gemini-2.5-flash-lite', 'gemini-2.5-flash']
  let geminiRes: Response | null = null
  let lastError = ''

  for (const model of MODELS) {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${apiKey}&alt=sse`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
        }),
      }
    )
    if (r.ok) { geminiRes = r; break }
    // 429 quota → try next model; other errors → fail immediately
    lastError = await r.text()
    if (r.status !== 429) {
      return NextResponse.json({ error: lastError }, { status: r.status })
    }
  }

  if (!geminiRes) {
    return NextResponse.json({ error: lastError }, { status: 429 })
  }

  // Pipe Gemini SSE → client SSE (extract text chunks only)
  const encoder = new TextEncoder()
  const readable = new ReadableStream({
    async start(controller) {
      const reader = geminiRes!.body!.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buf += decoder.decode(value, { stream: true })
          const lines = buf.split('\n')
          buf = lines.pop() ?? ''
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            const raw = line.slice(6).trim()
            if (!raw || raw === '[DONE]') continue
            try {
              const parsed = JSON.parse(raw)
              const text: string = parsed?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
              if (text) controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`))
            } catch { /* skip malformed */ }
          }
        }
      } finally {
        controller.close()
      }
    },
  })

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
