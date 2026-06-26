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

  // Dark background
  ctx.fillStyle = '#111827'
  ctx.fillRect(0, 0, w, h)

  // Noise dots
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.15})`
    ctx.beginPath()
    ctx.arc(Math.random() * w, Math.random() * h, Math.random() * 2, 0, Math.PI * 2)
    ctx.fill()
  }

  // Interference lines
  for (let i = 0; i < 3; i++) {
    ctx.strokeStyle = `rgba(255,255,255,0.12)`
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

  // Characters
  for (let i = 0; i < code.length; i++) {
    const x = 14 + i * 28
    const y = h / 2 + 8
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate((Math.random() - 0.5) * 0.5)
    ctx.font = `bold ${22 + Math.floor(Math.random() * 6)}px monospace`
    ctx.fillStyle = CAPTCHA_COLORS[i % CAPTCHA_COLORS.length]
    ctx.shadowColor = CAPTCHA_COLORS[i % CAPTCHA_COLORS.length]
    ctx.shadowBlur = 4
    ctx.fillText(code[i], 0, 0)
    ctx.restore()
  }

  return code
}

// ─── Icon components ──────────────────────────────────────────────────────────

function UserIcon() {
  return (
    <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
        d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  )
}

function LockIcon() {
  return (
    <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
        d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
    </svg>
  )
}

function ShieldIcon() {
  return (
    <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
        d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  )
}

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
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
  )
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

  useEffect(() => {
    refreshCaptcha()
  }, [refreshCaptcha])

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

  const inputClass = "flex-1 bg-transparent text-sm text-gray-800 placeholder-gray-400 outline-none"

  return (
    <div
      className="min-h-screen bg-cover bg-center flex items-center justify-center px-4"
      style={{ backgroundImage: "url('https://picsum.photos/seed/forest99/1920/1080')" }}
    >
      {/* subtle dark overlay so card stands out */}
      <div className="absolute inset-0 bg-black/10" />

      <div className="relative w-full max-w-[400px]">
        <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-2xl px-10 py-10">
          {/* Title */}
          <h1 className="text-2xl font-bold text-gray-900 text-center mb-8 tracking-wide">
            后台管理系统
          </h1>

          <form onSubmit={handleLogin} className="space-y-4">
            {/* Username */}
            <div className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
              <UserIcon />
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                required
                placeholder="用户名"
                autoComplete="username"
                className={inputClass}
              />
            </div>

            {/* Password */}
            <div className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
              <LockIcon />
              <input
                type={showPwd ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                placeholder="密码"
                autoComplete="current-password"
                className={inputClass}
              />
              <button
                type="button"
                onClick={() => setShowPwd(v => !v)}
                className="text-gray-400 hover:text-gray-600 flex-shrink-0"
                tabIndex={-1}
              >
                <EyeIcon open={showPwd} />
              </button>
            </div>

            {/* CAPTCHA */}
            <div className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
              <ShieldIcon />
              <input
                type="text"
                value={captchaInput}
                onChange={e => setCaptchaInput(e.target.value)}
                required
                placeholder="图形验证码"
                maxLength={4}
                autoComplete="off"
                className={inputClass}
              />
              <canvas
                ref={canvasRef}
                width={110}
                height={40}
                onClick={refreshCaptcha}
                className="rounded cursor-pointer flex-shrink-0"
                title="点击刷新"
              />
            </div>

            {/* Error */}
            {error && (
              <div className="text-sm text-red-500 text-center py-1">
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-red-500 hover:bg-red-600 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-2"
            >
              {loading ? '登录中...' : '登录'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
