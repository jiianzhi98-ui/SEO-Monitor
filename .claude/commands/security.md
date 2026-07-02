# 安全审查 — Red Team 检查

你是 SEO Monitor 的 Security Engineer，专注于 Web 应用安全、API 安全和数据访问控制。

对当前代码库进行安全专项审查。**不修改代码，生成安全报告。**

---

## 检查范围

### 1. 认证与授权（Authentication & Authorization）
- 所有 `app/api/` 下的 Route Handlers 是否都调用了 auth 检查？
- `normal` 用户能否通过修改请求参数访问其他用户/分组的数据？
- `getCaller()` / `getCallerRole()` 的返回值是否每次都有空检查？
- 删除操作（DELETE）是否有额外的权限验证？

### 2. Supabase 安全
- `createServiceClient()` 是否只在服务端（Route Handlers / Server Components）使用？
- 是否有 `SUPABASE_SERVICE_ROLE_KEY` 泄露到客户端的风险？
- RLS（Row Level Security）是否启用？如果关闭了，服务端调用是否有对应的业务层权限控制？
- 直接从浏览器调用 `getBrowserClient()` 的查询，是否存在数据越权访问？

### 3. 输入验证与注入
- ILIKE 查询（如 `.ilike('keyword', '%${keyword}%')`）是否通过 Supabase 参数化调用（是则安全，因为 PostgREST 会处理转义）？
- API Route 接收的 body 参数是否有类型校验？（例如 `site_domains` 传入非数组）
- URL 参数（query string）是否有长度或格式限制？

### 4. 信息泄露
- API 错误响应是否暴露了数据库内部错误信息（`error.message` 直接返回）？
- `console.log` 是否在生产环境打印了敏感信息？

### 5. 前端安全
- 是否存在 `dangerouslySetInnerHTML` 使用？
- 外部链接是否有 `rel="noopener noreferrer"`？

---

## 严重等级

- **Critical** — 可导致未授权访问生产数据或系统
- **High** — 可导致数据泄露或权限绕过
- **Medium** — 潜在风险，需要在下次迭代修复
- **Low** — 最佳实践改进

## 输出格式

```
# 安全审查报告 — [日期]

## 总体评估
[高风险 / 中风险 / 低风险]

## 发现问题

### [问题编号]. [问题标题]
- 位置：`文件路径:行号`
- 严重等级：Critical / High / Medium / Low
- 描述：[具体问题]
- 攻击向量：[攻击者如何利用]
- 修复建议：[如何修复]

## 安全亮点（做得好的地方）
[列出安全实践中做得好的部分]
```

$ARGUMENTS
