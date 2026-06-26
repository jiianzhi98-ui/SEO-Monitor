'use client'

import { createContext, useContext } from 'react'

export type UserRole = 'super' | 'admin' | 'normal'

export interface UserProfile {
  id: string
  email: string
  role: UserRole
  // null = all sites accessible (super/admin); string[] = allowed site IDs (normal)
  accessibleSiteIds: string[] | null
}

export const UserContext = createContext<UserProfile | null>(null)

export function useUser(): UserProfile {
  const ctx = useContext(UserContext)
  if (!ctx) {
    return { id: '', email: '', role: 'normal', accessibleSiteIds: null }
  }
  return ctx
}
