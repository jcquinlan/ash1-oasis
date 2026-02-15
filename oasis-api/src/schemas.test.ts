import { describe, expect, test } from 'bun:test'
import {
  CreateJournalSchema,
  UpdateJournalSchema,
  CreateProjectSchema,
  UpdateProjectSchema,
  StepInputSchema,
  AddStepsSchema,
  UpdateStepSchema,
  ReorderStepsSchema,
  GenerateStepsSchema,
  parseBody,
} from './schemas'

// ─── CreateJournalSchema ─────────────────────────────────────────────────────

describe('CreateJournalSchema', () => {
  test('accepts valid input', () => {
    const result = CreateJournalSchema.safeParse({
      title: 'Hello',
      content: 'World',
    })
    expect(result.success).toBe(true)
  })

  test('accepts input with is_public', () => {
    const result = CreateJournalSchema.safeParse({
      title: 'Hello',
      content: 'World',
      is_public: true,
    })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.is_public).toBe(true)
  })

  test('defaults is_public to false', () => {
    const result = CreateJournalSchema.safeParse({
      title: 'Hello',
      content: 'World',
    })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.is_public).toBe(false)
  })

  test('rejects missing title', () => {
    const result = CreateJournalSchema.safeParse({ content: 'World' })
    expect(result.success).toBe(false)
  })

  test('rejects missing content', () => {
    const result = CreateJournalSchema.safeParse({ title: 'Hello' })
    expect(result.success).toBe(false)
  })

  test('rejects empty title', () => {
    const result = CreateJournalSchema.safeParse({ title: '', content: 'World' })
    expect(result.success).toBe(false)
  })

  test('rejects title over 255 chars', () => {
    const result = CreateJournalSchema.safeParse({
      title: 'a'.repeat(256),
      content: 'World',
    })
    expect(result.success).toBe(false)
  })

  test('rejects wrong type for is_public', () => {
    const result = CreateJournalSchema.safeParse({
      title: 'Hello',
      content: 'World',
      is_public: 'yes',
    })
    expect(result.success).toBe(false)
  })
})

// ─── UpdateJournalSchema ─────────────────────────────────────────────────────

describe('UpdateJournalSchema', () => {
  test('accepts valid input', () => {
    const result = UpdateJournalSchema.safeParse({
      title: 'Updated',
      content: 'New content',
    })
    expect(result.success).toBe(true)
  })

  test('accepts with is_public', () => {
    const result = UpdateJournalSchema.safeParse({
      title: 'Updated',
      content: 'New content',
      is_public: true,
    })
    expect(result.success).toBe(true)
  })

  test('rejects missing title', () => {
    const result = UpdateJournalSchema.safeParse({ content: 'New content' })
    expect(result.success).toBe(false)
  })

  test('rejects missing content', () => {
    const result = UpdateJournalSchema.safeParse({ title: 'Updated' })
    expect(result.success).toBe(false)
  })
})

// ─── CreateProjectSchema ─────────────────────────────────────────────────────

describe('CreateProjectSchema', () => {
  test('accepts minimal input', () => {
    const result = CreateProjectSchema.safeParse({ title: 'My Project' })
    expect(result.success).toBe(true)
  })

  test('accepts full input with steps', () => {
    const result = CreateProjectSchema.safeParse({
      title: 'My Project',
      description: 'A desc',
      meta: { key: 'val' },
      steps: [
        {
          title: 'Step 1',
          children: [{ title: 'Sub-step', children: [] }],
        },
      ],
    })
    expect(result.success).toBe(true)
  })

  test('rejects missing title', () => {
    const result = CreateProjectSchema.safeParse({ description: 'No title' })
    expect(result.success).toBe(false)
  })

  test('rejects empty title', () => {
    const result = CreateProjectSchema.safeParse({ title: '' })
    expect(result.success).toBe(false)
  })

  test('rejects title over 255 chars', () => {
    const result = CreateProjectSchema.safeParse({ title: 'a'.repeat(256) })
    expect(result.success).toBe(false)
  })
})

// ─── UpdateProjectSchema ─────────────────────────────────────────────────────

describe('UpdateProjectSchema', () => {
  test('accepts partial update with title', () => {
    const result = UpdateProjectSchema.safeParse({ title: 'New Title' })
    expect(result.success).toBe(true)
  })

  test('accepts partial update with status', () => {
    const result = UpdateProjectSchema.safeParse({ status: 'completed' })
    expect(result.success).toBe(true)
  })

  test('rejects empty object', () => {
    const result = UpdateProjectSchema.safeParse({})
    expect(result.success).toBe(false)
  })

  test('rejects invalid status', () => {
    const result = UpdateProjectSchema.safeParse({ status: 'invalid' })
    expect(result.success).toBe(false)
  })

  test('accepts all valid statuses', () => {
    for (const status of ['active', 'paused', 'completed', 'archived']) {
      const result = UpdateProjectSchema.safeParse({ status })
      expect(result.success).toBe(true)
    }
  })
})

