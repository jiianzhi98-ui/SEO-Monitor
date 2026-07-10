import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: Request) {
  const { username, password } = await req.json()
  if (!username || !password) {
    return NextResponse.json({ error: '请输入用户名和密码' }, { status: 400 })
  }

  const service = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Look up email from username via user_profiles → auth.users
  const { data: profile, error: profileErr } = await service
    .from('user_profiles')
    .select('id')
    .eq('username', username)
    .maybeSingle()

  if (profileErr || !profile) {
    return NextResponse.json({ error: '用户名或密码错误' }, { status: 401 })
  }

  const { data: authUser, error: authErr } = await service.auth.admin.getUserById(profile.id)
  if (authErr || !authUser?.user?.email) {
    return NextResponse.json({ error: '用户名或密码错误' }, { status: 401 })
  }

  // Verify password with a fresh anon client
  const anon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const { error: signInErr } = await anon.auth.signInWithPassword({ email: authUser.user.email, password })
  if (signInErr) {
    return NextResponse.json({ error: '用户名或密码错误' }, { status: 401 })
  }

  return NextResponse.json({ ok: true })
}
