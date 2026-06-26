'use client'

import { UserContext, type UserProfile } from '@/lib/user-context'

export default function UserProvider({
  profile,
  children,
}: {
  profile: UserProfile | null
  children: React.ReactNode
}) {
  return (
    <UserContext.Provider value={profile}>
      {children}
    </UserContext.Provider>
  )
}
