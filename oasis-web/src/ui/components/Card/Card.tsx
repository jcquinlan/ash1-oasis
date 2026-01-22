import { forwardRef, type ReactNode, type HTMLAttributes } from 'react'
import styles from './Card.module.css'

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ children, className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={`${styles.card} ${className || ''}`}
        {...props}
      >
        {children}
      </div>
    )
  }
)

Card.displayName = 'Card'
