import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CareerPlanList } from '../ui'
import type { CareerPlanSummary } from '../ui'
import { useCareerPlans } from '../hooks/useCareerPlans'
import styles from './CareerPage.module.css'

export default function CareerPage() {
  const plans = useCareerPlans()
  const navigate = useNavigate()

  useEffect(() => {
    plans.fetchPlans()
  }, [plans.fetchPlans])

  const handleSelect = (plan: CareerPlanSummary) => {
    navigate(`/career/${plan.id}`)
  }

  const handleNew = () => {
    navigate('/career/new')
  }

  return (
    <Card>
      <h2 className={styles.sectionTitle}>Career Plans</h2>
      <CareerPlanList
        plans={plans.plans}
        onSelect={handleSelect}
        onNew={handleNew}
      />
    </Card>
  )
}
