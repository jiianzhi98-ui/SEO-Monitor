import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase-server'

export async function POST(req: Request) {
  const { username, password } = await req.json() as { username: string; password: string }

  if (!username?.trim() || !password) {
    return NextResponse.json({ error: '请输入用户名和密码' }, { status: 400 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = createServiceClient() as any

  const { data: profile } = await service
    .from('user_profiles')
    .select('id')
    .eq('username', username.trim())
    .single()

  if (!profile?.id) {
    return NextResponse.json({ error: '用户名或密码错误' }, { status: 401 })
  }

  const { data: { user }, error: userError } = await service.auth.admin.getUserById(profile.id)
  if (userError || !user?.email) {
    return NextResponse.json({ error: '用户名或密码错误' }, { status: 401 })
  }

  // Sign in server-side — session set via cookie, email never reaches client
  const { error: signInError } = await createClient().auth.signInWithPassword({
    email: user.email,
    password,
  })

  if (signInError) {
    return NextResponse.json({ error: '用户名或密码错误' }, { status: 401 })
  }

  return NextResponse.json({ ok: true })
}
