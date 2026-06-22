import React, { FC, useCallback } from 'react'
import { useGraphStore } from '@/stores/graph'

export const YearRangeSlider: FC = () => {
  const yearFilter = useGraphStore.use.yearFilter()
  const setYearFilter = useGraphStore.getState().setYearFilter

  const minYear = 1997
  const maxYear = 2026

  const handleMinChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = Math.min(Number(e.target.value), yearFilter[1] - 1)
    setYearFilter([value, yearFilter[1]])
  }, [yearFilter, setYearFilter])

  const handleMaxChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = Math.max(Number(e.target.value), yearFilter[0] + 1)
    setYearFilter([yearFilter[0], value])
  }, [yearFilter, setYearFilter])

  const minPercent = ((yearFilter[0] - minYear) / (maxYear - minYear)) * 100
  const maxPercent = ((yearFilter[1] - minYear) / (maxYear - minYear)) * 100

  return (
    <div className="flex flex-col bg-background/80 border-2 rounded-xl p-3 shadow-md backdrop-blur-md w-72 text-sm">
      <div className="flex justify-between items-center mb-2 font-medium text-foreground">
        <span>Year Filter</span>
        <span className="text-primary font-bold">
          {yearFilter[0]} - {yearFilter[1]}
        </span>
      </div>
      <div className="relative w-full h-6 flex items-center">
        {/* Track background */}
        <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-1 bg-muted rounded-full pointer-events-none" />
        
        {/* Selected range highlight */}
        <div
          className="absolute top-1/2 -translate-y-1/2 h-1 bg-primary rounded-full pointer-events-none"
          style={{
            left: `${minPercent}%`,
            right: `${100 - maxPercent}%`
          }}
        />

        {/* Input for minimum year */}
        <input
          type="range"
          min={minYear}
          max={maxYear}
          value={yearFilter[0]}
          onChange={handleMinChange}
          className="absolute w-full h-full appearance-none pointer-events-none bg-transparent focus:outline-none z-10
            [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:shadow
            [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-primary [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:border-none [&::-moz-range-thumb]:shadow"
        />

        {/* Input for maximum year */}
        <input
          type="range"
          min={minYear}
          max={maxYear}
          value={yearFilter[1]}
          onChange={handleMaxChange}
          className="absolute w-full h-full appearance-none pointer-events-none bg-transparent focus:outline-none z-20
            [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:shadow
            [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-primary [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:border-none [&::-moz-range-thumb]:shadow"
        />
      </div>
      <div className="flex justify-between text-xs text-muted-foreground mt-1 px-1">
        <span>{minYear}</span>
        <span>{maxYear}</span>
      </div>
    </div>
  )
}

export default YearRangeSlider
