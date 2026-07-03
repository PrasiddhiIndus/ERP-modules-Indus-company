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
                  <h2 className="font-heading text-xl font-semibold text-gray-900">Set new password</h2>
                  <p className="text-gray-500 text-sm mt-1 font-body">
                    Choose a new password for your account.
                  </p>
                </div>
              </div>

              {checkingSession ? (
                <div className="flex justify-center py-8">
                  <div className="login-spinner rounded-full h-6 w-6 border-2 border-t-transparent" />
                </div>
              ) : !recoveryReady ? (
                <div className="space-y-4">
                  <div className="rounded-xl p-3.5 text-sm font-body bg-red-50 border border-red-200 text-red-800">
                    {error || 'This reset link is invalid or has expired.'}
                  </div>
                  <p className="text-center text-sm font-body">
                    <Link
                      to="/forgot-password"
                      className="text-indus-red hover:text-indus-red-hover font-medium transition-colors"
                    >
                      Request a new reset link
                    </Link>
                  </p>
                </div>
              ) : (
                <>
                  {error && (
                    <div className="rounded-xl p-3.5 text-sm mb-4 font-body bg-red-50 border border-red-200 text-red-800">
                      {error}
                    </div>
                  )}
                  <form onSubmit={handleSubmit} className="space-y-3">
                    <div>
                      <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1.5 font-body">
                        New password
                      </label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                        <input
                          id="password"
                          type={showPassword ? 'text' : 'password'}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="w-full pl-11 pr-11 py-3 bg-gray-50 border border-gray-300 rounded-xl text-gray-900 placeholder:text-gray-500 font-body text-sm focus:ring-2 focus:ring-indus-red/40 focus:border-indus-red"
                          placeholder="At least 6 characters"
                          required
                          minLength={6}
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                        >
                          {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                        </button>
                      </div>
                    </div>
                    <div>
                      <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1.5 font-body">
                        Confirm password
                      </label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                        <input
                          id="confirmPassword"
                          type={showConfirmPassword ? 'text' : 'password'}
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          className="w-full pl-11 pr-11 py-3 bg-gray-50 border border-gray-300 rounded-xl text-gray-900 placeholder:text-gray-500 font-body text-sm focus:ring-2 focus:ring-indus-red/40 focus:border-indus-red"
                          placeholder="Re-enter password"
                          required
                          minLength={6}
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                        >
                          {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                        </button>
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
                        'Update password'
                      )}
                    </button>
                  </form>
                </>
              )}

              {recoveryReady && (
                <p className="text-center text-sm text-gray-500 mt-4 font-body">
                  <Link to="/" className="text-indus-red hover:text-indus-red-hover font-medium transition-colors">
                    ← Back to sign in
                  </Link>
                </p>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

export default ResetPassword
