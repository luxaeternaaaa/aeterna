export function StartupSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <section className="grid gap-4 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="h-28 rounded-[1.75rem] border border-border bg-[#fafafa]" />
        ))}
      </section>
      <section className="grid gap-6 xl:grid-cols-[1.4fr_0.8fr]">
        <div className="h-80 rounded-[1.75rem] border border-border bg-[#fafafa]" />
        <div className="h-80 rounded-[1.75rem] border border-border bg-[#fafafa]" />
      </section>
    </div>
  )
}
