import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/auth'
import TextField from '@/components/TextField'

export default function Login() {
  const { login, signup } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  async function handle(action: 'login' | 'signup') {
    setError('')
    try {
      if (action === 'login') await login(username, password)
      else await signup(username, password)
      navigate('/worlds')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    }
  }

  return (
    <div className="page-fade-in min-h-screen bg-paper px-4">
      <div className="page-width flex min-h-screen flex-col justify-center">
        <header className="mb-10">
          <p className="t-eyebrow eyebrow-rule mb-5">Private commissions</p>
          <h1 className="t-display italic">Take #</h1>
          <p className="t-meta mt-3 max-w-sm">
            Custom AI-written romance and smut one-shots, made to your brief.
          </p>
        </header>
        <div className="flex flex-col gap-4">
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
            onKeyDown={e => e.key === 'Enter' && handle('login')}
          />
          {error && <p className="t-meta text-rose-deep">{error}</p>}
          <div className="mt-2 flex items-center gap-3">
            <button
              className="h-12 flex-1 rounded-full bg-rose px-5 font-serif-zh text-[15px] italic leading-none text-white shadow-(--shadow-cta) transition-all duration-200 hover:-translate-y-0.5 hover:bg-rose-deep hover:shadow-(--shadow-cta-hover) focus:outline-none focus-visible:ring-4 focus-visible:ring-rose/25"
              onClick={() => handle('login')}
            >
              Log in
            </button>
            <button
              className="h-12 rounded-full px-5 font-serif-zh text-[15px] italic leading-none text-ink-3 transition-[color,transform] duration-200 hover:-translate-y-px hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-4/50"
              onClick={() => handle('signup')}
            >
              Sign up
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
