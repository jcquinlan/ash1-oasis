import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, Button, Input } from '../ui'
import styles from './OnboardingPage.module.css'

const REFERRAL_OPTIONS = [
  { value: 'google', label: 'Google Search' },
  { value: 'social_media', label: 'Social Media' },
  { value: 'friend_or_colleague', label: 'Friend or Colleague' },
  { value: 'blog_or_article', label: 'Blog or Article' },
  { value: 'github', label: 'GitHub' },
  { value: 'other', label: 'Other' },
] as const

type ReferralSource = typeof REFERRAL_OPTIONS[number]['value']

export default function OnboardingPage() {
  const navigate = useNavigate()
  const [selected, setSelected] = useState<ReferralSource | null>(null)
  const [details, setDetails] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = async () => {
    if (!selected) return

    setError(null)
    setSubmitting(true)

    try {
      const body: Record<string, string> = { source: selected }
      if (details.trim()) body.details = details.trim()

      const res = await fetch('/api/feedback/referral', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error || 'Failed to submit feedback')
      }

      setSubmitted(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div className={styles.container}>
        <Card>
          <div className={styles.success}>
            <h2 className={styles.successTitle}>Thanks for letting us know!</h2>
            <p className={styles.successMessage}>Your feedback helps us grow.</p>
            <Button variant="primary" onClick={() => navigate('/')}>
              Continue
            </Button>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      <Card>
        <h2 className={styles.title}>How did you hear about us?</h2>
        <p className={styles.subtitle}>We'd love to know what brought you here.</p>

        <div className={styles.options}>
          {REFERRAL_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`${styles.option} ${selected === opt.value ? styles.optionSelected : ''}`}
              onClick={() => setSelected(opt.value)}
            >
              <span className={`${styles.radio} ${selected === opt.value ? styles.radioSelected : ''}`} />
              {opt.label}
            </button>
          ))}
        </div>

        {selected === 'other' && (
          <div className={styles.detailsInput}>
            <Input
              label="Tell us more"
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="How did you find us?"
            />
          </div>
        )}

        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.actions}>
          <Button variant="secondary" onClick={() => navigate('/')}>
            Skip
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={!selected || submitting}
          >
            {submitting ? 'Submitting...' : 'Submit'}
          </Button>
        </div>
      </Card>
    </div>
  )
}
