import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'

export async function POST(req: Request) {
  const { username } = await req.json() as { username: string }

  if (!username?.trim()) {
    return NextResponse.json({ error: '请输入用户名' }, { status: 400 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = createServiceClient() as any

  const { data: profile } = await service
    .from('user_profiles')
    .select('id')
    .eq('username', username.trim())
    .single()

  if (!profile?.id) {
    return NextResponse.json({ error: '用户不存在' }, { status: 404 })
  }

  const { data: { user }, error } = await service.auth.admin.getUserById(profile.id)
  if (error || !user?.email) {
    return NextResponse.json({ error: '账号异常' }, { status: 500 })
  }

  return NextResponse.json({ email: user.email })
}
