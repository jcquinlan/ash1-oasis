import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { api } from '../api-client'
import { log } from '../logger'

export function registerJournalTools(server: McpServer) {
  server.tool(
    'journal_list',
    'List journal entries with pagination',
    {
      page: z.number().int().positive().default(1).describe('Page number (default: 1)'),
      limit: z.number().int().positive().max(50).default(20).describe('Entries per page (default: 20, max: 50)'),
    },
    async ({ page, limit }) => {
      log('tool_invocation', { tool: 'journal_list', page, limit })
      const data = await api.get(`/api/journal?page=${page}&limit=${limit}`)
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
    }
  )

  server.tool(
    'journal_get',
    'Get a single journal entry with full content',
    {
      id: z.number().int().positive().describe('Journal entry ID'),
    },
    async ({ id }) => {
      log('tool_invocation', { tool: 'journal_get', id })
      const data = await api.get(`/api/journal/${id}`)
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
    }
  )

  server.tool(
    'journal_create',
    '[WRITE] Create a new journal entry. Set is_public=true to publish as a blog post.',
    {
      title: z.string().describe('Entry title'),
      content: z.string().describe('Entry content (markdown supported)'),
      is_public: z.boolean().default(false).describe('Make publicly visible as a blog post'),
      slug: z.string().optional().describe('URL slug (auto-generated from title if public and not provided)'),
      excerpt: z.string().optional().describe('Short excerpt for blog listing'),
    },
    async (params) => {
      log('tool_invocation', { tool: 'journal_create', title: params.title })
      const data = await api.post('/api/journal', params)
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
    }
  )

  server.tool(
    'journal_update',
    '[WRITE] Update an existing journal entry',
    {
      id: z.number().int().positive().describe('Journal entry ID'),
      title: z.string().describe('Updated title'),
      content: z.string().describe('Updated content'),
      is_public: z.boolean().optional().describe('Update public visibility'),
      slug: z.string().optional().describe('Update URL slug'),
      excerpt: z.string().optional().describe('Update excerpt'),
    },
    async ({ id, ...body }) => {
      log('tool_invocation', { tool: 'journal_update', id })
      const data = await api.put(`/api/journal/${id}`, body)
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
    }
  )

  server.tool(
    'journal_delete',
    '[WRITE] Permanently delete a journal entry',
    {
      id: z.number().int().positive().describe('Journal entry ID to delete'),
    },
    async ({ id }) => {
      log('tool_invocation', { tool: 'journal_delete', id })
      const data = await api.delete(`/api/journal/${id}`)
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
    }
  )
}
