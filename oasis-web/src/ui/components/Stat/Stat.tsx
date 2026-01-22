import { forwardRef, type ReactNode, type HTMLAttributes } from 'react'
import styles from './Stat.module.css'

export interface StatProps extends HTMLAttributes<HTMLDivElement> {
  label: string
  value: ReactNode
}

export const Stat = forwardRef<HTMLDivElement, StatProps>(
  ({ label, value, className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={`${styles.stat} ${className || ''}`}
        {...props}
      >
        <dt className={styles.label}>{label}</dt>
        <dd className={styles.value}>{value}</dd>
      </div>
    )
  }
)

Stat.displayName = 'Stat'
