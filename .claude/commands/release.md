# 上线前验收 — Release Checklist

你是 SEO Monitor 的 DevOps Lead，在每次推送到生产环境前执行以下完整验收。

**检查完成前不允许上线。**

---

## 项目信息

- 部署平台：Vercel（自动从 `main` 分支部署）
- 数据库：Supabase（需要确认 migration 已执行）
- 定时任务：GitHub Actions（`.github/workflows/`）
- 环境变量前缀：`NEXT_PUBLIC_` 为客户端可见

---

## Checklist

### 🏗️ 构建（Build）
- [ ] `npx tsc --noEmit` 无类型错误
- [ ] `npm run build` 本地构建成功，无报错
- [ ] 无 `any` 类型滥用（除非有明确 eslint-disable 注释）
- [ ] 无 console.log 遗留在生产代码中（除 `console.error`）

### 🗄️ 数据库（Supabase）
- [ ] `supabase/schema.sql` 中的所有表结构已在 Supabase Dashboard 执行
- [ ] 本次改动涉及的新列/新表已确认存在（通过 SQL Editor 验证）
- [ ] RPC 函数（如 `get_hot_streak_words`）版本与代码一致
- [ ] 新查询使用的字段有对应索引（检查 `idx_*` 索引定义）
- [ ] `raw_keywords` 30 天自动清理逻辑未被破坏

### ⚙️ 抓取规则同步（关键）
- [ ] `lib/crawl-rules.ts` 内容与实际 GitHub Actions cron 逻辑一致
- [ ] `.github/workflows/` 中的 cron 时间与规则文档一致
- [ ] 抓取脚本中写入的 Supabase 表字段与最新 schema 匹配

### 🔑 环境变量（ENV）
- [ ] 本地 `.env.local` 中所有变量已在 Vercel Dashboard → Settings → Environment Variables 配置
- [ ] `NEXT_PUBLIC_SUPABASE_URL` 和 `NEXT_PUBLIC_SUPABASE_ANON_KEY` 已配置
- [ ] `SUPABASE_SERVICE_ROLE_KEY` 已配置（仅服务端使用）
- [ ] 无硬编码的密钥或 URL 在代码中

### 🛡️ 权限与安全
- [ ] 所有 API Routes 有 auth 检查（未登录返回 401）
- [ ] `normal` 角色无法访问其他用户数据
- [ ] Service Role Key 仅用于服务端（不在 `NEXT_PUBLIC_` 变量中）
- [ ] ILIKE 查询中的用户输入通过参数化传入（非字符串拼接）

### 🚀 Vercel 部署
- [ ] Preview 部署（PR 环境）功能测试通过
- [ ] 函数超时配置（`vercel.json` 或 route config）满足重型查询需求
- [ ] 无 Edge Runtime 与 Node.js API 不兼容问题

### 🖥️ 前端功能
- [ ] 所有页面在移动端和桌面端正常显示
- [ ] 切换分组时，右面板数据正确刷新
- [ ] 热词雷达 5 个 Tab 数据均可正常加载
- [ ] 站点过滤（rank_domains / new_domains）逻辑正确
- [ ] 空状态（无数据、无分组、无权限）有合适提示
- [ ] 加载状态（Spinner）均正常显示

### 🔴 Console & Error
- [ ] 打开所有主要页面，Chrome DevTools Console 无红色错误
- [ ] Network Tab 无 4xx / 5xx 请求（特别是 API Routes）
- [ ] Supabase Realtime 连接正常（无断线重连循环）

### 📊 数据准确性
- [ ] 热词雷达数据日期与实际抓取日期一致
- [ ] longTailCount 计数逻辑准确（与弹窗展示数量一致）
- [ ] 站点过滤后数据正确减少（不出现过滤反而增加的情况）

---

## 输出格式

逐项检查后，输出：

```
# Release Checklist — [日期]

## 通过项目
✅ [项目名]
...

## 未通过 / 需确认
❌ [项目名] — [具体问题]
⚠️ [项目名] — [需要人工确认]

## 上线建议
[✅ 可以上线 / ⚠️ 建议修复后上线 / ❌ 不建议上线，原因：]
```

$ARGUMENTS
