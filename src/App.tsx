import { type FormEvent, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import './App.css'
import { FormattedNoteEditor } from './components/FormattedNoteEditor'
import {
  applyRedFormat,
  applyRedFormatToEditor,
  normalizeMarkerContent,
  renderFormattedContent,
} from './lib/noteFormat'
import { type Database, getSupabaseClient, isSupabaseConfigured } from './lib/supabase'

type NoteRecord = Database['public']['Tables']['jotty_notes']['Row']

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }

  return '요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.'
}

function formatDateLabel(value: string) {
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(value))
}

function formatDayKey(value: string) {
  const date = new Date(value)
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

function formatDaySeparatorLabel(value: string) {
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  }).format(new Date(value))
}

function toDateInputValue(value: string) {
  const date = new Date(value)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function toUpdatedCreatedAt(dateInputValue: string, originalCreatedAt: string) {
  const [year, month, day] = dateInputValue.split('-').map(Number)
  const updated = new Date(originalCreatedAt)
  updated.setFullYear(year, month - 1, day)

  return updated.toISOString()
}

function sortNotes(notes: NoteRecord[]) {
  return [...notes].sort((left, right) => {
    return new Date(right.created_at).getTime() - new Date(left.created_at).getTime()
  })
}

function autosizeTextarea(element: HTMLTextAreaElement | null) {
  if (!element) {
    return
  }

  element.style.height = 'auto'
  element.style.height = `${element.scrollHeight}px`
}

function App() {
  const [memoInput, setMemoInput] = useState('')
  const [notes, setNotes] = useState<NoteRecord[]>([])
  const [isLoadingNotes, setIsLoadingNotes] = useState(false)
  const [isSavingNote, setIsSavingNote] = useState(false)
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')
  const [editDateDraft, setEditDateDraft] = useState('')
  const [isSavingEdit, setIsSavingEdit] = useState(false)
  const [dataError, setDataError] = useState('')
  const [statusMessage, setStatusMessage] = useState('')

  const memoTextareaRef = useRef<HTMLTextAreaElement>(null)
  const editEditorRef = useRef<HTMLDivElement>(null)

  const supabaseReady = isSupabaseConfigured()

  useEffect(() => {
    if (!statusMessage) {
      return undefined
    }

    const timeoutId = window.setTimeout(() => {
      setStatusMessage('')
    }, 2500)

    return () => window.clearTimeout(timeoutId)
  }, [statusMessage])

  useLayoutEffect(() => {
    autosizeTextarea(memoTextareaRef.current)
  }, [memoInput])

  const loadNotes = useCallback(async () => {
    if (!supabaseReady) {
      setDataError('Supabase 환경 변수가 설정되지 않았어요. `.env`를 먼저 채워 주세요.')
      setNotes([])
      return
    }

    setIsLoadingNotes(true)
    setDataError('')

    try {
      const supabase = getSupabaseClient()
      const { data, error } = await supabase
        .from('jotty_notes')
        .select('id, content, created_at')
        .order('created_at', { ascending: false })

      if (error) {
        throw error
      }

      setNotes(sortNotes((data ?? []) as NoteRecord[]))
    } catch (error) {
      setDataError(getErrorMessage(error))
      setNotes([])
    } finally {
      setIsLoadingNotes(false)
    }
  }, [supabaseReady])

  useEffect(() => {
    void loadNotes()
  }, [loadNotes])

  function startEdit(note: NoteRecord) {
    setEditingNoteId(note.id)
    setEditDraft(note.content)
    setEditDateDraft(toDateInputValue(note.created_at))
  }

  function cancelEdit() {
    setEditingNoteId(null)
    setEditDraft('')
    setEditDateDraft('')
  }

  async function handleSaveEdit(noteId: string) {
    if (!supabaseReady) {
      setDataError('Supabase 환경 변수가 설정되지 않아 메모를 수정할 수 없어요.')
      return
    }

    const content = normalizeMarkerContent(editDraft.trim())

    if (!content) {
      setStatusMessage('메모 내용을 입력해 주세요.')
      return
    }

    if (!editDateDraft) {
      setStatusMessage('날짜를 선택해 주세요.')
      return
    }

    const editingNote = notes.find((note) => note.id === noteId)

    if (!editingNote) {
      return
    }

    setIsSavingEdit(true)
    setDataError('')

    try {
      const supabase = getSupabaseClient()
      const { error } = await supabase
        .from('jotty_notes')
        .update({
          content,
          created_at: toUpdatedCreatedAt(editDateDraft, editingNote.created_at),
        })
        .eq('id', noteId)

      if (error) {
        throw error
      }

      setEditingNoteId(null)
      setEditDraft('')
      setEditDateDraft('')
      setStatusMessage('메모를 수정했어요.')
      await loadNotes()
    } catch (error) {
      setDataError(getErrorMessage(error))
    } finally {
      setIsSavingEdit(false)
    }
  }

  async function handleDeleteNote(note: NoteRecord) {
    if (!supabaseReady) {
      setDataError('Supabase 환경 변수가 설정되지 않아 메모를 삭제할 수 없어요.')
      return
    }

    const confirmed = window.confirm('이 메모를 삭제할까요?')

    if (!confirmed) {
      return
    }

    setDataError('')

    try {
      const supabase = getSupabaseClient()
      const { error } = await supabase.from('jotty_notes').delete().eq('id', note.id)

      if (error) {
        throw error
      }

      if (editingNoteId === note.id) {
        cancelEdit()
      }

      setStatusMessage('메모를 삭제했어요.')
      await loadNotes()
    } catch (error) {
      setDataError(getErrorMessage(error))
    }
  }

  async function handleSaveNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!supabaseReady) {
      setDataError('Supabase 환경 변수가 설정되지 않아 메모를 저장할 수 없어요.')
      return
    }

    const content = normalizeMarkerContent(memoInput.trim())

    if (!content) {
      setStatusMessage('메모 내용을 먼저 입력해 주세요.')
      return
    }

    setIsSavingNote(true)
    setDataError('')

    try {
      const supabase = getSupabaseClient()
      const { error } = await supabase.from('jotty_notes').insert({ content })

      if (error) {
        throw error
      }

      setMemoInput('')
      setStatusMessage('메모를 저장했어요.')
      await loadNotes()
    } catch (error) {
      setDataError(getErrorMessage(error))
    } finally {
      setIsSavingNote(false)
    }
  }

  function handleRedFormat(
    textarea: HTMLTextAreaElement | null,
    value: string,
    setValue: (nextValue: string) => void,
  ) {
    if (!textarea) {
      return
    }

    const result = applyRedFormat(value, textarea.selectionStart, textarea.selectionEnd)

    if (!result) {
      setStatusMessage('빨간색으로 바꿀 글자를 먼저 선택해 주세요.')
      return
    }

    setValue(result.nextValue)

    requestAnimationFrame(() => {
      textarea.focus()
      textarea.setSelectionRange(result.nextSelectionStart, result.nextSelectionEnd)
      autosizeTextarea(textarea)
    })
  }

  function handleEditRedFormat() {
    const editor = editEditorRef.current

    if (!editor || !applyRedFormatToEditor(editor)) {
      setStatusMessage('빨간색으로 바꿀 글자를 먼저 선택해 주세요.')
      return
    }

    editor.dispatchEvent(new InputEvent('input', { bubbles: true }))
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-title">
          <div className="app-icon">
            <img src="/app-icon-192.png" alt="" className="app-icon-image" />
          </div>
          <h1>Dear English</h1>
        </div>
      </header>

      {!supabaseReady ? (
        <section className="notice-card">
          <h2>Supabase 연결이 필요해요</h2>
          <p>`.env`에 URL과 Anon Key를 넣은 뒤 다시 실행해 주세요.</p>
          <p>테이블 설정은 `supabase-schema.sql` 파일에 정리해 두었습니다.</p>
        </section>
      ) : null}

      {dataError ? (
        <section className="notice-card error-card">
          <h2>처리 중 문제가 생겼어요</h2>
          <p>{dataError}</p>
        </section>
      ) : null}

      {statusMessage ? <div className="toast-message">{statusMessage}</div> : null}

      <main className="content-area">
        <section className="composer-card">
          <form className="memo-form" onSubmit={handleSaveNote}>
            <div className="memo-input-stack">
              <div className="memo-white-panel">
                <label className="field field-plain">
                  <span className="sr-only">메모</span>
                  <textarea
                    ref={memoTextareaRef}
                    className="field-textarea memo-textarea"
                    rows={1}
                    value={memoInput}
                    onChange={(event) => {
                      setMemoInput(event.target.value)
                      requestAnimationFrame(() => autosizeTextarea(memoTextareaRef.current))
                    }}
                  />
                </label>
                <div className="memo-format-toolbar">
                  <button
                    type="button"
                    className="format-button format-button--red"
                    aria-label="선택한 글자 빨간색"
                    onClick={() => handleRedFormat(memoTextareaRef.current, memoInput, setMemoInput)}
                  >
                    빨간색
                  </button>
                </div>
              </div>
            </div>
            <div className="memo-actions">
              <button type="submit" className="primary-button memo-save-button" disabled={isSavingNote}>
                {isSavingNote ? '저장 중...' : '메모 저장'}
              </button>
            </div>
          </form>
        </section>

        <section className="notes-section">
          {isLoadingNotes ? (
            <section className="empty-state">
              <p>메모 목록을 불러오는 중입니다...</p>
            </section>
          ) : null}

          {!isLoadingNotes && notes.length === 0 ? (
            <section className="empty-state">
              <div className="empty-illustration">
                <NoteIcon />
              </div>
              <h2>아직 저장된 메모가 없어요</h2>
              <p>위 입력창에 첫 번째 메모를 남겨보세요.</p>
            </section>
          ) : null}

          {!isLoadingNotes ? (
            <div className="note-list">
              {notes.map((note, index) => {
                const previousNote = index > 0 ? notes[index - 1] : null
                const showDaySeparator =
                  !previousNote || formatDayKey(previousNote.created_at) !== formatDayKey(note.created_at)

                return (
                <div key={note.id} className="note-outer">
                  {showDaySeparator ? (
                    <div className="day-separator" role="separator">
                      <span>{formatDaySeparatorLabel(note.created_at)}</span>
                    </div>
                  ) : null}
                  <div className="note-white-wrap">
                    <span className="note-index-badge" aria-hidden="true">
                      {notes.length - index}
                    </span>
                    <div className={`note-card note-body-surface${editingNoteId === note.id ? ' note-card--editing' : ''}`}>
                      {editingNoteId === note.id ? (
                        <>
                          <FormattedNoteEditor
                            editorRef={editEditorRef}
                            className="note-edit-editor"
                            value={editDraft}
                            onChange={setEditDraft}
                          />
                          <div className="note-format-toolbar">
                            <button
                              type="button"
                              className="format-button format-button--red"
                              aria-label="선택한 글자 빨간색"
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={handleEditRedFormat}
                            >
                              빨간색
                            </button>
                          </div>
                        </>
                      ) : (
                        <p className="note-content">{renderFormattedContent(note.content)}</p>
                      )}
                    </div>
                  </div>
                  <div className="note-meta-row">
                    {editingNoteId === note.id ? (
                      <label className="note-date-edit">
                        <span className="sr-only">메모 날짜</span>
                        <input
                          type="date"
                          className="note-date-input"
                          value={editDateDraft}
                          onChange={(event) => setEditDateDraft(event.target.value)}
                        />
                      </label>
                    ) : (
                      <span className="note-date">{formatDateLabel(note.created_at)}</span>
                    )}
                    <div className="note-card-actions">
                      {editingNoteId === note.id ? (
                        <>
                          <button
                            type="button"
                            className="note-icon-button"
                            aria-label="수정 저장"
                            disabled={isSavingEdit}
                            onClick={() => void handleSaveEdit(note.id)}
                          >
                            <CheckIcon />
                          </button>
                          <button
                            type="button"
                            className="note-icon-button"
                            aria-label="수정 취소"
                            disabled={isSavingEdit}
                            onClick={cancelEdit}
                          >
                            <CancelIcon />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="note-icon-button"
                            aria-label="메모 수정"
                            disabled={editingNoteId !== null}
                            onClick={() => startEdit(note)}
                          >
                            <EditIcon />
                          </button>
                          <button
                            type="button"
                            className="note-icon-button"
                            aria-label="메모 삭제"
                            disabled={editingNoteId !== null}
                            onClick={() => void handleDeleteNote(note)}
                          >
                            <DeleteIcon />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                )
              })}
            </div>
          ) : null}
        </section>
      </main>
    </div>
  )
}

function NoteIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M7.25 4.75h7.5l3.5 3.5v10a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2v-11.5a2 2 0 0 1 2-2Z"
        fill="currentColor"
        opacity="0.18"
      />
      <path
        d="M14.75 4.75v3.5h3.5M9 10.5h6M9 13.5h6M9 16.5h4.5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
      <path
        d="M7.25 4.75h7.5l3.5 3.5v10a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2v-11.5a2 2 0 0 1 2-2Z"
        fill="none"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
    </svg>
  )
}

function EditIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="m5 16.75 9.8-9.8a1.8 1.8 0 0 1 2.55 0l.7.7a1.8 1.8 0 0 1 0 2.55L8.25 20H5v-3.25Z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
    </svg>
  )
}

function DeleteIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M5.5 7.5h13M9.5 4.75h5l.75 2.75m-8 0 .55 9.2A2 2 0 0 0 9.8 18.6h4.4a2 2 0 0 0 1.99-1.9l.56-9.2"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="m5.5 12.5 4.8 4.7 8.2-8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function CancelIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="m7 7 10 10M17 7 7 17"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
    </svg>
  )
}

export default App
