import { describe, test, expect } from 'bun:test'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerAllTools } from './tools'

describe('MCP tools registration', () => {
  test('all 12 tools are registered', () => {
    const server = new McpServer({ name: 'test', version: '0.0.0' })
    registerAllTools(server)

    const tools = (server as any)._registeredTools as Record<string, unknown>
    expect(Object.keys(tools).length).toBe(13)
  })

  test('expected tool names are registered', () => {
    const server = new McpServer({ name: 'test', version: '0.0.0' })
    registerAllTools(server)

    const tools = (server as any)._registeredTools as Record<string, unknown>
    const names = Object.keys(tools).sort()

    expect(names).toEqual([
      'container_list',
      'journal_create',
      'journal_delete',
      'journal_get',
      'journal_list',
      'journal_update',
      'project_create',
      'project_delete',
      'project_get',
      'project_list',
      'project_update',
      'step_update',
      'system_status',
    ])
  })

  test('write tools have [WRITE] prefix in description', () => {
    const server = new McpServer({ name: 'test', version: '0.0.0' })
    registerAllTools(server)

    const tools = (server as any)._registeredTools as Record<string, any>
    const writeTools = [
      'journal_create', 'journal_update', 'journal_delete',
      'project_create', 'project_update', 'project_delete', 'step_update',
    ]

    for (const name of writeTools) {
      expect(tools[name].description).toMatch(/^\[WRITE\]/)
    }
  })

  test('read tools do NOT have [WRITE] prefix', () => {
    const server = new McpServer({ name: 'test', version: '0.0.0' })
    registerAllTools(server)

    const tools = (server as any)._registeredTools as Record<string, any>
    const readTools = ['system_status', 'container_list', 'journal_list', 'journal_get', 'project_list', 'project_get']

    for (const name of readTools) {
      expect(tools[name].description).not.toMatch(/^\[WRITE\]/)
    }
  })
})
