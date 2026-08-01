import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { INDUS_LOGO_SRC } from '../constants/branding.js'
import { Mail } from 'lucide-react'

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
    <div className="login-page min-h-screen flex flex-col bg-canvas">
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-8 sm:py-10">
        <div className="w-full max-w-[420px] mb-6">
          <div className="inline-flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-accent-deep flex items-center justify-center shrink-0 overflow-hidden">
              <img src={INDUS_LOGO_SRC} alt="Indus" className="h-7 w-7 object-contain" />
            </div>
            <div>
              <h1 className="type-page-title text-ink leading-tight">INDUS OS</h1>
              <p className="type-mono-micro text-ink-muted mt-0.5">Enterprise operations</p>
            </div>
          </div>
        </div>

        <div className="login-card w-full max-w-[420px]">
          <div className="px-6 pt-6 pb-5 sm:px-7 sm:pt-7 border-b border-divider">
            <h2 className="type-section-title text-ink">Reset password</h2>
            <p className="type-meta text-ink-secondary mt-1.5">
              Enter your email and we&apos;ll send a reset link if an account exists.
            </p>
          </div>

          <div className="px-6 py-6 sm:px-7 sm:py-7">
            {error && (
              <div className="erp-alert-critical rounded-control p-3 type-code-meta mb-4 normal-case tracking-normal">
                {error}
              </div>
            )}

            {submitted ? (
              <div className="erp-alert-success rounded-control p-3 type-code-meta mb-4 normal-case tracking-normal">
                If an account exists, we sent a reset link.
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="email" className="login-label block mb-2">
                    Email
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted w-4 h-4" strokeWidth={1.5} />
                    <input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="login-input w-full pl-10 pr-4 h-11"
                      placeholder="name@company.com"
                      required
                      autoFocus
                      autoComplete="username"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="login-btn-primary w-full h-11 flex items-center justify-center"
                >
                  {loading ? (
                    <div className="login-spinner rounded-full h-4 w-4 border-2 border-t-transparent" />
                  ) : (
                    'Send reset link'
                  )}
                </button>
              </form>
            )}

            <p className="text-center mt-5">
              <Link to="/" className="type-body-medium text-accent hover:text-accent-deep">
                ← Back to sign in
              </Link>
            </p>
          </div>
        </div>
      </div>

      <footer className="shrink-0 py-3 px-4 border-t border-border">
        <p className="login-footer text-center normal-case tracking-normal">
          © 2026 Indus Fire Safety Pvt Ltd · Internal use only
        </p>
      </footer>
    </div>
  )
}

export default ForgotPassword
