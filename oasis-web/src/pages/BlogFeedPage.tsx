import { useState, useEffect, useCallback } from 'react'
import { PostCard } from '../ui'
import styles from './BlogFeedPage.module.css'

interface BlogPost {
  slug: string
  title: string
  excerpt: string
  published_at: string
  reading_time: number
}

export default function BlogFeedPage() {
  const [posts, setPosts] = useState<BlogPost[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const limit = 10

  const fetchPosts = useCallback(async (pageNum: number, append = false) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/journal/public?page=${pageNum}&limit=${limit}`)
      if (!res.ok) throw new Error('Failed to fetch posts')
      const data = await res.json()
      setPosts(prev => append ? [...prev, ...data.posts] : data.posts)
      setTotal(data.total)
    } catch {
      // Silently handle — empty state shown
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchPosts(1)
  }, [fetchPosts])

  const handleLoadMore = () => {
    const nextPage = page + 1
    setPage(nextPage)
    fetchPosts(nextPage, true)
  }

  const hasMore = posts.length < total

  return (
    <div className={styles.feed}>
      <h1 className={styles.heading}>Blog</h1>

      {!loading && posts.length === 0 && (
        <p className={styles.empty}>No posts yet.</p>
      )}

      {posts.map(post => (
        <PostCard key={post.slug} {...post} />
      ))}

      {loading && <p className={styles.loading}>Loading...</p>}

      {hasMore && !loading && (
        <button className={styles.loadMore} onClick={handleLoadMore}>
          Load more
        </button>
      )}
    </div>
  )
}
