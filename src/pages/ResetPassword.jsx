import React, { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { INDUS_LOGO_SRC } from '../constants/branding.js'
import { Lock, Eye, EyeOff, KeyRound } from 'lucide-react'

const ResetPassword = () => {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [checkingSession, setCheckingSession] = useState(true)
  const [recoveryReady, setRecoveryReady] = useState(false)
  const [error, setError] = useState('')

  const { completePasswordReset, signOut } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    let cancelled = false
    let cleanup = null

    const markReady = () => {
      if (!cancelled) {
        setRecoveryReady(true)
        setCheckingSession(false)
      }
    }

    const markInvalid = (message) => {
      if (!cancelled) {
        setRecoveryReady(false)
        setCheckingSession(false)
        setError(message)
      }
    }

    const checkRecoverySession = async () => {
      const hash = window.location.hash || ''
      const isRecoveryHash = hash.includes('type=recovery') || hash.includes('type=password_recovery')

      const { data: { session }, error: sessionError } = await supabase.auth.getSession()

      if (sessionError) {
        markInvalid('This reset link is invalid or has expired.')
        return
      }

      if (session?.user) {
        markReady()
        return
      }

      if (isRecoveryHash) {
        const timeout = setTimeout(() => {
          if (!cancelled) {
            markInvalid('This reset link is invalid or has expired.')
          }
        }, 8000)

        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
          if (event === 'PASSWORD_RECOVERY' || nextSession?.user) {
            clearTimeout(timeout)
            markReady()
          }
        })

        cleanup = () => {
          clearTimeout(timeout)
          subscription.unsubscribe()
        }
        return
      }

      markInvalid('This reset link is invalid or has expired.')
    }

    checkRecoverySession()

    return () => {
      cancelled = true
      if (cleanup) cleanup()
    }
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (password.length < 6) {
      setError('Password must be at least 6 characters long')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    setLoading(true)

    const { error: updateError } = await completePasswordReset(password)

    if (updateError) {
      setError(updateError.message || 'Could not update password. The link may have expired.')
      setLoading(false)
      return
    }

    await signOut()
    navigate('/', {
      replace: true,
      state: { message: 'Password updated successfully. Sign in with your new password.' },
    })
  }

  return (
    <div className="login-page min-h-screen flex flex-col bg-canvas">
      <main className="flex-1 flex flex-col justify-center items-center p-6 min-h-0 overflow-auto">
        <div className="lg:hidden text-center mb-6 shrink-0">
          <div className="h-11 w-11 rounded-full bg-accent-deep flex items-center justify-center mx-auto mb-3 overflow-hidden">
            <img src={INDUS_LOGO_SRC} alt="Indus" className="h-8 w-8 object-contain" />
          </div>
          <h1 className="text-[22px] font-semibold text-ink">INDUS OS</h1>
          <p className="erp-mono-caption text-ink-muted mt-1">Enterprise Operations Platform</p>
        </div>

        <div className="login-card w-full max-w-[400px] p-8 shrink-0">
          <div className="mb-5">
            <div className="flex items-start gap-3">
              <div className="inline-flex items-center justify-center w-10 h-10 bg-accent-soft rounded-full shrink-0 border border-accent-border">
                <KeyRound className="w-5 h-5 text-accent" strokeWidth={1.5} />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-ink">Set new password</h2>
                <p className="text-[12.5px] text-ink-secondary mt-1 font-body">
                  Choose a new password for your account.
                </p>
              </div>
            </div>
          </div>

          {checkingSession ? (
            <div className="flex justify-center py-8">
              <div className="login-spinner rounded-full h-6 w-6 border-2 border-t-transparent" />
            </div>
          ) : !recoveryReady ? (
            <div className="space-y-4">
              <div className="erp-alert-critical rounded-control p-3 text-[12.5px] font-mono">
                {error || 'This reset link is invalid or has expired.'}
              </div>
              <p className="text-center">
                <Link
                  to="/forgot-password"
                  className="text-[13px] text-accent hover:text-accent-deep font-medium font-body"
                >
                  Request a new reset link
                </Link>
              </p>
            </div>
          ) : (
            <>
              {error && (
                <div className="erp-alert-critical rounded-control p-3 text-[12.5px] mb-4 font-mono">
                  {error}
                </div>
              )}
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="password" className="login-label block mb-2">
                    New password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted w-4 h-4" strokeWidth={1.5} />
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="login-input w-full pl-10 pr-10 py-2.5 font-body"
                      placeholder="At least 6 characters"
                      required
                      minLength={6}
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink transition-[color] duration-theme"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" strokeWidth={1.5} /> : <Eye className="w-4 h-4" strokeWidth={1.5} />}
                    </button>
                  </div>
                </div>
                <div>
                  <label htmlFor="confirmPassword" className="login-label block mb-2">
                    Confirm password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted w-4 h-4" strokeWidth={1.5} />
                    <input
                      id="confirmPassword"
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="login-input w-full pl-10 pr-10 py-2.5 font-body"
                      placeholder="Re-enter password"
                      required
                      minLength={6}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink transition-[color] duration-theme"
                      aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                    >
                      {showConfirmPassword ? <EyeOff className="w-4 h-4" strokeWidth={1.5} /> : <Eye className="w-4 h-4" strokeWidth={1.5} />}
                    </button>
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="login-btn-primary w-full font-medium py-2.5 px-4 flex items-center justify-center text-[13px] font-body"
                >
                  {loading ? (
                    <div className="login-spinner rounded-full h-4 w-4 border-2 border-t-transparent" />
                  ) : (
                    'Update password'
                  )}
                </button>
              </form>
            </>
          )}

          {recoveryReady && (
            <p className="text-center mt-4">
              <Link to="/" className="text-[13px] text-accent hover:text-accent-deep font-medium font-body">
                ← Back to sign in
              </Link>
            </p>
          )}

          <div className="mt-6 pt-4 border-t border-divider">
            <p className="login-footer text-center">
              Secure access · Internal Use Only
            </p>
          </div>
        </div>
      </main>
    </div>
  )
}

export default ResetPassword
