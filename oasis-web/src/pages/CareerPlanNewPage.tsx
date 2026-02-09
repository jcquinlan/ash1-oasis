import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CareerPlanForm } from '../ui'
import { useCareerPlans } from '../hooks/useCareerPlans'

export default function CareerPlanNewPage() {
  const navigate = useNavigate()
  const plans = useCareerPlans()
  const [saving, setSaving] = useState(false)

  const handleSave = async (data: {
    title: string
    current_role: string
    target_role: string
    timeframe: string
    context: string
    summary: string
    goals: Array<{
      title: string
      description?: string
      rationale?: string
      phase?: string
      evidence_criteria?: string
    }>
  }) => {
    setSaving(true)
    const result = await plans.createPlan(data)
    setSaving(false)
    if (result) {
      navigate(`/career/${result.plan.id}`)
    }
  }

  return (
    <CareerPlanForm
      onSave={handleSave}
      onCancel={() => navigate('/career')}
      onGenerate={plans.generatePlan}
      saving={saving}
    />
  )
}
