import { NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase-server'

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

  // Use plain anon client to verify password — returns session tokens, email never leaves server
  const anonClient = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const { data: signInData, error: signInError } = await anonClient.auth.signInWithPassword({
    email: user.email,
    password,
  })

  if (signInError || !signInData.session) {
    return NextResponse.json({ error: '用户名或密码错误' }, { status: 401 })
  }

  return NextResponse.json({
    access_token: signInData.session.access_token,
    refresh_token: signInData.session.refresh_token,
  })
}
