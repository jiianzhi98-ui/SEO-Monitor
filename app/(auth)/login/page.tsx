'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { getBrowserClient } from '@/lib/supabase'

// ─── Canvas CAPTCHA ───────────────────────────────────────────────────────────

const CAPTCHA_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
const CAPTCHA_COLORS = ['#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff', '#c77dff', '#ff9f43']

function drawCaptcha(canvas: HTMLCanvasElement): string {
  const code = Array.from({ length: 4 }, () =>
    CAPTCHA_CHARS[Math.floor(Math.random() * CAPTCHA_CHARS.length)]
  ).join('')

  const ctx = canvas.getContext('2d')!
  const w = canvas.width
  const h = canvas.height

  ctx.fillStyle = '#111827'
  ctx.fillRect(0, 0, w, h)

  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.12})`
    ctx.beginPath()
    ctx.arc(Math.random() * w, Math.random() * h, Math.random() * 1.5, 0, Math.PI * 2)
    ctx.fill()
  }

  for (let i = 0; i < 3; i++) {
    ctx.strokeStyle = `rgba(255,255,255,0.1)`
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
    ctx.translate(12 + i * 24, h / 2 + 7)
    ctx.rotate((Math.random() - 0.5) * 0.4)
    ctx.font = `bold ${20 + Math.floor(Math.random() * 5)}px monospace`
    ctx.fillStyle = CAPTCHA_COLORS[i % CAPTCHA_COLORS.length]
    ctx.fillText(code[i], 0, 0)
    ctx.restore()
  }

  return code
}

// ─── Login page ───────────────────────────────────────────────────────────────

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [captchaInput, setCaptchaInput] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const captchaCodeRef = useRef<string>('')

  const refreshCaptcha = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    captchaCodeRef.current = drawCaptcha(canvas)
    setCaptchaInput('')
  }, [])

  useEffect(() => { refreshCaptcha() }, [refreshCaptcha])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (captchaInput.toLowerCase() !== captchaCodeRef.current.toLowerCase()) {
      setError('验证码错误，请重新输入')
      refreshCaptcha()
      return
    }

    setLoading(true)

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
    <div className="min-h-screen flex items-center justify-center px-4"
      style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f2318 100%)' }}>
      <div className="w-full max-w-md">

        {/* Login Card */}
        <div className="bg-white rounded-2xl shadow-2xl p-8">

          {/* Brand inside card */}
          <div className="flex items-center gap-3 mb-8 pb-6 border-b border-gray-100">
            <div className="flex items-center justify-center w-10 h-10 bg-green-600 rounded-lg flex-shrink-0">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <h1 className="text-xl font-bold text-gray-900">SEO Monitor</h1>
          </div>

          <h2 className="text-base font-semibold text-gray-700 mb-5">登录账户</h2>

          <form onSubmit={handleLogin} className="space-y-5">
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
                className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-shadow"
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
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="w-full px-3.5 py-2.5 pr-10 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-shadow"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(v => !v)}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-400 hover:text-gray-600"
                  tabIndex={-1}
                >
                  {showPwd ? (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* CAPTCHA */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">图形验证码</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={captchaInput}
                  onChange={e => setCaptchaInput(e.target.value)}
                  required
                  placeholder="输入右侧验证码"
                  maxLength={4}
                  autoComplete="off"
                  className="flex-1 px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-shadow"
                />
                <canvas
                  ref={canvasRef}
                  width={110}
                  height={42}
                  onClick={refreshCaptcha}
                  className="rounded-lg cursor-pointer flex-shrink-0"
                  title="点击刷新"
                />
              </div>
              <p className="text-xs text-gray-400 mt-1">不区分大小写 · 点击图片可刷新</p>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-600">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
