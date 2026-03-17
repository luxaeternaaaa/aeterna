interface LineChartProps {
  values: number[]
}

export function LineChart({ values }: LineChartProps) {
  const max = Math.max(...values, 1)
  const min = Math.min(...values, 0)
  const points = values
    .map((value, index) => {
      const x = (index / Math.max(values.length - 1, 1)) * 100
      const y = 100 - ((value - min) / Math.max(max - min, 1)) * 100
      return `${x},${y}`
    })
    .join(' ')

  return (
    <svg viewBox="0 0 100 100" className="h-28 w-full overflow-visible">
      <polyline fill="none" stroke="black" strokeWidth="1.5" points={points} vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

