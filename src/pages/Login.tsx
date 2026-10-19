import { useEffect, useState, type FormEvent } from 'react'
import { BookHeart } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/auth'
import TextField from '@/components/TextField'
import { useUiText } from '@/i18n'
import { LANGUAGE_OPTIONS, setLanguageId, useLanguageId, type LanguageId } from '@/preferences/language'

function languageFromParam(value: string | null): LanguageId | null {
  const normalized = value?.toLowerCase()
  if (normalized === 'zh') return 'zh'
  if (normalized === 'eng' || normalized === 'en') return 'en'
  return null
}

export default function Login() {
  const { login, signup } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const language = useLanguageId()
  const t = useUiText()
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const isSignup = mode === 'signup'
  const passwordLongEnough = password.length >= 8
  const passwordsMatch = password === confirmPassword
  const canSubmit = !isSignup || (passwordLongEnough && passwordsMatch)

  useEffect(() => {
    const paramLanguage = languageFromParam(searchParams.get('language'))
    if (paramLanguage && paramLanguage !== language) setLanguageId(paramLanguage)
  }, [language, searchParams])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    try {
      if (mode === 'login') await login(username, password)
      else {
        if (!passwordLongEnough) {
          setError(t.passwordMin)
          return
        }
        if (!passwordsMatch) {
          setError(t.passwordMismatch)
          return
        }
        await signup(username, password, language)
      }
      navigate('/worlds')
    } catch (e) {
      setError(e instanceof Error ? e.message : t.loginGenericError)
    }
  }

  function switchMode(nextMode: 'login' | 'signup') {
    setMode(nextMode)
    setError('')
    setConfirmPassword('')
  }

  return (
    <div className="page-fade-in bg-paper px-4">
      {/* No nav on this screen, so the panel centers against the whole viewport — svh so mobile
          Chrome measures it with the URL bar showing rather than hidden. */}
      <div className="page-width relative flex min-h-svh flex-col justify-center py-16">
        <div className="segmented absolute right-0 top-4 w-32" aria-label={t.language}>
          {LANGUAGE_OPTIONS.map(option => (
            <button
              key={option.id}
              type="button"
              aria-label={option.label}
              aria-pressed={option.id === language}
              onClick={() => setLanguageId(option.id)}
            >
              {option.shortLabel}
            </button>
          ))}
        </div>

        <header className="mb-6 text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-rose text-white shadow-(--shadow-float)">
            <BookHeart aria-hidden="true" className="h-7 w-7" />
          </span>
          <h1 className="mt-4 text-[28px] font-extrabold tracking-tight text-ink">{t.appTitle}</h1>
          <p className="t-body mt-1 text-ink-3">{t.loginTagline}</p>
        </header>

        <form className="card flex flex-col gap-4 p-5" onSubmit={handleSubmit}>
          <div>
            <h2 className="text-[18px] font-bold text-ink">{isSignup ? t.loginCreateAccount : t.loginWelcomeBack}</h2>
            <p className="t-hint mt-0.5">
              {isSignup ? t.loginRegisterIntro : t.loginContinueIntro}
            </p>
          </div>
          <TextField
            label={t.username}
            value={username}
            onChange={e => setUsername(e.target.value)}
            autoComplete="username"
            autoFocus
          />
          <TextField
            label={t.password}
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoComplete={isSignup ? 'new-password' : 'current-password'}
          />
          {isSignup && (
            <>
              {!passwordLongEnough && (
                <p
                  className={`t-hint -mt-2 ${password ? 'text-signal-red' : ''}`}
                  aria-live="polite"
                >
                  {t.passwordMin}
                </p>
              )}
              <TextField
                label={t.retypePassword}
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
              />
              {confirmPassword && !passwordsMatch && (
                <p className="t-hint -mt-2 text-signal-red">{t.passwordMismatch}</p>
              )}
            </>
          )}
          {error && <p className="error-box">{error}</p>}
          <button
            type="submit"
            disabled={!canSubmit}
            className="btn btn-primary btn-lg btn-block mt-1"
          >
            {isSignup ? t.loginCreateAccount : t.logIn}
          </button>
        </form>

        <p className="t-body mt-5 text-center text-ink-3">
          {isSignup ? t.alreadyHaveAccount : t.dontHaveAccount}{' '}
          <button
            type="button"
            className="font-semibold text-rose active:opacity-70"
            onClick={() => switchMode(isSignup ? 'login' : 'signup')}
          >
            {isSignup ? t.logIn : t.register}
          </button>
        </p>
      </div>
    </div>
  )
}
