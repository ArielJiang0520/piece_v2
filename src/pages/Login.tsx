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
      navigate('/')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold mb-8 text-zinc-100">Piece</h1>
        <div className="flex flex-col gap-3">
          <input
            className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-violet-500"
            placeholder="Username"
            value={username}
            onChange={e => setUsername(e.target.value)}
            autoFocus
          />
          <input
            className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-violet-500"
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handle('login')}
          />
          {error && <p className="text-rose-400 text-sm">{error}</p>}
          <div className="flex gap-2 mt-1">
            <button
              className="flex-1 bg-violet-600 hover:bg-violet-500 text-white rounded px-4 py-2 font-medium transition-colors"
              onClick={() => handle('login')}
            >
              Log in
            </button>
            <button
              className="flex-1 border border-zinc-700 hover:border-zinc-500 text-zinc-300 rounded px-4 py-2 font-medium transition-colors"
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
