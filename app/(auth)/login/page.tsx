'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { getBrowserClient } from '@/lib/supabase'

// ─── Canvas CAPTCHA ───────────────────────────────────────────────────────────

const CAPTCHA_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
const CAPTCHA_COLORS = ['#34d399', '#6ee7b7', '#a7f3d0', '#86efac', '#4ade80', '#bbf7d0']

function drawCaptcha(canvas: HTMLCanvasElement): string {
  const code = Array.from({ length: 4 }, () =>
    CAPTCHA_CHARS[Math.floor(Math.random() * CAPTCHA_CHARS.length)]
  ).join('')
  const ctx = canvas.getContext('2d')!
  const w = canvas.width, h = canvas.height
  ctx.fillStyle = 'rgba(255,255,255,0.05)'
  ctx.fillRect(0, 0, w, h)
  // border
  ctx.strokeStyle = 'rgba(255,255,255,0.1)'
  ctx.lineWidth = 1
  ctx.strokeRect(0.5, 0.5, w - 1, h - 1)
  for (let i = 0; i < 20; i++) {
    ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`
    ctx.beginPath()
    ctx.arc(Math.random() * w, Math.random() * h, Math.random() * 1, 0, Math.PI * 2)
    ctx.fill()
  }
  for (let i = 0; i < code.length; i++) {
    ctx.save()
    ctx.translate(14 + i * 26, h / 2 + 7)
    ctx.rotate((Math.random() - 0.5) * 0.3)
    ctx.font = `600 ${18 + Math.floor(Math.random() * 3)}px monospace`
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
      reset: (id: string) => void
    }
  }
}

// ─── Login page ───────────────────────────────────────────────────────────────

export default function LoginPage() {
  const [username, setUsername]           = useState('')
  const [password, setPassword]           = useState('')
  const [captchaInput, setCaptchaInput]   = useState('')
  const [showPwd, setShowPwd]             = useState(false)
  const [loading, setLoading]             = useState(false)
  const [error, setError]                 = useState<string | null>(null)
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
          theme: 'dark',
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

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden"
      style={{ background: '#080d15' }}>

      {/* ── Background atmosphere ── */}
      {/* Green glow top-left */}
      <div className="absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(22,163,74,0.18) 0%, transparent 65%)' }} />
      {/* Teal glow bottom-right */}
      <div className="absolute -bottom-60 -right-40 w-[700px] h-[700px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(6,182,212,0.10) 0%, transparent 65%)' }} />
      {/* Subtle dot grid */}
      <div className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.025) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }} />

      {/* ── Card ── */}
      <div className="relative z-10 w-full max-w-[440px] mx-4"
        style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '20px',
          backdropFilter: 'blur(24px)',
          boxShadow: '0 32px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04) inset',
        }}>

        <div className="p-8 sm:p-10">

          {/* Logo */}
          <div className="flex items-center gap-3 mb-10">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, #16a34a, #15803d)', boxShadow: '0 4px 16px rgba(22,163,74,0.4)' }}>
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <span className="text-white/90 font-semibold text-base tracking-tight">SEO Monitor</span>
          </div>

          {/* Heading */}
          <div className="mb-8">
            <h1 className="text-[28px] font-bold text-white leading-tight tracking-tight">
              欢迎回来
            </h1>
            <p className="text-white/35 text-sm mt-1.5">登录您的管理账户以继续</p>
          </div>

          {/* Form */}
          <form onSubmit={handleLogin} className="space-y-4">

            {/* Username */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-white/50 tracking-wide">用户名</label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                required
                placeholder="输入用户名"
                autoComplete="username"
                className="w-full px-4 py-3 rounded-xl text-sm text-white placeholder:text-white/20 outline-none transition-all duration-150"
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
                onFocus={e => {
                  e.currentTarget.style.border = '1px solid rgba(22,163,74,0.6)'
                  e.currentTarget.style.background = 'rgba(255,255,255,0.07)'
                  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(22,163,74,0.1)'
                }}
                onBlur={e => {
                  e.currentTarget.style.border = '1px solid rgba(255,255,255,0.08)'
                  e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
                  e.currentTarget.style.boxShadow = 'none'
                }}
              />
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-white/50 tracking-wide">密码</label>
              <div className="relative">
                <input
                  type={showPwd ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  placeholder="输入密码"
                  autoComplete="current-password"
                  className="w-full px-4 py-3 pr-11 rounded-xl text-sm text-white placeholder:text-white/20 outline-none transition-all duration-150"
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.08)',
                  }}
                  onFocus={e => {
                    e.currentTarget.style.border = '1px solid rgba(22,163,74,0.6)'
                    e.currentTarget.style.background = 'rgba(255,255,255,0.07)'
                    e.currentTarget.style.boxShadow = '0 0 0 3px rgba(22,163,74,0.1)'
                  }}
                  onBlur={e => {
                    e.currentTarget.style.border = '1px solid rgba(255,255,255,0.08)'
                    e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
                    e.currentTarget.style.boxShadow = 'none'
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(v => !v)}
                  tabIndex={-1}
                  className="absolute inset-y-0 right-0 px-3.5 flex items-center text-white/25 hover:text-white/60 transition-colors"
                >
                  {showPwd
                    ? <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                    : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/></svg>
                  }
                </button>
              </div>
            </div>

            {/* CAPTCHA */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-white/50 tracking-wide">图形验证码</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={captchaInput}
                  onChange={e => setCaptchaInput(e.target.value)}
                  required
                  placeholder="输入右侧验证码"
                  maxLength={4}
                  autoComplete="off"
                  className="flex-1 px-4 py-3 rounded-xl text-sm text-white placeholder:text-white/20 outline-none transition-all duration-150"
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.08)',
                  }}
                  onFocus={e => {
                    e.currentTarget.style.border = '1px solid rgba(22,163,74,0.6)'
                    e.currentTarget.style.background = 'rgba(255,255,255,0.07)'
                    e.currentTarget.style.boxShadow = '0 0 0 3px rgba(22,163,74,0.1)'
                  }}
                  onBlur={e => {
                    e.currentTarget.style.border = '1px solid rgba(255,255,255,0.08)'
                    e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
                    e.currentTarget.style.boxShadow = 'none'
                  }}
                />
                <canvas
                  ref={canvasRef}
                  width={116}
                  height={48}
                  onClick={refreshCaptcha}
                  title="点击刷新"
                  className="rounded-xl cursor-pointer flex-shrink-0"
                />
              </div>
              <p className="text-xs text-white/20">不区分大小写 · 点击图片刷新</p>
            </div>

            {/* Turnstile */}
            {process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY && (
              <div ref={turnstileRef} className="pt-0.5" />
            )}

            {/* Error */}
            {error && (
              <div className="flex items-start gap-2.5 rounded-xl px-4 py-3"
                style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}>
                <svg className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm text-red-300">{error}</p>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-all duration-150 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed mt-1"
              style={{
                background: 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)',
                boxShadow: '0 4px 24px rgba(22,163,74,0.35)',
              }}
              onMouseEnter={e => { if (!loading) e.currentTarget.style.boxShadow = '0 6px 28px rgba(22,163,74,0.5)' }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 4px 24px rgba(22,163,74,0.35)' }}
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
