import React, { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import logo from '../image/website_logo.webp'
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  KeyRound,
  Shield,
  LockKeyhole,
  Users,
  Building2,
  MapPin,
} from 'lucide-react'

const isEmailNotConfirmedError = (err) => {
  if (!err?.message) return false
  const msg = err.message.toLowerCase()
  return msg.includes('email not confirmed') || msg.includes('signup_not_confirmed') || msg.includes('confirm your signup')
}

const isNetworkOrFetchError = (err) => {
  if (!err?.message) return false
  const msg = err.message.toLowerCase()
  return msg.includes('failed to fetch') || msg.includes('cannot reach supabase') || msg.includes('timed out') || msg.includes('networkerror')
}

const METRICS = [
  { value: '32+', label: 'Years of excellence', icon: Building2 },
  { value: '2000+', label: 'Workforce managed', icon: Users },
  { value: '85+', label: 'Industrial clients', icon: Building2 },
  { value: '18', label: 'States operational', icon: MapPin },
]

const ROTATING_STATS = [
  'Live Site Attendance Monitoring',
  'Zero Shortfall Targeting Engine',
  'Smart Payroll Automation',
  'PPE Asset Intelligence',
  'FTTCC Vehicle Data Integration',
  'Real-Time P&L Tracking',
]

const Login = () => {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showVerifyCode, setShowVerifyCode] = useState(false)
  const [verifyCode, setVerifyCode] = useState('')
  const [statIndex, setStatIndex] = useState(0)

  const { signIn, verifyEmailOtp } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    const t = setInterval(() => {
      setStatIndex((i) => (i + 1) % ROTATING_STATS.length)
    }, 5000)
    return () => clearInterval(t)
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setShowVerifyCode(false)
    const { data, error: signInError } = await signIn(email, password)
    if (signInError) {
      if (isEmailNotConfirmedError(signInError)) {
        setShowVerifyCode(true)
        setError('Check your email for a 6-digit code and enter it below to verify your account.')
      } else if (isNetworkOrFetchError(signInError)) {
        setError(
          signInError.message +
            ' — Fix: Copy .env.example to .env, set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then run "npm run dev" again.'
        )
      } else {
        setError(signInError.message)
      }
    } else if (data?.session) {
      navigate('/app/dashboard')
    }
    setLoading(false)
  }

  const handleVerifyCode = async (e) => {
    e.preventDefault()
    const code = verifyCode.replace(/\D/g, '').slice(0, 6)
    if (code.length !== 6) {
      setError('Please enter the full 6-digit code from your email.')
      return
    }
    setLoading(true)
    setError('')
    const { data, error: verifyError } = await verifyEmailOtp(email, code)
    if (verifyError) {
      setError(verifyError.message || 'Invalid or expired code. Try signing in again to get a new code.')
      setLoading(false)
      return
    }
    if (data?.session) navigate('/app/dashboard')
    setLoading(false)
  }

  return (
    <div className="login-page h-screen flex flex-col bg-white overflow-hidden">
      <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden">
        {/* Left panel – Brand & credentials (60%) – white theme */}
        <aside className="relative hidden lg:flex lg:w-[60%] flex-col justify-between overflow-hidden bg-gray-50 border-r border-gray-200 p-6 xl:p-10 shrink-0">
          <div className="min-h-0 flex flex-col gap-5">
            {/* Logo + heading */}
            <div className="flex items-center gap-4 shrink-0">
              <img
                src={logo}
                alt="Indus"
                className="h-12 w-12 xl:h-14 xl:w-14 object-contain shrink-0"
              />
              <div className="flex items-center gap-3">
                <div className="w-1 h-10 rounded-full bg-indus-red shrink-0" aria-hidden />
                <div>
                  <h1 className="font-heading text-3xl xl:text-4xl font-bold tracking-tight text-gray-900">
                    INDUS OS
                  </h1>
                  <p className="text-gray-500 text-sm font-medium tracking-widest uppercase mt-1">
                    Enterprise Operations Platform
                  </p>
                </div>
              </div>
            </div>
            <p className="text-gray-600 text-sm leading-relaxed max-w-md font-body shrink-0">
              Integrated digital ecosystem —
              <span className="text-gray-900 font-medium"> Manpower · Payroll · Billing · Compliance · Projects · Inventory · Analytics</span>
            </p>
            <p className="text-gray-500 text-sm font-body max-w-md shrink-0">
              Powering India's most trusted fire & safety workforce. Designed for scale. Built for precision.
            </p>
          </div>

          <div className="h-px bg-gray-200 my-5 shrink-0" />

          <div className="shrink-0">
            <p className="text-gray-500 text-xs font-semibold tracking-widest uppercase mb-3">
              Operational credentials
            </p>
            <div className="grid grid-cols-2 gap-3">
              {METRICS.map(({ value, label, icon: Icon }, i) => (
                <div
                  key={label}
                  className="bg-white border border-gray-200 rounded-xl py-3 px-4 shadow-sm opacity-0 animate-fade-in hover:border-indus-red/30 hover:shadow-md transition-all"
                  style={{ animationDelay: `${i * 80}ms`, animationFillMode: 'forwards' }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-metrics text-xl font-semibold text-gray-900 tracking-tight">{value}</p>
                      <p className="text-gray-500 text-sm mt-1 font-body">{label}</p>
                    </div>
                    <Icon className="w-5 h-5 text-indus-red shrink-0" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="h-px bg-gray-200 my-5 shrink-0" />

          <div className="shrink-0">
            <div className="flex items-center gap-2 mb-2">
              <span className="inline-flex items-center gap-1.5 py-1.5 px-2.5 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-700 font-metrics text-xs font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live
              </span>
              <span className="text-gray-500 text-sm font-body">Real-time intelligence</span>
            </div>
            <p key={statIndex} className="text-gray-700 text-sm font-metrics font-medium">
              {ROTATING_STATS[statIndex]}
            </p>
          </div>

          <p className="text-gray-500 text-sm font-body shrink-0 mt-3">
            Secure. Structured. Scalable.
          </p>
        </aside>

        {/* Right panel – Login card (40%) – white theme */}
        <main className="flex-1 flex flex-col justify-center items-center p-4 sm:p-6 lg:p-8 min-h-0 overflow-hidden bg-white">
          {/* Mobile: logo + branding */}
          <div className="lg:hidden text-center mb-5 shrink-0">
            <img
              src={logo}
              alt="Indus"
              className="h-11 w-11 mx-auto mb-2 object-contain"
            />
            <div className="flex items-center justify-center gap-2">
              <div className="w-1 h-7 rounded-full bg-indus-red" />
              <h1 className="font-heading text-2xl font-bold text-gray-900">INDUS OS</h1>
            </div>
            <p className="text-gray-500 text-sm mt-1 tracking-widest">Enterprise Operations Platform</p>
          </div>

          <div className="w-full max-w-[420px] flex-1 flex flex-col justify-center min-h-0 py-2">
            <div className="bg-white border border-gray-200 rounded-2xl shadow-lg overflow-hidden shrink-0">
              <div className="h-1 bg-gradient-to-r from-indus-red to-indus-red/80" aria-hidden />
              <div className="p-5 sm:p-6">
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div>
                    <h2 className="font-heading text-xl font-semibold text-gray-900">
                      {showVerifyCode ? 'Verify your email' : 'Secure Access'}
                    </h2>
                    <p className="text-gray-500 text-sm mt-1 font-body">
                      {showVerifyCode
                        ? 'Enter the 6-digit code sent to your email'
                        : 'Authorized personnel only. Role-based access enforced.'}
                    </p>
                  </div>
                  <span className="text-gray-400 text-xs shrink-0 hidden sm:block">Portal</span>
                </div>

                {error && (
                  <div
                    className={`rounded-xl p-3.5 text-sm mb-4 font-body ${
                      showVerifyCode
                        ? 'bg-amber-50 border border-amber-200 text-amber-800'
                        : 'bg-red-50 border border-red-200 text-red-800'
                    }`}
                  >
                    {error}
                  </div>
                )}

                {showVerifyCode ? (
                  <>
                    <p className="text-gray-600 text-sm mb-4 font-body">
                      Code sent to <strong className="text-gray-900">{email}</strong>. Expires in 1 hour.
                    </p>
                    <form onSubmit={handleVerifyCode} className="space-y-3">
                      <div>
                        <label htmlFor="verify-code" className="block text-sm font-medium text-gray-700 mb-1.5 font-body">
                          Verification code
                        </label>
                        <div className="relative">
                          <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                          <input
                            id="verify-code"
                            type="text"
                            inputMode="numeric"
                            maxLength={6}
                            value={verifyCode}
                            onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, ''))}
                            className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-300 rounded-xl text-gray-900 text-center text-lg tracking-widest placeholder:text-gray-400 font-body focus:ring-2 focus:ring-indus-red/40 focus:border-indus-red"
                            placeholder="000000"
                            autoFocus
                          />
                        </div>
                      </div>
                      <button
                        type="submit"
                        disabled={loading || verifyCode.replace(/\D/g, '').length !== 6}
                        className="login-btn-primary w-full text-white font-semibold py-3 px-4 rounded-xl flex items-center justify-center font-body text-sm"
                      >
                        {loading ? (
                          <div className="login-spinner rounded-full h-4 w-4 border-2 border-t-transparent" />
                        ) : (
                          'Verify and sign in'
                        )}
                      </button>
                    </form>
                    <div className="text-center mt-3">
                      <button
                        type="button"
                        onClick={() => { setShowVerifyCode(false); setVerifyCode(''); setError(''); }}
                        className="text-sm text-indus-red hover:text-indus-red-hover font-medium font-body"
                      >
                        ← Back to sign in
                      </button>
                    </div>
                  </>
                ) : (
                  <>
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
                          />
                        </div>
                      </div>
                      <div>
                        <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1.5 font-body">
                          Password
                        </label>
                        <div className="relative">
                          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                          <input
                            id="password"
                            type={showPassword ? 'text' : 'password'}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full pl-11 pr-11 py-3 bg-gray-50 border border-gray-300 rounded-xl text-gray-900 placeholder:text-gray-500 font-body text-sm focus:ring-2 focus:ring-indus-red/40 focus:border-indus-red"
                            placeholder="Password"
                            required
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
                      <button
                        type="submit"
                        disabled={loading}
                        className="login-btn-primary w-full text-white font-semibold py-3 px-4 rounded-xl flex items-center justify-center font-body text-sm"
                      >
                        {loading ? (
                          <div className="login-spinner rounded-full h-4 w-4 border-2 border-t-transparent" />
                        ) : (
                          'Sign in'
                        )}
                      </button>
                    </form>

                    <div className="h-px bg-gray-200 my-4" />

                    <div className="space-y-2">
                      <div className="flex items-center justify-center gap-4 text-sm text-gray-500 font-body flex-wrap">
                        <span className="flex items-center gap-1.5">
                          <LockKeyhole className="w-4 h-4 text-emerald-600 shrink-0" />
                          Enterprise Encrypted
                        </span>
                        <span className="flex items-center gap-1.5">
                          <Shield className="w-4 h-4 text-emerald-600 shrink-0" />
                          Role-Based Authentication
                        </span>
                      </div>
                      <p className="text-center text-xs text-gray-400 font-body">
                        Supabase Secured · Cloud Hosted · ISO-Aligned
                      </p>
                    </div>

                    {/* <p className="text-center text-sm text-gray-500 mt-4 font-body">
                      Don't have an account?{' '}
                      <Link to="/register" className="text-indus-red hover:text-indus-red-hover font-medium transition-colors">
                        Sign up
                      </Link>
                    </p> */}
                  </>
                )}
              </div>
              <div className="px-5 sm:px-6 pb-3 pt-0">
                <p className="text-gray-400 text-xs">Version 3.2 · Internal Use Only</p>
              </div>
            </div>
          </div>

          <div className="lg:hidden mt-5 w-full shrink-0">
            <p className="text-gray-500 text-xs font-semibold tracking-widest uppercase mb-2">
              Operational credentials
            </p>
            <div className="grid grid-cols-2 gap-2">
              {METRICS.map(({ value, label }) => (
                <div key={label} className="bg-gray-50 border border-gray-200 rounded-xl py-3 px-3">
                  <p className="font-metrics text-lg font-semibold text-gray-900">{value}</p>
                  <p className="text-gray-500 text-xs mt-1 font-body">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </main>
      </div>

      <footer className="shrink-0 py-3 px-4 border-t border-gray-200 bg-gray-50">
        <div className="max-w-4xl mx-auto text-center space-y-1">
          <p className="text-gray-600 text-sm font-body font-medium">
            Indus Fire Safety Pvt Ltd · Secure Access Portal
          </p>
          <p className="text-gray-500 text-xs font-body">
            © 2026 Indus Group. All Rights Reserved. · Internal Use Only
          </p>
        </div>
      </footer>
    </div>
  )
}

export default Login
