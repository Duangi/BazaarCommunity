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
  className?: string
}

export default function DayRangeInput({
  startValue,
  endValue,
  onStartChange,
  onEndChange,
  onStartStep,
  onEndStep,
  min = 1,
  className = '',
}: DayRangeInputProps) {
  const sanitize = (value: string) => value.replace(/[^\d]/g, '')
  return (
    <div className={`${styles.rangeRow} ${className}`.trim()}>
      <div className={styles.dayInputGroup}>
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={startValue}
          onChange={(e) => onStartChange(sanitize(e.target.value))}
          className={styles.dayInput}
        />
        <div className={styles.dayStepper}>
          <button type="button" className={styles.stepBtn} onClick={() => onStartStep(1)} title="起始 +1">+</button>
          <button type="button" className={styles.stepBtn} onClick={() => onStartStep(-1)} title="起始 -1">-</button>
        </div>
      </div>

      <span className={styles.rangeDash}>~</span>

      <div className={styles.dayInputGroup}>
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={endValue}
          onChange={(e) => onEndChange(sanitize(e.target.value))}
          className={styles.dayInput}
        />
        <div className={styles.dayStepper}>
          <button type="button" className={styles.stepBtn} onClick={() => onEndStep(1)} title="结束 +1">+</button>
          <button type="button" className={styles.stepBtn} onClick={() => onEndStep(-1)} title="结束 -1">-</button>
        </div>
      </div>
    </div>
  )
}
