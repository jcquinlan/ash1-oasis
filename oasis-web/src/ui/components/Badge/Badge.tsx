import { forwardRef, type ReactNode, type HTMLAttributes, type MouseEvent } from 'react'
import styles from './Badge.module.css'

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  children: ReactNode
  variant?: 'default' | 'success' | 'error' | 'warning'
  onClick?: (e: MouseEvent<HTMLSpanElement>) => void
}

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ children, variant = 'default', onClick, className, ...props }, ref) => {
    const clickable = !!onClick
    return (
      <span
        ref={ref}
        role={clickable ? 'button' : undefined}
        tabIndex={clickable ? 0 : undefined}
        className={`${styles.badge} ${styles[variant]} ${clickable ? styles.clickable : ''} ${className || ''}`}
        onClick={onClick}
        onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick?.(e as unknown as MouseEvent<HTMLSpanElement>) } } : undefined}
        {...props}
      >
        {children}
      </span>
    )
  }
)

Badge.displayName = 'Badge'
