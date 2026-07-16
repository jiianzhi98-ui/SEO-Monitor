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
这是一个面向马来西亚市场的 SEO 监控平台，功能包括：
- 热词雷达：监控竞品关键词排名变化、新增词库
- 分组任务：团队成员认领关键词、追踪成效
- 成效追踪：监控自有站点排名（通过 cron 每日抓取）和收录状态
- 规则中心：记录经过验证的 SEO 操作规则

## 当前系统数据
${contextStr}

## 需要 cron 支撑但可能缺失的数据
- 关键词排名数据：需要 rank-checker cron（每日抓取 Google 搜索排名）
- 收录数据：需要 index-checker cron（每日查询 Google Search Console API 或 site: 查询）
- 竞品关键词：需要 competitor-crawler cron（每日爬取竞品站点内容）
- 搜索量数据：需要 volume-fetcher cron（调用 Keyword Planner API）

## 规则 JSON 结构（如需输出建议规则）
\`\`\`
{
  "name": "规则名称（简洁，20字以内）",
  "type": "add（新增内容） | update（更新内容） | mixed（新增+更新）",
  "status": "active（立即启用） | testing（先测试）",
  "stage_applicability": ["起站期", "成长期", "成熟期", "通用"] 中的一个或多个,
  "description": "触发条件 → 执行动作 → 预期效果（50-150字）",
  "confidence": 0-100（对这条规则的信心度，基于数据支撑程度）
}
\`\`\`

## 分析步骤
1. 理解用户想建立的规则
2. 检查现有数据是否足够支撑此规则（参考上面的系统数据）
3. 说明哪些数据已有、哪些不足
4. 如果数据足够：输出分析 + 最后输出 JSON 代码块
5. 如果数据不足：说明需要哪些 cron 任务，用户可联系开发者添加，同时仍可基于现有信息建议一个初步规则（设置 confidence 较低，status 为 testing）

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
