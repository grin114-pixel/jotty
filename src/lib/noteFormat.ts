import { createElement, type ReactNode } from 'react'

export const RED_OPEN = '[[red]]'
export const RED_CLOSE = '[[/red]]'

function createRedPattern() {
  return /\[\[red\]\]([\s\S]*?)\[\[\/red\]\]/g
}

function escapeHtml(text: string) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function normalizeMarkerContent(content: string) {
  let normalized = content
  let previous = ''

  while (previous !== normalized) {
    previous = normalized
    normalized = normalized.replace(
      /\[\[red\]\]\[\[red\]\]([\s\S]*?)\[\[\/red\]\]\[\[\/red\]\]/g,
      `${RED_OPEN}$1${RED_CLOSE}`,
    )
  }

  return normalized
}

export function markersToHtml(content: string) {
  const source = normalizeMarkerContent(content)
  const parts: string[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null
  const pattern = createRedPattern()

  while ((match = pattern.exec(source)) !== null) {
    if (match.index > lastIndex) {
      parts.push(escapeHtml(source.slice(lastIndex, match.index)))
    }

    parts.push(`<span class="note-text-red">${escapeHtml(match[1])}</span>`)
    lastIndex = pattern.lastIndex
  }

  if (lastIndex < source.length) {
    parts.push(escapeHtml(source.slice(lastIndex)))
  }

  return parts.join('')
}

function serializeNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent ?? ''
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return ''
  }

  const element = node as HTMLElement

  if (element.tagName === 'BR') {
    return '\n'
  }

  if (element.classList.contains('note-text-red')) {
    const inner = Array.from(element.childNodes).map(serializeNode).join('')
    return `${RED_OPEN}${inner}${RED_CLOSE}`
  }

  if (element.tagName === 'DIV' || element.tagName === 'P') {
    return Array.from(element.childNodes).map(serializeNode).join('')
  }

  return Array.from(element.childNodes).map(serializeNode).join('')
}

export function htmlToMarkers(root: HTMLElement) {
  if (root.innerHTML === '<br>' || root.textContent === '') {
    return ''
  }

  const childNodes = Array.from(root.childNodes)
  const chunks: string[] = []

  childNodes.forEach((node, index) => {
    if (index > 0) {
      const isBlock =
        node.nodeType === Node.ELEMENT_NODE &&
        ['DIV', 'P'].includes((node as HTMLElement).tagName)
      const previous = childNodes[index - 1]
      const previousIsBlock =
        previous.nodeType === Node.ELEMENT_NODE &&
        ['DIV', 'P'].includes((previous as HTMLElement).tagName)

      if (isBlock || previousIsBlock) {
        chunks.push('\n')
      }
    }

    chunks.push(serializeNode(node))
  })

  return chunks.join('')
}

function findAncestorRedSpan(node: Node, editor: HTMLElement) {
  let current: Node | null = node

  while (current && current !== editor) {
    if (
      current.nodeType === Node.ELEMENT_NODE &&
      (current as HTMLElement).classList.contains('note-text-red')
    ) {
      return current as HTMLElement
    }

    current = current.parentNode
  }

  return null
}

function unwrapRedSpan(span: HTMLElement) {
  const parent = span.parentNode

  if (!parent) {
    return
  }

  while (span.firstChild) {
    parent.insertBefore(span.firstChild, span)
  }

  parent.removeChild(span)
}

function unwrapFragmentRedSpans(fragment: DocumentFragment) {
  const container = document.createElement('div')
  container.appendChild(fragment)

  container.querySelectorAll('.note-text-red').forEach((node) => {
    unwrapRedSpan(node as HTMLElement)
  })

  const plain = document.createDocumentFragment()

  while (container.firstChild) {
    plain.appendChild(container.firstChild)
  }

  return plain
}

function cleanupEmptyRedSpans(editor: HTMLElement) {
  editor.querySelectorAll('.note-text-red').forEach((node) => {
    if (!(node.textContent ?? '').length) {
      node.remove()
    }
  })
}

function removeRedFormattingFromRange(range: Range, editor: HTMLElement) {
  const startSpan = findAncestorRedSpan(range.startContainer, editor)
  const endSpan = findAncestorRedSpan(range.endContainer, editor)

  if (
    startSpan &&
    startSpan === endSpan &&
    range.toString() === (startSpan.textContent ?? '')
  ) {
    unwrapRedSpan(startSpan)
    cleanupEmptyRedSpans(editor)
    return
  }

  const fragment = range.extractContents()
  range.insertNode(unwrapFragmentRedSpans(fragment))
  cleanupEmptyRedSpans(editor)
}

export function applyRedFormatToEditor(editor: HTMLElement) {
  const selection = window.getSelection()

  if (!selection || selection.rangeCount === 0) {
    return false
  }

  const range = selection.getRangeAt(0)

  if (range.collapsed || !editor.contains(range.commonAncestorContainer)) {
    return false
  }

  const startSpan = findAncestorRedSpan(range.startContainer, editor)
  const endSpan = findAncestorRedSpan(range.endContainer, editor)

  if (startSpan && endSpan) {
    removeRedFormattingFromRange(range, editor)
    selection.removeAllRanges()
    return true
  }

  const fragment = range.extractContents()
  const span = document.createElement('span')
  span.className = 'note-text-red'
  span.appendChild(fragment)
  range.insertNode(span)

  selection.removeAllRanges()
  const nextRange = document.createRange()
  nextRange.selectNodeContents(span)
  selection.addRange(nextRange)

  return true
}

export function autosizeEditable(element: HTMLElement | null) {
  if (!element) {
    return
  }

  element.style.height = 'auto'
  element.style.height = `${element.scrollHeight}px`
}

export function applyRedFormat(
  value: string,
  selectionStart: number,
  selectionEnd: number,
): { nextValue: string; nextSelectionStart: number; nextSelectionEnd: number } | null {
  if (selectionStart === selectionEnd) {
    return null
  }

  const selected = value.slice(selectionStart, selectionEnd)
  const before = value.slice(0, selectionStart)
  const after = value.slice(selectionEnd)

  if (before.endsWith(RED_OPEN) && after.startsWith(RED_CLOSE)) {
    const nextValue = before.slice(0, -RED_OPEN.length) + selected + after.slice(RED_CLOSE.length)

    return {
      nextValue,
      nextSelectionStart: selectionStart - RED_OPEN.length,
      nextSelectionEnd: selectionEnd - RED_OPEN.length,
    }
  }

  const nextValue = before + RED_OPEN + selected + RED_CLOSE + after

  return {
    nextValue,
    nextSelectionStart: selectionStart + RED_OPEN.length,
    nextSelectionEnd: selectionEnd + RED_OPEN.length,
  }
}

export function renderFormattedContent(content: string): ReactNode {
  const parts: ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null
  let key = 0
  const normalized = normalizeMarkerContent(content)
  const pattern = createRedPattern()

  while ((match = pattern.exec(normalized)) !== null) {
    if (match.index > lastIndex) {
      parts.push(normalized.slice(lastIndex, match.index))
    }

    parts.push(
      createElement('span', { key: key++, className: 'note-text-red' }, match[1]),
    )

    lastIndex = pattern.lastIndex
  }

  if (lastIndex < normalized.length) {
    parts.push(normalized.slice(lastIndex))
  }

  return parts.length > 0 ? parts : content
}
