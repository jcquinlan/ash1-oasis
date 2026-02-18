import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { api } from '../api-client'
import { log } from '../logger'

const StepInputSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  children: z.array(z.lazy((): z.ZodTypeAny => StepInputSchema)).optional(),
})

export function registerProjectTools(server: McpServer) {
  server.tool(
    'project_list',
    'List projects with progress counts (total/completed steps)',
    {
      status: z.enum(['active', 'paused', 'completed', 'archived']).optional().describe('Filter by project status'),
    },
    async ({ status }) => {
      log('tool_invocation', { tool: 'project_list', status })
      const query = status ? `?status=${status}` : ''
      const data = await api.get(`/api/projects${query}`)
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
    }
  )

  server.tool(
    'project_get',
    'Get a project with all its steps',
    {
      id: z.number().int().positive().describe('Project ID'),
    },
    async ({ id }) => {
      log('tool_invocation', { tool: 'project_get', id })
      const data = await api.get(`/api/projects/${id}`)
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
    }
  )

  server.tool(
    'project_create',
    '[WRITE] Create a new project with optional steps (supports nested sub-steps)',
    {
      title: z.string().describe('Project title'),
      description: z.string().optional().describe('Project description'),
      steps: z.array(StepInputSchema).optional().describe('Initial steps with optional nested children'),
    },
    async (params) => {
      log('tool_invocation', { tool: 'project_create', title: params.title })
      const data = await api.post('/api/projects', params)
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
    }
  )

  server.tool(
    'project_update',
    '[WRITE] Update a project title, description, or status',
    {
      id: z.number().int().positive().describe('Project ID'),
      title: z.string().optional().describe('Updated title'),
      description: z.string().optional().describe('Updated description'),
      status: z.enum(['active', 'paused', 'completed', 'archived']).optional().describe('Updated status'),
    },
    async ({ id, ...body }) => {
      log('tool_invocation', { tool: 'project_update', id })
      const data = await api.put(`/api/projects/${id}`, body)
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
    }
  )

  server.tool(
    'project_delete',
    '[WRITE] Soft-delete a project and all its steps',
    {
      id: z.number().int().positive().describe('Project ID to delete'),
    },
    async ({ id }) => {
      log('tool_invocation', { tool: 'project_delete', id })
      const data = await api.delete(`/api/projects/${id}`)
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
    }
  )

  server.tool(
    'step_update',
    '[WRITE] Update a step within a project (status, title, description)',
    {
      project_id: z.number().int().positive().describe('Project ID'),
      step_id: z.number().int().positive().describe('Step ID'),
      title: z.string().optional().describe('Updated title'),
      description: z.string().optional().describe('Updated description'),
      status: z.enum(['pending', 'in_progress', 'completed', 'skipped']).optional().describe('Updated status'),
    },
    async ({ project_id, step_id, ...body }) => {
      log('tool_invocation', { tool: 'step_update', project_id, step_id })
      const data = await api.put(`/api/projects/${project_id}/steps/${step_id}`, body)
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
    }
  )
}
