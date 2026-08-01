import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { ROLES, MODULES as FALLBACK_MODULES } from '../config/roles'
import { useAppAccessConfig } from '../contexts/AppAccessConfigContext'
import { INDUS_LOGO_SRC } from '../constants/branding.js'
import { Mail, Lock, Eye, EyeOff, UserPlus, User, ChevronDown, Shield } from 'lucide-react'

const Register = () => {
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [team, setTeam] = useState('')
  const [role, setRole] = useState(ROLES.EXECUTIVE)
  const [allowedModules, setAllowedModules] = useState([])
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const { signUpWithProfile } = useAuth()
  const accessCfg = useAppAccessConfig()
  const navigate = useNavigate()

  const modules = (accessCfg?.modules?.length ? accessCfg.modules : FALLBACK_MODULES).filter((m) => m.value !== 'userManagement')

  const toggleModule = (value) => {
    setAllowedModules((prev) =>
      prev.includes(value) ? prev.filter((m) => m !== value) : [...prev, value]
    )
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSuccess('')

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      setLoading(false)
      return
    }

    if (password.length < 12) {
      setError('Password must be at least 12 characters long')
      setLoading(false)
      return
    }

    if (!team) {
      setError('Please select a team')
      setLoading(false)
      return
    }

    if (role === ROLES.MANAGER && allowedModules.length === 0) {
      setError('Managers must select at least one additional module')
      setLoading(false)
      return
    }

    const effectiveRole = ROLES.EXECUTIVE;

    const { error: signUpError } = await signUpWithProfile(email, password, {
      username,
      team,
      role: effectiveRole,
      allowed_modules: [],
    });

    if (signUpError) {
      setError(signUpError.message)
    } else {
      setSuccess('Account created successfully!')
      setTimeout(() => {
        navigate('/')
      }, 1500)
    }

    setLoading(false)
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
          <div className="mb-5 text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 bg-accent-soft rounded-full mb-3 border border-accent-border">
              <UserPlus className="w-6 h-6 text-accent" strokeWidth={1.5} />
            </div>
            <h2 className="text-lg font-semibold text-ink">Create Account</h2>
            <p className="text-[12.5px] text-ink-secondary mt-1 font-body">
              Sign up with username, team and role
            </p>
          </div>

          {error && (
            <div className="erp-alert-critical rounded-control p-3 text-[12.5px] mb-4 font-mono">
              {error}
            </div>
          )}
          {success && (
            <div className="erp-alert-success rounded-control p-3 text-[12.5px] mb-4 font-mono">
              {success}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="login-label block mb-2">Username</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted w-4 h-4" strokeWidth={1.5} />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="login-input w-full pl-10 pr-4 py-2.5 font-body"
                  placeholder="Choose a username"
                  required
                />
              </div>
            </div>

            <div>
              <label className="login-label block mb-2">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted w-4 h-4" strokeWidth={1.5} />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="login-input w-full pl-10 pr-4 py-2.5 font-body"
                  placeholder="Enter email (used to sign in)"
                  required
                />
              </div>
            </div>

            <div>
              <label className="login-label block mb-2">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted w-4 h-4" strokeWidth={1.5} />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="login-input w-full pl-10 pr-10 py-2.5 font-body"
                  placeholder="Password (min 6 characters)"
                  required
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
              <label className="login-label block mb-2">Confirm Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted w-4 h-4" strokeWidth={1.5} />
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="login-input w-full pl-10 pr-10 py-2.5 font-body"
                  placeholder="Confirm password"
                  required
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

            <div>
              <label className="login-label block mb-2">Team / Module</label>
              <div className="relative">
                <select
                  value={team}
                  onChange={(e) => setTeam(e.target.value)}
                  className="login-input w-full pl-4 pr-10 py-2.5 font-body appearance-none"
                  required
                >
                  <option value="">Select team/module</option>
                  {modules.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted pointer-events-none" strokeWidth={1.5} />
              </div>
              <p className="erp-mono-caption text-ink-muted mt-1">
                This list is synced to backend config ({accessCfg?.source || 'fallback'}).
              </p>
            </div>

            <div>
              <label className="login-label block mb-2">Role</label>
              <div className="relative">
                <Shield className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted w-4 h-4 z-10" strokeWidth={1.5} />
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="login-input w-full pl-10 pr-10 py-2.5 font-body appearance-none"
                  required
                >
                  <option value={ROLES.EXECUTIVE}>Executive (only your team module)</option>
                  <option value={ROLES.MANAGER}>Manager (team + selected modules)</option>
                  <option value={ROLES.ADMIN}>Admin (full access)</option>
                  <option value={ROLES.SUPER_ADMIN}>Super Admin (Management)</option>
                  <option value={ROLES.SUPER_ADMIN_PRO}>Super Admin Pro</option>
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted pointer-events-none" strokeWidth={1.5} />
              </div>
              <p className="erp-mono-caption text-ink-muted mt-1">
                Note: Self-registration creates <span className="font-medium text-ink-secondary">Executive</span> accounts by default.
                Only <span className="font-medium text-ink-secondary">rahul.ifspl@gmail.com</span> is hardcoded as <span className="font-medium text-ink-secondary">Super Admin Pro</span>.
              </p>
            </div>

            {role === ROLES.MANAGER && (
              <div>
                <label className="login-label block mb-2">
                  Additional modules (check all that apply)
                </label>
                <div className="border border-border rounded-card p-3 space-y-2 max-h-40 overflow-y-auto bg-surface-raised">
                  {modules.filter((m) => m.value !== team).map((m) => (
                    <label key={m.value} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={allowedModules.includes(m.value)}
                        onChange={() => toggleModule(m.value)}
                        className="rounded border-border text-accent focus:ring-accent"
                      />
                      <span className="text-[12.5px] text-ink font-body">{m.label}</span>
                    </label>
                  ))}
                </div>
                <p className="erp-mono-caption text-ink-muted mt-1">Your team module is always included.</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="login-btn-primary w-full font-medium py-2.5 px-4 flex items-center justify-center text-[13px] font-body"
            >
              {loading ? (
                <div className="login-spinner rounded-full h-4 w-4 border-2 border-t-transparent" />
              ) : (
                'Create Account'
              )}
            </button>
          </form>

          <p className="text-center text-[12.5px] text-ink-secondary mt-4 font-body">
            Already have an account?{' '}
            <Link to="/login" className="text-accent hover:text-accent-deep font-medium">
              Sign in
            </Link>
          </p>

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

export default Register