// ─── StepInputSchema ─────────────────────────────────────────────────────────

describe('StepInputSchema', () => {
  test('accepts minimal step', () => {
    const result = StepInputSchema.safeParse({ title: 'Do thing' })
    expect(result.success).toBe(true)
  })

  test('accepts step with nested children', () => {
    const result = StepInputSchema.safeParse({
      title: 'Parent',
      children: [
        {
          title: 'Child',
          children: [{ title: 'Grandchild' }],
        },
      ],
    })
    expect(result.success).toBe(true)
  })

  test('rejects missing title', () => {
    const result = StepInputSchema.safeParse({ description: 'No title' })
    expect(result.success).toBe(false)
  })

  test('rejects empty title', () => {
    const result = StepInputSchema.safeParse({ title: '' })
    expect(result.success).toBe(false)
  })
})

// ─── AddStepsSchema ──────────────────────────────────────────────────────────

describe('AddStepsSchema', () => {
  test('accepts single step', () => {
    const result = AddStepsSchema.safeParse({ title: 'One step' })
    expect(result.success).toBe(true)
  })

  test('accepts array of steps', () => {
    const result = AddStepsSchema.safeParse([
      { title: 'Step 1' },
      { title: 'Step 2' },
    ])
    expect(result.success).toBe(true)
  })

  test('rejects empty object', () => {
    const result = AddStepsSchema.safeParse({})
    expect(result.success).toBe(false)
  })
})

// ─── UpdateStepSchema ────────────────────────────────────────────────────────

describe('UpdateStepSchema', () => {
  test('accepts partial update', () => {
    const result = UpdateStepSchema.safeParse({ title: 'New title' })
    expect(result.success).toBe(true)
  })

  test('accepts status update', () => {
    const result = UpdateStepSchema.safeParse({ status: 'completed' })
    expect(result.success).toBe(true)
  })

  test('accepts null parent_id', () => {
    const result = UpdateStepSchema.safeParse({ parent_id: null })
    expect(result.success).toBe(true)
  })

  test('rejects invalid status', () => {
    const result = UpdateStepSchema.safeParse({ status: 'invalid' })
    expect(result.success).toBe(false)
  })

  test('accepts all valid step statuses', () => {
    for (const status of ['pending', 'active', 'completed', 'skipped']) {
      const result = UpdateStepSchema.safeParse({ status })
      expect(result.success).toBe(true)
    }
  })
})

// ─── ReorderStepsSchema ──────────────────────────────────────────────────────

describe('ReorderStepsSchema', () => {
  test('accepts valid reorder array', () => {
    const result = ReorderStepsSchema.safeParse([
      { id: 1, sort_order: 10 },
      { id: 2, sort_order: 20 },
    ])
    expect(result.success).toBe(true)
  })

  test('rejects missing id', () => {
    const result = ReorderStepsSchema.safeParse([{ sort_order: 10 }])
    expect(result.success).toBe(false)
  })

  test('rejects missing sort_order', () => {
    const result = ReorderStepsSchema.safeParse([{ id: 1 }])
    expect(result.success).toBe(false)
  })

  test('rejects non-integer id', () => {
    const result = ReorderStepsSchema.safeParse([{ id: 1.5, sort_order: 10 }])
    expect(result.success).toBe(false)
  })
})

// ─── GenerateStepsSchema ─────────────────────────────────────────────────────

describe('GenerateStepsSchema', () => {
  test('accepts title only', () => {
    const result = GenerateStepsSchema.safeParse({ title: 'Learn Rust' })
    expect(result.success).toBe(true)
  })

  test('accepts title with description', () => {
    const result = GenerateStepsSchema.safeParse({
      title: 'Learn Rust',
      description: 'Focus on systems programming',
    })
    expect(result.success).toBe(true)
  })

  test('rejects missing title', () => {
    const result = GenerateStepsSchema.safeParse({
      description: 'No title here',
    })
    expect(result.success).toBe(false)
  })

  test('rejects empty title', () => {
    const result = GenerateStepsSchema.safeParse({ title: '' })
    expect(result.success).toBe(false)
  })
})

// ─── parseBody helper ────────────────────────────────────────────────────────

describe('parseBody', () => {
  test('returns success with parsed data on valid input', () => {
    const result = parseBody(CreateJournalSchema, {
      title: 'Test',
      content: 'Body',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.title).toBe('Test')
      expect(result.data.is_public).toBe(false)
    }
  })

  test('returns error string on invalid input', () => {
    const result = parseBody(CreateJournalSchema, { title: '' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(typeof result.error).toBe('string')
      expect(result.error.length).toBeGreaterThan(0)
    }
  })
})
