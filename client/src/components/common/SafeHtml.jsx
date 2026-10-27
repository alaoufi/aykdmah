import { useMemo } from 'react';

const ALLOWED = new Set(['p', 'h2', 'h3', 'h4', 'strong', 'b', 'em', 'i', 'u', 'ul', 'ol', 'li', 'br']);
const BLOCKED = new Set(['script', 'style', 'iframe', 'object', 'embed', 'svg', 'math', 'template']);

function renderNode(node, key) {
  if (node.nodeType === 3) return node.textContent;
  if (node.nodeType !== 1) return null;
  const tag = node.tagName.toLowerCase();
  if (BLOCKED.has(tag)) return null;
  const children = Array.from(node.childNodes, (child, i) => renderNode(child, `${key}-${i}`));
  if (!ALLOWED.has(tag)) return children;
  if (tag === 'br') return <br key={key} />;
  const Tag = tag;
  return <Tag key={key}>{children}</Tag>;
}

// Policy copy may be edited by the administrator. Render formatting only;
// HTML attributes, event handlers and executable elements are never retained.
export default function SafeHtml({ html, className = '' }) {
  const content = useMemo(() => {
    const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
    return Array.from(doc.body.childNodes, (node, i) => renderNode(node, String(i)));
  }, [html]);
  return <div className={className}>{content}</div>;
}
