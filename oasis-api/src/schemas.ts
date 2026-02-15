import { z } from 'zod'

// ─── Journal Schemas ─────────────────────────────────────────────────────────

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export const CreateJournalSchema = z.object({
  title: z.string().min(1).max(255),
  content: z.string().min(1),
  is_public: z.boolean().optional().default(false),
  slug: z.string().max(255).regex(slugPattern, 'Slug must be lowercase alphanumeric with hyphens').optional(),
  excerpt: z.string().optional(),
})

export const UpdateJournalSchema = z.object({
  title: z.string().min(1).max(255),
  content: z.string().min(1),
  is_public: z.boolean().optional(),
  slug: z.string().max(255).regex(slugPattern, 'Slug must be lowercase alphanumeric with hyphens').optional().nullable(),
  excerpt: z.string().optional().nullable(),
})

// ─── Slug helper ────────────────────────────────────────────────────────────

export function slugify(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

// ─── Step Schemas ────────────────────────────────────────────────────────────

type StepInputType = {
  title: string
  description?: string
  meta?: Record<string, unknown>
  parent_id?: number
  children?: StepInputType[]
}

export const StepInputSchema: z.ZodType<StepInputType> = z.lazy(() =>
  z.object({
    title: z.string().min(1).max(255),
    description: z.string().optional(),
    meta: z.record(z.string(), z.unknown()).optional(),
    parent_id: z.number().int().optional(),
    children: z.array(StepInputSchema).optional(),
  })
)

// ─── Project Schemas ─────────────────────────────────────────────────────────

export const CreateProjectSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
  steps: z.array(StepInputSchema).optional(),
})

export const UpdateProjectSchema = z
  .object({
    title: z.string().min(1).max(255).optional(),
    description: z.string().optional(),
    status: z.enum(['active', 'paused', 'completed', 'archived']).optional(),
    meta: z.record(z.string(), z.unknown()).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  })

export const AddStepsSchema = z.union([
  StepInputSchema,
  z.array(StepInputSchema),
])

export const UpdateStepSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  status: z.enum(['pending', 'active', 'completed', 'skipped']).optional(),
  sort_order: z.number().int().optional(),
  parent_id: z.number().int().nullable().optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
})

export const ReorderStepsSchema = z.array(
  z.object({
    id: z.number().int(),
    sort_order: z.number().int(),
  })
)

export const GenerateStepsSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().optional(),
})

// ─── Parse helper ────────────────────────────────────────────────────────────

export function parseBody<T>(
  schema: z.ZodType<T>,
  body: unknown
): { success: true; data: T } | { success: false; error: string } {
  const result = schema.safeParse(body)
  if (result.success) {
    return { success: true, data: result.data }
  }

  const messages = result.error.issues.map(
    (issue) => `${issue.path.join('.')}: ${issue.message}`
  )
  return { success: false, error: messages.join('; ') }
}
