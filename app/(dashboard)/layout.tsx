import Sidebar from '@/components/sidebar'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 ml-[220px] bg-white min-h-screen overflow-auto">
        {children}
      </main>
    </div>
  )
}
