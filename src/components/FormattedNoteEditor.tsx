import { useLayoutEffect, useRef } from 'react'
import { autosizeEditable, htmlToMarkers, markersToHtml } from '../lib/noteFormat'

type FormattedNoteEditorProps = {
  value: string
  onChange: (value: string) => void
  className?: string
  editorRef?: React.RefObject<HTMLDivElement | null>
}

export function FormattedNoteEditor({
  value,
  onChange,
  className,
  editorRef,
}: FormattedNoteEditorProps) {
  const internalRef = useRef<HTMLDivElement>(null)
  const ref = editorRef ?? internalRef
  const lastEmittedValue = useRef<string | null>(null)
  const isComposing = useRef(false)

  useLayoutEffect(() => {
    const editor = ref.current

    if (!editor) {
      return
    }

    if (value === lastEmittedValue.current) {
      return
    }

    if (htmlToMarkers(editor) === value) {
      lastEmittedValue.current = value
      autosizeEditable(editor)
      return
    }

    editor.innerHTML = markersToHtml(value) || '<br>'
    lastEmittedValue.current = value
    autosizeEditable(editor)
  }, [ref, value])

  function emitChange() {
    const editor = ref.current

    if (!editor || isComposing.current) {
      return
    }

    const nextValue = htmlToMarkers(editor)
    lastEmittedValue.current = nextValue
    onChange(nextValue)
    autosizeEditable(editor)
  }

  function handlePaste(event: React.ClipboardEvent<HTMLDivElement>) {
    event.preventDefault()
    const text = event.clipboardData.getData('text/plain')
    document.execCommand('insertText', false, text)
  }

  return (
    <div
      ref={ref}
      className={className}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-multiline="true"
      onInput={emitChange}
      onPaste={handlePaste}
      onCompositionStart={() => {
        isComposing.current = true
      }}
      onCompositionEnd={() => {
        isComposing.current = false
        emitChange()
      }}
    />
  )
}
