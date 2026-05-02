import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth'

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
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="page-width">
        <h1 className="font-serif-zh text-2xl font-normal mb-8 text-ink">Piece</h1>
        <div className="flex flex-col gap-3">
          <input
            className="w-full bg-paper-2 border border-paper-3 rounded-sm px-3 py-2 text-ink placeholder-ink-3 focus:outline-none focus:border-rose"
            placeholder="Username"
            value={username}
            onChange={e => setUsername(e.target.value)}
            autoFocus
          />
          <input
            className="w-full bg-paper-2 border border-paper-3 rounded-sm px-3 py-2 text-ink placeholder-ink-3 focus:outline-none focus:border-rose"
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handle('login')}
          />
          {error && <p className="text-rose-deep text-sm">{error}</p>}
          <div className="flex gap-2 mt-1">
            <button
              className="flex-1 bg-rose hover:bg-rose-deep text-white rounded-sm px-4 py-2 font-medium transition-colors"
              onClick={() => handle('login')}
            >
              Log in
            </button>
            <button
              className="flex-1 border border-paper-3 hover:border-ink-4 text-ink rounded-sm px-4 py-2 font-medium transition-colors"
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
