import { useState, useCallback } from 'react'

export interface JournalEntry {
  id: number
  title: string
  content: string
  is_public: boolean
  slug?: string | null
  excerpt?: string | null
  published_at?: string | null
  created_at: string
  updated_at: string
}

interface JournalState {
  entries: JournalEntry[]
  total: number
  loading: boolean
  error: string | null
}

export function useJournal() {
  const [state, setState] = useState<JournalState>({
    entries: [],
    total: 0,
    loading: false,
    error: null
  })

  const fetchEntries = useCallback(async (page = 1, limit = 20) => {
    setState(prev => ({ ...prev, loading: true, error: null }))
    try {
      const res = await fetch(`/api/journal?page=${page}&limit=${limit}`)
      if (!res.ok) throw new Error('Failed to fetch entries')
      const data = await res.json()
      setState({
        entries: data.entries,
        total: data.total,
        loading: false,
        error: null
      })
    } catch (err) {
      setState(prev => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : 'Unknown error'
      }))
    }
  }, [])

  const getEntry = useCallback(async (id: number): Promise<JournalEntry | null> => {
    try {
      const res = await fetch(`/api/journal/${id}`)
      if (!res.ok) return null
      const data = await res.json()
      return data.entry
    } catch {
      return null
    }
  }, [])

  const createEntry = useCallback(async (data: { title: string; content: string; is_public?: boolean; slug?: string; excerpt?: string }): Promise<JournalEntry | null> => {
    try {
      const res = await fetch('/api/journal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      })
      if (!res.ok) throw new Error('Failed to create entry')
      const result = await res.json()
      return result.entry
    } catch {
      return null
    }
  }, [])

  const updateEntry = useCallback(async (id: number, data: { title: string; content: string; is_public?: boolean; slug?: string; excerpt?: string }): Promise<JournalEntry | null> => {
    try {
      const res = await fetch(`/api/journal/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      })
      if (!res.ok) throw new Error('Failed to update entry')
      const result = await res.json()
      return result.entry
    } catch {
      return null
    }
  }, [])

  const deleteEntry = useCallback(async (id: number): Promise<boolean> => {
    try {
      const res = await fetch(`/api/journal/${id}`, {
        method: 'DELETE'
      })
      return res.ok
    } catch {
      return false
    }
  }, [])

  return {
    ...state,
    fetchEntries,
    getEntry,
    createEntry,
    updateEntry,
    deleteEntry
  }
}
