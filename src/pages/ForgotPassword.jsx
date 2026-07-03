import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { INDUS_LOGO_SRC } from '../constants/branding.js'
import { Mail, KeyRound } from 'lucide-react'

const ForgotPassword = () => {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  const { requestPasswordReset } = useAuth()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error: resetError } = await requestPasswordReset(email)

    if (resetError) {
      setError(resetError.message || 'Could not send reset email. Try again later.')
      setLoading(false)
      return
    }

    setSubmitted(true)
    setLoading(false)
  }

  return (
    <div className="login-page min-h-screen flex flex-col bg-white">
      <main className="flex-1 flex flex-col justify-center items-center p-4 sm:p-6">
        <div className="lg:hidden text-center mb-5 shrink-0">
          <img src={INDUS_LOGO_SRC} alt="Indus" className="h-11 w-11 mx-auto mb-2 object-contain" />
          <div className="flex items-center justify-center gap-2">
            <div className="w-1 h-7 rounded-full bg-indus-red" />
            <h1 className="font-heading text-2xl font-bold text-gray-900">INDUS OS</h1>
          </div>
        </div>

        <div className="w-full max-w-[420px]">
          <div className="bg-white border border-gray-200 rounded-2xl shadow-lg overflow-hidden">
            <div className="h-1 bg-gradient-to-r from-indus-red to-indus-red/80" aria-hidden />
            <div className="p-5 sm:p-6">
              <div className="flex items-start gap-3 mb-4">
                <div className="inline-flex items-center justify-center w-10 h-10 bg-red-50 rounded-full shrink-0">
                  <KeyRound className="w-5 h-5 text-indus-red" />
                </div>
                <div>
                  <h2 className="font-heading text-xl font-semibold text-gray-900">Forgot password</h2>
                  <p className="text-gray-500 text-sm mt-1 font-body">
                    Enter your email and we&apos;ll send a reset link if an account exists.
                  </p>
                </div>
              </div>

              {error && (
                <div className="rounded-xl p-3.5 text-sm mb-4 font-body bg-red-50 border border-red-200 text-red-800">
                  {error}
                </div>
              )}

              {submitted ? (
                <div className="rounded-xl p-3.5 text-sm mb-4 font-body bg-emerald-50 border border-emerald-200 text-emerald-800">
                  If an account exists, we sent a reset link.
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-3">
                  <div>
                    <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1.5 font-body">
                      Email
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                      <input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-300 rounded-xl text-gray-900 placeholder:text-gray-500 font-body text-sm focus:ring-2 focus:ring-indus-red/40 focus:border-indus-red"
                        placeholder="Employee ID / Email"
                        required
                        autoFocus
                      />
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={loading}
                    className="login-btn-primary w-full text-white font-semibold py-3 px-4 rounded-xl flex items-center justify-center font-body text-sm"
                  >
                    {loading ? (
                      <div className="login-spinner rounded-full h-4 w-4 border-2 border-t-transparent" />
                    ) : (
                      'Send reset link'
                    )}
                  </button>
                </form>
              )}

              <p className="text-center text-sm text-gray-500 mt-4 font-body">
                <Link to="/" className="text-indus-red hover:text-indus-red-hover font-medium transition-colors">
                  ← Back to sign in
                </Link>
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

export default ForgotPassword
