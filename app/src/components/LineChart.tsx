import { stateCopy } from '../lib/stateCopy'

interface LineChartProps {
  values: number[]
}

export function LineChart({ values }: LineChartProps) {
  if (values.length === 0) {
    return <div className="flex h-32 items-center justify-center rounded-[1.5rem] border border-dashed border-border bg-surface-muted text-sm text-muted">{stateCopy.chartEmpty}</div>
  }

  const max = Math.max(...values, 1)
  const min = Math.min(...values, 0)
  const points = values
    .map((value, index) => {
      const x = (index / Math.max(values.length - 1, 1)) * 100
      const y = 100 - ((value - min) / Math.max(max - min, 1)) * 100
      return `${x},${y}`
    })
    .join(' ')
  const area = `0,100 ${points} 100,100`
  const lastPoint = points.split(' ').at(-1)?.split(',') ?? ['100', '50']

  return (
    <svg viewBox="0 0 100 100" className="h-32 w-full overflow-visible text-accent">
      {Array.from({ length: 4 }).map((_, index) => {
        const y = 20 + index * 20
        return <line key={y} x1="0" x2="100" y1={y} y2={y} stroke="rgb(var(--color-border))" strokeDasharray="2 3" strokeWidth="0.6" />
      })}
      <polygon fill="rgb(var(--color-accent-soft) / 0.65)" points={area} />
      <polyline fill="none" points={points} stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      <circle cx={lastPoint[0]} cy={lastPoint[1]} fill="currentColor" r="2.4" />
    </svg>
  )
}
