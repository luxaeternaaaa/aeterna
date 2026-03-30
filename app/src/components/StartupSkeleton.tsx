export function StartupSkeleton() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="rounded-[2rem] bg-surface px-6 py-6 shadow-panel ring-1 ring-inset ring-border/65">
        <div className="h-3 w-24 rounded-full bg-hover" />
        <div className="mt-5 h-11 w-64 rounded-2xl bg-hover" />
        <div className="mt-4 h-4 w-80 rounded-full bg-hover" />
        <div className="mt-6 h-12 w-44 rounded-xl bg-hover" />
      </div>
      <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-[1.75rem] bg-surface-muted p-6">
          <div className="h-3 w-24 rounded-full bg-hover" />
          <div className="mt-4 h-10 w-56 rounded-full bg-hover" />
          <div className="mt-3 h-4 w-80 rounded-full bg-hover" />
          <div className="mt-8 h-52 rounded-[1.5rem] bg-surface" />
        </div>
        <div className="space-y-4">
          {Array.from({ length: 2 }).map((_, index) => (
            <div key={index} className="rounded-[1.75rem] bg-surface-muted p-5">
              <div className="h-3 w-24 rounded-full bg-hover" />
              <div className="mt-4 h-8 w-40 rounded-full bg-hover" />
              <div className="mt-4 space-y-3">
                <div className="h-4 w-full rounded-full bg-hover" />
                <div className="h-4 w-4/5 rounded-full bg-hover" />
              </div>
            </div>
          ))}
        </div>
      </section>
      <section className="grid gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="rounded-[1.75rem] bg-surface-muted p-5">
            <div className="h-3 w-20 rounded-full bg-hover" />
            <div className="mt-6 h-10 w-24 rounded-full bg-hover" />
            <div className="mt-5 h-3 w-32 rounded-full bg-hover" />
          </div>
        ))}
      </section>
      <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <div className="rounded-[1.75rem] bg-surface-muted p-6">
          <div className="h-4 w-40 rounded-full bg-hover" />
          <div className="mt-3 h-3 w-52 rounded-full bg-hover" />
          <div className="mt-8 space-y-4">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="h-20 rounded-[1.5rem] bg-surface" />
            ))}
          </div>
        </div>
        <div className="rounded-[1.75rem] bg-surface-muted p-6">
          <div className="h-4 w-40 rounded-full bg-hover" />
          <div className="mt-3 h-3 w-48 rounded-full bg-hover" />
          <div className="mt-8 space-y-4">
            {Array.from({ length: 2 }).map((_, index) => (
              <div key={index} className="h-24 rounded-[1.5rem] bg-surface" />
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
