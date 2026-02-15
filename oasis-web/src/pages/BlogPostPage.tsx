import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import styles from './BlogPostPage.module.css'

interface BlogPost {
  slug: string
  title: string
  content: string
  excerpt: string
  published_at: string
  reading_time: number
}

export default function BlogPostPage() {
  const { slug } = useParams<{ slug: string }>()
  const [post, setPost] = useState<BlogPost | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (!slug) return

    setLoading(true)
    setNotFound(false)

    fetch(`/api/journal/slug/${slug}`)
      .then(res => {
        if (!res.ok) {
          setNotFound(true)
          return null
        }
        return res.json()
      })
      .then(data => {
        if (data) setPost(data.post)
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false))
  }, [slug])

  if (loading) {
    return (
      <div className={styles.page}>
        <p className={styles.loading}>Loading...</p>
      </div>
    )
  }

  if (notFound || !post) {
    return (
      <div className={styles.page}>
        <p className={styles.notFound}>Post not found.</p>
        <Link to="/" className={styles.backLink}>&larr; Back to blog</Link>
      </div>
    )
  }

  const formattedDate = new Date(post.published_at).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  return (
    <article className={styles.page}>
      <Link to="/" className={styles.backLink}>&larr; Back to blog</Link>

      <header className={styles.header}>
        <h1 className={styles.title}>{post.title}</h1>
        <div className={styles.meta}>
          <time dateTime={post.published_at}>{formattedDate}</time>
          <span className={styles.dot}>&middot;</span>
          <span>{post.reading_time} min read</span>
        </div>
      </header>

      <div className={styles.content}>
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {post.content}
        </ReactMarkdown>
      </div>
    </article>
  )
}
