import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/auth'
import TextField from '@/components/TextField'

export default function Login() {
  const { login, signup } = useAuth()
  const navigate = useNavigate()
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
          setError('Password must be at least 8 characters.')
          return
        }
        if (!passwordsMatch) {
          setError('Passwords do not match.')
          return
        }
        await signup(username, password)
      }
      navigate('/worlds')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    }
  }

  function switchMode(nextMode: 'login' | 'signup') {
    setMode(nextMode)
    setError('')
    setConfirmPassword('')
  }

  return (
    <div className="page-fade-in min-h-screen bg-paper px-4">
      <div className="page-width flex min-h-screen flex-col justify-center">
        <header className="mb-10">
          <h1 className="t-display italic">Take #</h1>
          <p className="t-meta mt-3 max-w-none whitespace-nowrap text-[15px]">
            AI erotica, written on commission. Yours, no one else's.
          </p>
        </header>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <div>
            <p className="t-eyebrow eyebrow-rule">{isSignup ? 'Create account' : 'Welcome back'}</p>
            <p className="t-meta mt-3">
              {isSignup ? 'Register to start writing.' : 'Log in to continue.'}
            </p>
          </div>
          <TextField
            placeholder="Username"
            value={username}
            onChange={e => setUsername(e.target.value)}
            autoFocus
          />
          <TextField
            type="password"
            placeholder="Password"
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
                  Password must be at least 8 characters.
                </p>
              )}
              <TextField
                type="password"
                placeholder="Retype password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
              />
              {confirmPassword && !passwordsMatch && (
                <p className="t-meta text-rose-deep">Passwords do not match.</p>
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
              {isSignup ? 'Create account' : 'Log in'}
            </button>
            <p className="t-meta text-center">
              {isSignup ? 'Already have an account?' : "Don't have an account?"}{' '}
              <button
                type="button"
                className="font-serif-zh italic text-rose-deep underline decoration-rose-line underline-offset-4 transition-colors hover:text-rose focus:outline-none focus-visible:ring-2 focus-visible:ring-rose/30"
                onClick={() => switchMode(isSignup ? 'login' : 'signup')}
              >
                {isSignup ? 'Log in' : 'Register'}
              </button>
            </p>
          </div>
        </form>
      </div>
    </div>
  )
}
