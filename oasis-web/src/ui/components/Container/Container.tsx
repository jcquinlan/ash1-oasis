import { forwardRef, type ReactNode, type HTMLAttributes } from 'react'
import styles from './Container.module.css'

export interface ContainerItemProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
}

export const ContainerItem = forwardRef<HTMLDivElement, ContainerItemProps>(
  ({ children, className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={`${styles.containerItem} ${className || ''}`}
        {...props}
      >
        {children}
      </div>
    )
  }
)

ContainerItem.displayName = 'ContainerItem'
