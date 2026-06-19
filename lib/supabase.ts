import { createBrowserClient } from '@supabase/ssr'

export type Database = {
  public: {
    Tables: {
      sites: {
        Row: {
          id: string
          domain: string
          name: string
          category: 'large' | 'medium' | 'small'
          crawl_type: 'sitemap' | 'html' | 'rss'
          list_url: string | null
          title_selector: string | null
          date_selector: string | null
          crawl_frequency: 'daily' | 'every3days' | 'weekly'
          enable_version_clean: boolean
          version_suffixes: string[]
          is_enabled: boolean
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['sites']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['sites']['Insert']>
      }
      raw_keywords: {
        Row: {
          id: string
          keyword: string
          site_id: string
          source_url: string | null
          discovered_at: string
        }
        Insert: Omit<Database['public']['Tables']['raw_keywords']['Row'], 'id' | 'discovered_at'>
        Update: Partial<Database['public']['Tables']['raw_keywords']['Insert']>
      }
      daily_stats: {
        Row: {
          id: string
          site_id: string
          stat_date: string
          new_count: number
        }
        Insert: Omit<Database['public']['Tables']['daily_stats']['Row'], 'id'>
        Update: Partial<Database['public']['Tables']['daily_stats']['Insert']>
      }
      index_snapshots: {
        Row: {
          id: string
          site_id: string
          snapshot_date: string
          index_count: number
        }
        Insert: Omit<Database['public']['Tables']['index_snapshots']['Row'], 'id'>
        Update: Partial<Database['public']['Tables']['index_snapshots']['Insert']>
      }
      weight_history: {
        Row: {
          id: string
          site_id: string
          record_date: string
          pc_weight: number
          mobile_weight: number
        }
        Insert: Omit<Database['public']['Tables']['weight_history']['Row'], 'id'>
        Update: Partial<Database['public']['Tables']['weight_history']['Insert']>
      }
      keyword_volume: {
        Row: {
          keyword: string
          volume: number
          stat_date: string
        }
        Insert: Database['public']['Tables']['keyword_volume']['Row']
        Update: Partial<Database['public']['Tables']['keyword_volume']['Insert']>
      }
    }
  }
}

// Browser singleton — safe to import in 'use client' files
let browserClient: ReturnType<typeof createBrowserClient<Database>> | null = null

export function getBrowserClient() {
  if (!browserClient) {
    browserClient = createBrowserClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  }
  return browserClient
}
