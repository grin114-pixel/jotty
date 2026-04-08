import {
  type ChangeEvent,
  type FormEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import './App.css'
import { type Database, getSupabaseClient, isSupabaseConfigured } from './lib/supabase'
import { hashPin } from './lib/pin'

type NoteRecord = Database['public']['Tables']['jotty_notes']['Row']

const AUTH_STORAGE_KEY = 'jotty.remembered-auth'
const PIN_HASH_STORAGE_KEY = 'jotty.pin-hash'
const DEFAULT_PIN = '1234'
const SETTINGS_ROW_ID = 'global'

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
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
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
  const [isCheckingRememberedAuth, setIsCheckingRememberedAuth] = useState(true)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [rememberDevice, setRememberDevice] = useState(false)
  const [pin, setPin] = useState('')
  const [authError, setAuthError] = useState('')
  const [isChangingPin, setIsChangingPin] = useState(false)
  const [currentPinInput, setCurrentPinInput] = useState('')
  const [newPinInput, setNewPinInput] = useState('')
  const [pinChangeError, setPinChangeError] = useState('')
  const [memoInput, setMemoInput] = useState('')
  const [notes, setNotes] = useState<NoteRecord[]>([])
  const [isLoadingNotes, setIsLoadingNotes] = useState(false)
  const [isSavingNote, setIsSavingNote] = useState(false)
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')
  const [isSavingEdit, setIsSavingEdit] = useState(false)
  const [dataError, setDataError] = useState('')
  const [statusMessage, setStatusMessage] = useState('')

  const memoTextareaRef = useRef<HTMLTextAreaElement>(null)
  const editTextareaRef = useRef<HTMLTextAreaElement>(null)

  const defaultPin = String(import.meta.env.VITE_APP_PIN ?? DEFAULT_PIN).trim()
  const supabaseReady = isSupabaseConfigured()

  const defaultPinHashPromise = useMemo(() => hashPin(defaultPin), [defaultPin])

  useEffect(() => {
    const rememberedAuth = window.localStorage.getItem(AUTH_STORAGE_KEY) === 'true'
    setRememberDevice(rememberedAuth)
    setIsAuthenticated(rememberedAuth)
    setIsCheckingRememberedAuth(false)
  }, [])

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
  }, [memoInput, isAuthenticated])

  useLayoutEffect(() => {
    if (editingNoteId) {
      autosizeTextarea(editTextareaRef.current)
    }
  }, [editDraft, editingNoteId])

  const ensureRemotePinHash = useCallback(async () => {
    const fallbackHash = await defaultPinHashPromise

    if (!supabaseReady) {
      return fallbackHash
    }

    const supabase = getSupabaseClient()
    const { data, error } = await supabase
      .from('jotty_app_settings')
      .select('pin_hash')
      .eq('id', SETTINGS_ROW_ID)
      .maybeSingle()

    if (error) {
      throw error
    }

    if (data?.pin_hash) {
      return data.pin_hash
    }

    const { error: upsertError } = await supabase.from('jotty_app_settings').upsert({
      id: SETTINGS_ROW_ID,
      pin_hash: fallbackHash,
    })

    if (upsertError) {
      throw upsertError
    }

    return fallbackHash
  }, [defaultPinHashPromise, supabaseReady])

  const resolveExpectedPinHash = useCallback(async () => {
    try {
      const remoteHash = await ensureRemotePinHash()
      window.localStorage.setItem(PIN_HASH_STORAGE_KEY, remoteHash)
      return remoteHash
    } catch {
      const saved = window.localStorage.getItem(PIN_HASH_STORAGE_KEY)
      if (saved) {
        return saved
      }

      return defaultPinHashPromise
    }
  }, [defaultPinHashPromise, ensureRemotePinHash])

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
    if (!isAuthenticated) {
      setNotes([])
      setDataError('')
      return
    }

    void loadNotes()
  }, [isAuthenticated, loadNotes])

  function handlePinDigits(setter: (value: string) => void, event: ChangeEvent<HTMLInputElement>) {
    setter(event.target.value.replace(/\D/g, '').slice(0, 4))
  }

  async function handlePinSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (pin.length !== 4) {
      setAuthError('PIN 4자리를 입력해 주세요.')
      return
    }

    try {
      const expectedHash = await resolveExpectedPinHash()
      const inputHash = await hashPin(pin)

      if (inputHash !== expectedHash) {
        setAuthError('PIN 번호가 일치하지 않습니다.')
        return
      }
    } catch {
      setAuthError('PIN 확인 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요.')
      return
    }

    if (rememberDevice) {
      window.localStorage.setItem(AUTH_STORAGE_KEY, 'true')
    } else {
      window.localStorage.removeItem(AUTH_STORAGE_KEY)
    }

    setAuthError('')
    setPin('')
    setIsAuthenticated(true)
  }

  async function handlePinChangeSave() {
    setPinChangeError('')

    if (currentPinInput.length !== 4) {
      setPinChangeError('현재 PIN 4자리를 입력해 주세요.')
      return
    }

    if (newPinInput.length !== 4) {
      setPinChangeError('새 PIN 4자리를 입력해 주세요.')
      return
    }

    try {
      const expectedHash = await resolveExpectedPinHash()
      const currentHash = await hashPin(currentPinInput)

      if (currentHash !== expectedHash) {
        setPinChangeError('현재 PIN 번호가 일치하지 않습니다.')
        return
      }

      const nextHash = await hashPin(newPinInput)

      if (supabaseReady) {
        const supabase = getSupabaseClient()
        const { error } = await supabase.from('jotty_app_settings').upsert({
          id: SETTINGS_ROW_ID,
          pin_hash: nextHash,
        })

        if (error) {
          throw error
        }
      }

      window.localStorage.setItem(PIN_HASH_STORAGE_KEY, nextHash)
      window.localStorage.removeItem(AUTH_STORAGE_KEY)
      setRememberDevice(false)
      setIsAuthenticated(false)
      setIsChangingPin(false)
      setCurrentPinInput('')
      setNewPinInput('')
      setPin('')
      setAuthError('')
      setStatusMessage('PIN을 변경했어요. 다시 로그인해 주세요.')
    } catch (error) {
      setPinChangeError(getErrorMessage(error))
    }
  }

  function handlePinChange(event: ChangeEvent<HTMLInputElement>) {
    setPin(event.target.value.replace(/\D/g, '').slice(0, 4))

    if (authError) {
      setAuthError('')
    }
  }

  function startEdit(note: NoteRecord) {
    setEditingNoteId(note.id)
    setEditDraft(note.content)
  }

  function cancelEdit() {
    setEditingNoteId(null)
    setEditDraft('')
  }

  async function handleSaveEdit(noteId: string) {
    if (!supabaseReady) {
      setDataError('Supabase 환경 변수가 설정되지 않아 메모를 수정할 수 없어요.')
      return
    }

    const content = editDraft.trim()

    if (!content) {
      setStatusMessage('메모 내용을 입력해 주세요.')
      return
    }

    setIsSavingEdit(true)
    setDataError('')

    try {
      const supabase = getSupabaseClient()
      const { error } = await supabase.from('jotty_notes').update({ content }).eq('id', noteId)

      if (error) {
        throw error
      }

      setEditingNoteId(null)
      setEditDraft('')
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

    const content = memoInput.trim()

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

  function handleLock() {
    window.localStorage.removeItem(AUTH_STORAGE_KEY)
    setRememberDevice(false)
    setPin('')
    setIsAuthenticated(false)
    setStatusMessage('잠금 화면으로 이동했어요.')
  }

  return (
    isCheckingRememberedAuth ? (
      <div className="auth-shell">
        <div className="pin-card">
          <p className="pin-subtitle">Jotty를 준비하는 중...</p>
        </div>
      </div>
    ) : !isAuthenticated ? (
      <div className="auth-shell">
        <form className="pin-card" onSubmit={handlePinSubmit}>
          {isChangingPin ? (
            <>
              <h1>PIN 변경하기</h1>
              <div className="pin-change-panel">
                <label className="field">
                  <span>현재 PIN</span>
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={4}
                    placeholder="현재 PIN"
                    value={currentPinInput}
                    onChange={(event) => handlePinDigits(setCurrentPinInput, event)}
                  />
                </label>
                <label className="field">
                  <span>새 PIN</span>
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={4}
                    placeholder="새 PIN"
                    value={newPinInput}
                    onChange={(event) => handlePinDigits(setNewPinInput, event)}
                  />
                </label>
                {pinChangeError ? <p className="error-text">{pinChangeError}</p> : null}
                <button type="button" className="secondary-button" onClick={() => void handlePinChangeSave()}>
                  PIN 저장
                </button>
                <button type="button" className="text-button" onClick={() => setIsChangingPin(false)}>
                  로그인으로 돌아가기
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="app-badge">
                <NoteIcon />
                <span>Jotty</span>
              </div>
              <label className="field pin-entry-field">
                <span className="sr-only">PIN 입력</span>
                <input
                  type="password"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={4}
                  placeholder="0000"
                  value={pin}
                  onChange={handlePinChange}
                />
              </label>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={rememberDevice}
                  onChange={(event) => setRememberDevice(event.target.checked)}
                />
                <span>이 기기 기억하기</span>
              </label>
              {authError ? <p className="error-text">{authError}</p> : null}
              <button type="submit" className="primary-button">
                입장하기
              </button>
              <button
                type="button"
                className="text-button pin-change-button"
                onClick={() => {
                  setIsChangingPin(true)
                  setPinChangeError('')
                  setCurrentPinInput('')
                  setNewPinInput('')
                }}
              >
                PIN 변경하기
              </button>
            </>
          )}
        </form>
      </div>
    ) : (
      <div className="app-shell">
        <header className="topbar">
          <div className="topbar-title">
            <div className="app-icon">
              <NoteIcon />
            </div>
            <h1>Jotty</h1>
          </div>
          <div className="topbar-actions">
            <button type="button" className="secondary-button lock-button" aria-label="잠금" onClick={handleLock}>
              <LockIcon />
            </button>
          </div>
        </header>

        {!supabaseReady ? (
          <section className="notice-card">
            <h2>Supabase 연결이 필요해요</h2>
            <p>`.env`에 URL, Anon Key, PIN 값을 넣은 뒤 다시 실행해 주세요.</p>
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
                {notes.map((note) => (
                  <div key={note.id} className="note-outer">
                    <div className="note-white-wrap">
                      <div className={`note-card note-body-surface${editingNoteId === note.id ? ' note-card--editing' : ''}`}>
                        {editingNoteId === note.id ? (
                          <textarea
                            ref={editTextareaRef}
                            className="field-textarea note-edit-textarea"
                            value={editDraft}
                            rows={1}
                            onChange={(event) => {
                              setEditDraft(event.target.value)
                              requestAnimationFrame(() => autosizeTextarea(editTextareaRef.current))
                            }}
                          />
                        ) : (
                          <p className="note-content">{note.content}</p>
                        )}
                      </div>
                    </div>
                    <div className="note-meta-row">
                      <span className="note-date">{formatDateLabel(note.created_at)}</span>
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
                ))}
              </div>
            ) : null}
          </section>
        </main>
      </div>
    )
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

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M7.5 11V8.75a4.5 4.5 0 1 1 9 0V11"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path
        d="M7.25 11h9.5a2 2 0 0 1 2 2v5.5a2.25 2.25 0 0 1-2.25 2.25h-9A2.25 2.25 0 0 1 5.25 18.5V13a2 2 0 0 1 2-2Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path
        d="M12 15.3v2.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  )
}

export default App
