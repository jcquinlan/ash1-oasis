import { forwardRef, type ReactNode, type HTMLAttributes } from 'react'
import styles from './Badge.module.css'

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  children: ReactNode
  variant?: 'default' | 'success' | 'error' | 'warning'
}

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ children, variant = 'default', className, ...props }, ref) => {
    return (
      <span
        ref={ref}
        className={`${styles.badge} ${styles[variant]} ${className || ''}`}
        {...props}
      >
        {children}
      </span>
    )
  }
)

Badge.displayName = 'Badge'
