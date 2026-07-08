export function AppBootSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      <div className="md:hidden sticky top-0 z-30 h-14 border-b border-border bg-background/95 backdrop-blur" />
      <div className="flex min-h-screen md:min-h-0">
        <aside className="hidden md:block md:w-56 shrink-0 p-3">
          <div className="glass-panel rounded-2xl h-[calc(100vh-1.5rem)] animate-pulse bg-muted/20" />
        </aside>
        <main className="flex-1 p-4 md:p-8 space-y-4">
          <div className="h-8 w-40 rounded-lg bg-muted/30 animate-pulse" />
          <div className="h-36 rounded-2xl bg-muted/20 animate-pulse" />
          <div className="h-36 rounded-2xl bg-muted/20 animate-pulse" />
        </main>
      </div>
    </div>
  );
}

export function DashboardPageSkeleton() {
  return (
    <div className="p-4 md:p-8 space-y-4 animate-pulse">
      <div className="h-8 w-48 rounded-lg bg-muted/30" />
      <div className="h-28 rounded-2xl bg-muted/20" />
      <div className="h-28 rounded-2xl bg-muted/20" />
    </div>
  );
}
