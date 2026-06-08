import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'

export async function GET() {
  try {
    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from('sites')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) throw error
    return NextResponse.json({ sites: data })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : '查询失败' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { id, created_at, ...insertData } = body
    void id; void created_at

    const supabase = createServiceClient()
    const { data, error } = await (supabase.from('sites') as any).insert(insertData)
      .select()
      .single()
    if (error) throw error
    return NextResponse.json({ site: data }, { status: 201 })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : '创建失败' }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json()
    const { id, created_at, ...updateData } = body
    if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 })
    void created_at

    const supabase = createServiceClient()
    const { data, error } = await (supabase.from('sites') as any).update(updateData).eq('id', id).select().single()
    if (error) throw error
    return NextResponse.json({ site: data })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : '更新失败' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const { id } = await request.json()
    if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 })

    const supabase = createServiceClient()
    const { error } = await supabase.from('sites').delete().eq('id', id)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : '删除失败' }, { status: 500 })
  }
}
