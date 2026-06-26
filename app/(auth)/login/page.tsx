'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { getBrowserClient } from '@/lib/supabase'

// ─── Canvas CAPTCHA ───────────────────────────────────────────────────────────

const CAPTCHA_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
const CAPTCHA_COLORS = ['#34d399', '#60a5fa', '#f472b6', '#fbbf24', '#a78bfa', '#fb7185']

function drawCaptcha(canvas: HTMLCanvasElement): string {
  const code = Array.from({ length: 4 }, () =>
    CAPTCHA_CHARS[Math.floor(Math.random() * CAPTCHA_CHARS.length)]
  ).join('')

  const ctx = canvas.getContext('2d')!
  const w = canvas.width
  const h = canvas.height

  ctx.fillStyle = '#0f172a'
  ctx.fillRect(0, 0, w, h)

  for (let i = 0; i < 35; i++) {
    ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.08})`
    ctx.beginPath()
    ctx.arc(Math.random() * w, Math.random() * h, Math.random() * 1.2, 0, Math.PI * 2)
    ctx.fill()
  }

  for (let i = 0; i < 2; i++) {
    ctx.strokeStyle = `rgba(52,211,153,0.15)`
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(Math.random() * w, Math.random() * h)
    ctx.bezierCurveTo(
      Math.random() * w, Math.random() * h,
      Math.random() * w, Math.random() * h,
      Math.random() * w, Math.random() * h,
    )
    ctx.stroke()
  }

  for (let i = 0; i < code.length; i++) {
    ctx.save()
    ctx.translate(14 + i * 26, h / 2 + 7)
    ctx.rotate((Math.random() - 0.5) * 0.35)
    ctx.font = `bold ${19 + Math.floor(Math.random() * 4)}px monospace`
    ctx.fillStyle = CAPTCHA_COLORS[i % CAPTCHA_COLORS.length]
    ctx.fillText(code[i], 0, 0)
    ctx.restore()
  }

  return code
}

// ─── Turnstile type ───────────────────────────────────────────────────────────

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string
      reset: (widgetId: string) => void
    }
  }
}

// ─── Login page ───────────────────────────────────────────────────────────────

export default function LoginPage() {
  const [username, setUsername]       = useState('')
  const [password, setPassword]       = useState('')
  const [captchaInput, setCaptchaInput] = useState('')
  const [showPwd, setShowPwd]         = useState(false)
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState<string | null>(null)
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)

  const canvasRef          = useRef<HTMLCanvasElement>(null)
  const captchaCodeRef     = useRef<string>('')
  const turnstileRef       = useRef<HTMLDivElement>(null)
  const turnstileWidgetId  = useRef<string | null>(null)

  const refreshCaptcha = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    captchaCodeRef.current = drawCaptcha(canvas)
    setCaptchaInput('')
  }, [])

  useEffect(() => { refreshCaptcha() }, [refreshCaptcha])

  useEffect(() => {
    const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
    if (!siteKey) return
    const script = document.createElement('script')
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
    script.async = true
    script.onload = () => {
      if (turnstileRef.current && window.turnstile) {
        turnstileWidgetId.current = window.turnstile.render(turnstileRef.current, {
          sitekey: siteKey,
          theme: 'light',
          size: 'normal',
          callback: (token: string) => setTurnstileToken(token),
          'expired-callback': () => setTurnstileToken(null),
          'error-callback': () => setTurnstileToken(null),
        })
      }
    }
    document.head.appendChild(script)
    return () => { document.head.removeChild(script) }
  }, [])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (captchaInput.toLowerCase() !== captchaCodeRef.current.toLowerCase()) {
      setError('验证码错误，请重新输入')
      refreshCaptcha()
      return
    }

    const hasTurnstile = !!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
    if (hasTurnstile) {
      if (!turnstileToken) {
        setError('请完成人机验证')
        return
      }
      setLoading(true)
      const tsRes = await fetch('/api/auth/verify-turnstile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: turnstileToken }),
      })
      if (!tsRes.ok) {
        const d = await tsRes.json()
        setError(d.error ?? '人机验证失败，请重试')
        setLoading(false)
        setTurnstileToken(null)
        if (turnstileWidgetId.current && window.turnstile) window.turnstile.reset(turnstileWidgetId.current)
        return
      }
    } else {
      setLoading(true)
    }

    const resolveRes = await fetch('/api/auth/resolve-username', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username.trim() }),
    })
    if (!resolveRes.ok) {
      const d = await resolveRes.json()
      setError(d.error ?? '用户不存在')
      setLoading(false)
      refreshCaptcha()
      return
    }
    const { email } = await resolveRes.json()

    const supabase = getBrowserClient()
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password })

    if (authError) {
      setError('密码错误')
      setLoading(false)
      refreshCaptcha()
    } else {
      window.location.href = '/'
    }
  }

  return (
    <div className="min-h-screen flex">

      {/* ── Left brand panel ── */}
      <div
        className="hidden lg:flex lg:w-5/12 xl:w-[45%] flex-col justify-between p-12 relative overflow-hidden"
        style={{ background: 'linear-gradient(160deg, #0a0f1e 0%, #0d2818 55%, #071a2e 100%)' }}
      >
        {/* Decorative grid */}
        <div className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />

        {/* Decorative glow */}
        <div className="absolute top-1/3 -left-20 w-80 h-80 rounded-full opacity-20"
          style={{ background: 'radial-gradient(circle, #16a34a 0%, transparent 70%)' }}
        />
        <div className="absolute bottom-1/4 right-0 w-60 h-60 rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, #0ea5e9 0%, transparent 70%)' }}
        />

        {/* Logo */}
        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 bg-green-500 rounded-xl shadow-lg shadow-green-500/30">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <span className="text-white text-xl font-bold tracking-tight">SEO Monitor</span>
          </div>
        </div>

        {/* Center content */}
        <div className="relative z-10 space-y-8">
          <div>
            <h2 className="text-3xl font-bold text-white leading-snug">
              关键词监控<br />
              <span className="text-green-400">实时掌握</span>排名动态
            </h2>
            <p className="mt-3 text-slate-400 text-sm leading-relaxed">
              集成竞品分析、流量监控与索引追踪，为您的 SEO 决策提供数据支持。
            </p>
          </div>

          <div className="space-y-4">
            {[
              { icon: '📈', label: '关键词排名追踪', desc: '每日自动抓取，趋势一目了然' },
              { icon: '🔍', label: '竞品分析对比',   desc: '多站点横向对比，洞察差距' },
              { icon: '📊', label: '流量指数监控',   desc: '百度权重与收录量同步追踪' },
            ].map(item => (
              <div key={item.label} className="flex items-start gap-3">
                <span className="text-lg mt-0.5">{item.icon}</span>
                <div>
                  <p className="text-white text-sm font-medium">{item.label}</p>
                  <p className="text-slate-500 text-xs mt-0.5">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom */}
        <div className="relative z-10">
          <p className="text-slate-600 text-xs">© 2025 SEO Monitor · 后台管理系统</p>
        </div>
      </div>

      {/* ── Right form panel ── */}
      <div className="flex-1 flex items-center justify-center px-6 py-12 bg-slate-50">
        <div className="w-full max-w-[400px]">

          {/* Mobile logo */}
          <div className="flex items-center gap-2.5 mb-10 lg:hidden">
            <div className="flex items-center justify-center w-8 h-8 bg-green-600 rounded-lg">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <span className="text-gray-900 text-lg font-bold">SEO Monitor</span>
          </div>

          {/* Heading */}
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-gray-900">欢迎回来</h1>
            <p className="text-gray-500 text-sm mt-1.5">请登录您的管理账户</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">

            {/* Username */}
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-gray-700">用户名</label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                required
                placeholder="输入用户名"
                autoComplete="username"
                className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500/30 focus:border-green-500 transition-all"
              />
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-gray-700">密码</label>
              <div className="relative">
                <input
                  type={showPwd ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="w-full px-4 py-2.5 pr-11 bg-white border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500/30 focus:border-green-500 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(v => !v)}
                  tabIndex={-1}
                  className="absolute inset-y-0 right-0 flex items-center px-3.5 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  {showPwd ? (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                        d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Canvas CAPTCHA */}
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-gray-700">图形验证码</label>
              <div className="flex gap-2.5">
                <input
                  type="text"
                  value={captchaInput}
                  onChange={e => setCaptchaInput(e.target.value)}
                  required
                  placeholder="输入右侧验证码"
                  maxLength={4}
                  autoComplete="off"
                  className="flex-1 px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500/30 focus:border-green-500 transition-all"
                />
                <canvas
                  ref={canvasRef}
                  width={116}
                  height={44}
                  onClick={refreshCaptcha}
                  title="点击刷新"
                  className="rounded-xl cursor-pointer flex-shrink-0 shadow-sm"
                />
              </div>
              <p className="text-xs text-gray-400">不区分大小写 · 点击图片刷新</p>
            </div>

            {/* Turnstile */}
            {process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY && (
              <div ref={turnstileRef} />
            )}

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2.5 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
                <svg className="w-4 h-4 text-red-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-xl shadow-sm shadow-green-600/20 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 focus:ring-offset-slate-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  登录中...
                </span>
              ) : '登录'}
            </button>

          </form>
        </div>
      </div>

    </div>
  )
}
