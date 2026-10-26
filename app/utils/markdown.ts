import { marked } from 'marked'
import DOMPurify from 'isomorphic-dompurify'

export function renderMarkdown(source: string | null | undefined) {
  const withoutActiveHtml = (source || '')
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/\son\w+\s*=\s*(['"]).*?\1/gi, '')
    .replace(/\son\w+\s*=\s*[^\s>]+/gi, '')
  const html = marked.parse(withoutActiveHtml, { async: false }) as string
  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } })
}
