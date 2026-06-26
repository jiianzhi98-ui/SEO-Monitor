'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { getBrowserClient } from '@/lib/supabase'

// ─── Canvas CAPTCHA ───────────────────────────────────────────────────────────

const CAPTCHA_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
const CAPTCHA_COLORS = ['#16a34a', '#0891b2', '#7c3aed', '#b45309', '#dc2626', '#0d9488']

function drawCaptcha(canvas: HTMLCanvasElement): string {
  const code = Array.from({ length: 4 }, () =>
    CAPTCHA_CHARS[Math.floor(Math.random() * CAPTCHA_CHARS.length)]
  ).join('')
  const ctx = canvas.getContext('2d')!
  const w = canvas.width, h = canvas.height
  ctx.fillStyle = '#f9fafb'
  ctx.fillRect(0, 0, w, h)
  ctx.strokeStyle = '#e5e7eb'
  ctx.lineWidth = 1
  ctx.strokeRect(0, 0, w, h)
  for (let i = 0; i < 25; i++) {
    ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.04})`
    ctx.beginPath()
    ctx.arc(Math.random() * w, Math.random() * h, Math.random() * 1.5, 0, Math.PI * 2)
    ctx.fill()
  }
  for (let i = 0; i < code.length; i++) {
    ctx.save()
    ctx.translate(13 + i * 26, h / 2 + 7)
    ctx.rotate((Math.random() - 0.5) * 0.3)
    ctx.font = `700 ${19 + Math.floor(Math.random() * 3)}px monospace`
    ctx.fillStyle = CAPTCHA_COLORS[i % CAPTCHA_COLORS.length]
    ctx.fillText(code[i], 0, 0)
    ctx.restore()
  }
  return code
}

// ─── Turnstile ────────────────────────────────────────────────────────────────

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string
      reset: (id: string) => void
    }
  }
}

// ─── Login Page ───────────────────────────────────────────────────────────────

export default function LoginPage() {
  const [username, setUsername]             = useState('')
  const [password, setPassword]             = useState('')
  const [captchaInput, setCaptchaInput]     = useState('')
  const [showPwd, setShowPwd]               = useState(false)
  const [loading, setLoading]               = useState(false)
  const [error, setError]                   = useState<string | null>(null)
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)

  const canvasRef         = useRef<HTMLCanvasElement>(null)
  const captchaCodeRef    = useRef<string>('')
  const turnstileRef      = useRef<HTMLDivElement>(null)
  const turnstileWidgetId = useRef<string | null>(null)

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
          callback: (token: string) => setTurnstileToken(token),
          'expired-callback': () => setTurnstileToken(null),
          'error-callback':   () => setTurnstileToken(null),
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
      if (!turnstileToken) { setError('请完成人机验证'); return }
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
      setLoading(false); refreshCaptcha(); return
    }
    const { email } = await resolveRes.json()

    const supabase = getBrowserClient()
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password })
    if (authError) {
      setError('密码错误')
      setLoading(false); refreshCaptcha()
    } else {
      window.location.href = '/'
    }
  }

  const inputCls = `
    w-full px-4 py-3 rounded-xl text-sm text-gray-900 placeholder:text-gray-400
    bg-white border border-gray-200
    focus:outline-none focus:border-green-500 focus:ring-4 focus:ring-green-500/10
    transition-all duration-150
  `

  return (
    <div className="min-h-screen relative overflow-hidden bg-gray-100">

      {/* ── Full-page background photo ── */}
      {/* Unsplash: laptop + analytics charts, clean & bright — relevant to SEO monitoring */}
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{
          backgroundImage: "url('https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=1920&q=80')",
        }}
      />
      {/* Light veil so card stands out */}
      <div className="absolute inset-0 bg-white/30 backdrop-blur-[2px]" />

      {/* ── Logo — top left ── */}
      <div className="absolute top-7 left-8 z-20 flex items-center gap-2.5">
        <div className="w-8 h-8 bg-green-600 rounded-lg shadow-md flex items-center justify-center flex-shrink-0">
          <svg className="w-4.5 h-4.5 text-white w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        </div>
        <span className="font-semibold text-gray-900 text-base">SEO Monitor</span>
      </div>

      {/* ── Form card — right side ── */}
      <div className="relative z-10 min-h-screen flex items-center justify-end px-6 sm:px-12 lg:px-20 xl:px-28">
        <div className="w-full max-w-[420px] bg-white/95 backdrop-blur-sm rounded-2xl shadow-2xl shadow-gray-400/20 p-8 sm:p-10">

          {/* Heading */}
          <div className="mb-7">
            <p className="text-sm text-gray-500 mb-1">
              Welcome to&nbsp;
              <span className="text-green-600 font-semibold">SEO Monitor</span>
            </p>
            <h1 className="text-3xl font-bold text-gray-900 tracking-tight">登录账户</h1>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">

            {/* Username */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">用户名</label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                required
                placeholder="输入用户名"
                autoComplete="username"
                className={inputCls}
              />
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">密码</label>
              <div className="relative">
                <input
                  type={showPwd ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  placeholder="输入密码"
                  autoComplete="current-password"
                  className={inputCls + ' pr-11'}
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(v => !v)}
                  tabIndex={-1}
                  className="absolute inset-y-0 right-0 px-3.5 flex items-center text-gray-400 hover:text-gray-600 transition-colors"
                >
                  {showPwd
                    ? <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                    : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/></svg>
                  }
                </button>
              </div>
            </div>

            {/* CAPTCHA */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">图形验证码</label>
              <div className="flex gap-2.5">
                <input
                  type="text"
                  value={captchaInput}
                  onChange={e => setCaptchaInput(e.target.value)}
                  required
                  placeholder="输入右侧验证码"
                  maxLength={4}
                  autoComplete="off"
                  className={inputCls}
                />
                <canvas
                  ref={canvasRef}
                  width={116}
                  height={48}
                  onClick={refreshCaptcha}
                  title="点击刷新"
                  className="rounded-xl cursor-pointer flex-shrink-0 border border-gray-200"
                />
              </div>
              <p className="text-xs text-gray-400 mt-1.5">不区分大小写 · 点击图片刷新</p>
            </div>

            {/* Turnstile */}
            {process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY && (
              <div ref={turnstileRef} className="pt-0.5" />
            )}

            {/* Error */}
            {error && (
              <div className="flex items-start gap-2.5 rounded-xl bg-red-50 border border-red-100 px-4 py-3">
                <svg className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 mt-1 bg-green-600 hover:bg-green-700 active:scale-[0.99] text-white text-sm font-semibold rounded-xl shadow-md shadow-green-600/20 focus:outline-none focus:ring-4 focus:ring-green-500/20 transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading
                ? <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                    </svg>
                    登录中...
                  </span>
                : '登录'
              }
            </button>

          </form>
        </div>
      </div>

    </div>
  )
}
