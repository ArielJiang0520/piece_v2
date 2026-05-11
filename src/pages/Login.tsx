import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/auth'
import TextField from '@/components/TextField'
import { useUiText } from '@/i18n'
import { LANGUAGE_OPTIONS, setLanguageId, useLanguageId } from '@/preferences/language'

export default function Login() {
  const { login, signup } = useAuth()
  const navigate = useNavigate()
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
        await signup(username, password)
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
    <div className="page-fade-in min-h-screen bg-paper px-4">
      <div className="page-width relative flex min-h-screen flex-col justify-center py-16">
        <div
          className="absolute right-4 top-5 grid w-28 grid-cols-2 overflow-hidden rounded-full border border-rose-line p-0.5"
          aria-label={t.language}
        >
          {LANGUAGE_OPTIONS.map(option => {
            const selected = option.id === language
            return (
              <button
                key={option.id}
                type="button"
                className={`grid h-8 place-items-center rounded-full font-serif-zh text-[12px] italic leading-none transition-colors ${selected ? 'bg-rose-pale text-rose-deep' : 'text-ink-3 hover:text-ink'
                  }`}
                aria-label={option.label}
                aria-pressed={selected}
                onClick={() => setLanguageId(option.id)}
              >
                {option.shortLabel}
              </button>
            )
          })}
        </div>
        <header className="mb-10">
          <h1 className="t-display italic">{t.appTitle}</h1>
          <p className="t-meta mt-3 max-w-none whitespace-nowrap text-[15px]">
            {t.loginTagline}
          </p>
        </header>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <div>
            <p className="t-eyebrow eyebrow-rule">{isSignup ? t.loginCreateAccount : t.loginWelcomeBack}</p>
            <p className="t-meta mt-3">
              {isSignup ? t.loginRegisterIntro : t.loginContinueIntro}
            </p>
          </div>
          <TextField
            placeholder={t.username}
            value={username}
            onChange={e => setUsername(e.target.value)}
            autoFocus
          />
          <TextField
            type="password"
            placeholder={t.password}
            value={password}
            onChange={e => setPassword(e.target.value)}
          />
          {isSignup && (
            <>
              {!passwordLongEnough && (
                <p
                  className={`t-meta ${password ? 'text-rose-deep' : 'text-ink-3'}`}
                  aria-live="polite"
                >
                  {t.passwordMin}
                </p>
              )}
              <TextField
                type="password"
                placeholder={t.retypePassword}
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
              />
              {confirmPassword && !passwordsMatch && (
                <p className="t-meta text-rose-deep">{t.passwordMismatch}</p>
              )}
            </>
          )}
          {error && <p className="t-meta text-rose-deep">{error}</p>}
          <div className="mt-2 flex flex-col gap-5">
            <button
              type="submit"
              disabled={!canSubmit}
              className="h-12 w-full rounded-full bg-rose px-5 font-serif-zh text-[15px] italic leading-none text-white shadow-(--shadow-cta) transition-all duration-200 hover:-translate-y-0.5 hover:bg-rose-deep hover:shadow-(--shadow-cta-hover) focus:outline-none focus-visible:ring-4 focus-visible:ring-rose/25 disabled:pointer-events-none disabled:opacity-50"
            >
              {isSignup ? t.loginCreateAccount : t.logIn}
            </button>
            <p className="t-meta text-center">
              {isSignup ? t.alreadyHaveAccount : t.dontHaveAccount}{' '}
              <button
                type="button"
                className="font-serif-zh italic text-rose-deep underline decoration-rose-line underline-offset-4 transition-colors hover:text-rose focus:outline-none focus-visible:ring-2 focus-visible:ring-rose/30"
                onClick={() => switchMode(isSignup ? 'login' : 'signup')}
              >
                {isSignup ? t.logIn : t.register}
              </button>
            </p>
          </div>
        </form>
      </div>
    </div>
  )
}
