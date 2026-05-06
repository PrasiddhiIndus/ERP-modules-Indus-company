import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { ROLES, MODULES as FALLBACK_MODULES } from '../config/roles'
import { useAppAccessConfig } from '../contexts/AppAccessConfigContext'
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

    if (password.length < 6) {
      setError('Password must be at least 6 characters long')
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

    const normEmail = String(email || '').trim().toLowerCase()
    const forcedRahul = normEmail === 'rahul.ifspl@gmail.com'
    const effectiveRole = forcedRahul ? ROLES.SUPER_ADMIN_PRO : ROLES.EXECUTIVE

    const { error: signUpError } = await signUpWithProfile(email, password, {
      username,
      team,
      role: effectiveRole,
      allowed_modules: effectiveRole === ROLES.MANAGER ? allowedModules : [],
    })

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
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-emerald-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl p-8 space-y-6">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
              <UserPlus className="w-8 h-8 text-green-600" />
            </div>
            <h2 className="text-3xl font-bold text-gray-900">Create Account</h2>
            <p className="text-gray-600 mt-2">Sign up with username, team and role</p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-red-600 text-sm">{error}</p>
            </div>
          )}
          {success && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <p className="text-green-600 text-sm">{success}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Username</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="Choose a username"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="Enter email (used to sign in)"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-11 pr-11 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="Password (min 6 characters)"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Confirm Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full pl-11 pr-11 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="Confirm password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Team / Module</label>
              <div className="relative">
                <select
                  value={team}
                  onChange={(e) => setTeam(e.target.value)}
                  className="w-full pl-4 pr-10 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent appearance-none bg-white"
                  required
                >
                  <option value="">Select team/module</option>
                  {modules.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
              </div>
              <p className="text-[11px] text-gray-500 mt-1">
                This list is synced to backend config ({accessCfg?.source || 'fallback'}).
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Role</label>
              <div className="relative">
                <Shield className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5 z-10" />
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full pl-11 pr-10 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent appearance-none bg-white"
                  required
                >
                  <option value={ROLES.EXECUTIVE}>Executive (only your team module)</option>
                  <option value={ROLES.MANAGER}>Manager (team + selected modules)</option>
                  <option value={ROLES.ADMIN}>Admin (full access)</option>
                  <option value={ROLES.SUPER_ADMIN}>Super Admin (Management)</option>
                  <option value={ROLES.SUPER_ADMIN_PRO}>Super Admin Pro</option>
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
              </div>
              <p className="text-[11px] text-gray-500 mt-1">
                Note: Self-registration creates <span className="font-semibold">Executive</span> accounts by default.
                Only <span className="font-semibold">rahul.ifspl@gmail.com</span> is hardcoded as <span className="font-semibold">Super Admin Pro</span>.
              </p>
            </div>

            {role === ROLES.MANAGER && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Additional modules (check all that apply)
                </label>
                <div className="border border-gray-200 rounded-lg p-3 space-y-2 max-h-40 overflow-y-auto">
                  {modules.filter((m) => m.value !== team).map((m) => (
                    <label key={m.value} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={allowedModules.includes(m.value)}
                        onChange={() => toggleModule(m.value)}
                        className="rounded border-gray-300 text-green-600 focus:ring-green-500"
                      />
                      <span className="text-sm text-gray-700">{m.label}</span>
                    </label>
                  ))}
                </div>
                <p className="text-xs text-gray-500 mt-1">Your team module is always included.</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-semibold py-3 rounded-lg transition-colors"
            >
              {loading ? 'Creating account…' : 'Create Account'}
            </button>
          </form>

          <div className="text-center">
            <p className="text-gray-600">
              Already have an account?{' '}
              <Link to="/login" className="text-green-600 hover:text-green-700 font-semibold">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Register
