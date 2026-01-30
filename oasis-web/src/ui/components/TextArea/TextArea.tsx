import { forwardRef, type TextareaHTMLAttributes } from 'react'
import styles from './TextArea.module.css'

export interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
}

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(
  ({ label, className, id, ...props }, ref) => {
    const textareaId = id || label?.toLowerCase().replace(/\s+/g, '-')

    return (
      <div className={styles.wrapper}>
        {label && (
          <label htmlFor={textareaId} className={styles.label}>
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          className={`${styles.textarea} ${className || ''}`}
          {...props}
        />
      </div>
    )
  }
)

TextArea.displayName = 'TextArea'
