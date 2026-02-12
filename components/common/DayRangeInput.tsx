'use client'

import styles from './DayRangeInput.module.css'

interface DayRangeInputProps {
  startValue: string
  endValue: string
  onStartChange: (value: string) => void
  onEndChange: (value: string) => void
  onStartStep: (delta: number) => void
  onEndStep: (delta: number) => void
  min?: number
}

export default function DayRangeInput({
  startValue,
  endValue,
  onStartChange,
  onEndChange,
  onStartStep,
  onEndStep,
  min = 1,
}: DayRangeInputProps) {
  return (
    <div className={styles.rangeRow}>
      <div className={styles.dayInputGroup}>
        <input
          type="number"
          min={min}
          value={startValue}
          onChange={(e) => onStartChange(e.target.value)}
          className={styles.dayInput}
        />
        <div className={styles.dayStepper}>
          <button className={styles.stepBtn} onClick={() => onStartStep(1)} title="起始 +1">+</button>
          <button className={styles.stepBtn} onClick={() => onStartStep(-1)} title="起始 -1">-</button>
        </div>
      </div>

      <span className={styles.rangeDash}>~</span>

      <div className={styles.dayInputGroup}>
        <input
          type="number"
          min={min}
          value={endValue}
          onChange={(e) => onEndChange(e.target.value)}
          className={styles.dayInput}
        />
        <div className={styles.dayStepper}>
          <button className={styles.stepBtn} onClick={() => onEndStep(1)} title="结束 +1">+</button>
          <button className={styles.stepBtn} onClick={() => onEndStep(-1)} title="结束 -1">-</button>
        </div>
      </div>
    </div>
  )
}
