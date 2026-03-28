import sanitizeHtml from 'sanitize-html';

const ALLOWED_TAGS = [
  'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'blockquote', 'strong', 'em', 'a', 'hr', 'br', 'sub', 'sup',
  'pre', 'code', 'span', 'div',
];

export function sanitizeContent(html: string | null): string {
  if (!html) return '';
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: { 'a': ['href', 'target', 'rel'] },
    allowedSchemes: ['http', 'https'],
  });
}
