import Sidebar from '@/components/sidebar'
import UserProvider from '@/components/user-provider'
import { getUserProfile } from '@/lib/get-user-profile'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const profile = await getUserProfile()
  return (
    <UserProvider profile={profile}>
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <main className="flex-1 ml-[220px] bg-slate-50 h-screen overflow-y-auto">
          {children}
        </main>
      </div>
    </UserProvider>
  )
}
