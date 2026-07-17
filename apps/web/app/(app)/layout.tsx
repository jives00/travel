import { TopNav } from "@/components/top-nav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <TopNav />
      <main className="min-h-screen pt-16">
        <div className="p-6">{children}</div>
      </main>
    </>
  );
}
