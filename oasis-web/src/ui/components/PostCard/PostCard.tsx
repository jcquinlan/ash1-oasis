import { useNavigate } from 'react-router-dom'
import styles from './PostCard.module.css'

export interface PostCardProps {
  slug: string
  title: string
  excerpt: string
  published_at: string
  reading_time: number
}

export function PostCard({ slug, title, excerpt, published_at, reading_time }: PostCardProps) {
  const navigate = useNavigate()

  const formattedDate = new Date(published_at).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  return (
    <article className={styles.card} onClick={() => navigate(`/blog/${slug}`)}>
      <h2 className={styles.title}>{title}</h2>
      <p className={styles.excerpt}>{excerpt}</p>
      <div className={styles.meta}>
        <time dateTime={published_at}>{formattedDate}</time>
        <span className={styles.dot}>&middot;</span>
        <span>{reading_time} min read</span>
      </div>
    </article>
  )
}
