import { stateCopy } from '../lib/stateCopy'

interface LineChartProps {
  values: number[]
}

export function LineChart({ values }: LineChartProps) {
  if (values.length === 0) {
    return <div className="empty-state flex h-32 items-center justify-center text-center text-sm text-muted">{stateCopy.chartEmpty}</div>
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
        return <line key={y} x1="0" x2="100" y1={y} y2={y} stroke="rgb(var(--color-border) / 0.7)" strokeDasharray="2 3" strokeWidth="0.6" />
      })}
      <defs>
        <linearGradient id="aeterna-chart-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="rgb(var(--color-accent) / 0.28)" />
          <stop offset="100%" stopColor="rgb(var(--color-accent-soft) / 0.1)" />
        </linearGradient>
      </defs>
      <polygon fill="url(#aeterna-chart-fill)" points={area} />
      <polyline fill="none" points={points} stroke="currentColor" strokeWidth="2.4" vectorEffect="non-scaling-stroke" />
      <circle cx={lastPoint[0]} cy={lastPoint[1]} fill="currentColor" r="2.4" />
      <circle cx={lastPoint[0]} cy={lastPoint[1]} fill="rgb(var(--color-surface))" r="1.05" />
    </svg>
  )
}
