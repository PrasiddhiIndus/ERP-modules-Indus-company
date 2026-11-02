import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import {
  ArrowRight,
  Building2,
  Check,
  // ChevronDown, // language switcher
  CircleDollarSign,
  Eye,
  EyeOff,
  // Globe, // language switcher
  // HardHat, // site login option
  Layers,
  LineChart,
  Lock,
  Mail,
  Moon,
  ShieldCheck,
  Sun,
  Truck,
  Users,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { isStagingSupabaseProject } from '../lib/stagingProject';
import {
  markSupabaseSessionHydrated,
  clearSupabaseAuthStorage,
  isCachedAccessTokenExpired,
  readCachedAccessToken,
  hasCachedRefreshToken,
  ensureFreshCachedSession,
} from '../lib/authSessionUtils';
import {
  planPostLoginNavigation,
  logLoginStage,
  validateTeamLandingPaths,
  resolveSafeLandingPath,
} from '../lib/loginFlow';
import { getAccessibleModules } from '../config/roles';
import { INDUS_LOGO_SRC } from '../constants/branding.js';
import { isAuthBannedError, ACCOUNT_INACTIVE_MESSAGE } from '../lib/accountInactive';
import { prefetchAppShell, prefetchAppShellNow } from '../lib/prefetchAppShell';
import './Login.css';

const REMEMBER_KEY = 'erp_trust_device_until';
const LOGIN_AUDIENCE_KEY = 'erp_login_audience';
const LOGIN_LANG_KEY = 'erp_login_lang';

const PUBLIC_BASE = (import.meta.env.BASE_URL || '/').replace(/\/?$/, '/');
const CAMPUS_BG_WEBP = `${PUBLIC_BASE}indus-campus-aerial.webp`;
const CAMPUS_BG_JPG = `${PUBLIC_BASE}indus-campus-aerial.jpg`;

const FEATURE_TILES = [
  { title: 'People', subtitle: 'HR & Workforce', Icon: Users },
  { title: 'Operations', subtitle: 'Projects & Sites', Icon: Layers },
  { title: 'Finance', subtitle: 'Procure to Pay', Icon: CircleDollarSign },
  { title: 'Compliance', subtitle: 'Audit & Standards', Icon: ShieldCheck },
  { title: 'Assets', subtitle: 'Fleet & Equipment', Icon: Truck },
  { title: 'Insights', subtitle: 'Reports & Analytics', Icon: LineChart },
];

const LANG_OPTIONS = [
  { code: 'en', label: 'EN' },
  { code: 'hi', label: 'HI' },
];

const NETWORK_ERROR_MESSAGE =
  'Server unreachable. Check your internet, turn off VPN if needed, or restore the project in Supabase Dashboard (free projects pause when inactive).';

const isInvalidCredentialsError = (err) => {
  if (!err?.message) return false;
  const msg = err.message.toLowerCase();
  return msg.includes('invalid login credentials') || msg.includes('invalid_credentials');
};

const isEmailNotConfirmedError = (err) => {
  if (!err?.message) return false;
  const msg = err.message.toLowerCase();
  return (
    msg.includes('email not confirmed') ||
    msg.includes('signup_not_confirmed') ||
    msg.includes('confirm your signup')
  );
};

const isNetworkError = (err) => {
  if (!err?.message) return false;
  const msg = err.message.toLowerCase();
  return (
    msg.includes('failed to fetch') ||
    msg.includes('network') ||
    msg.includes('timed out') ||
    msg.includes('connection') ||
    msg.includes('unreachable')
  );
};

const isRateLimitError = (err) => {
  if (!err?.message) return false;
  const msg = err.message.toLowerCase();
  return (
    msg.includes('too many requests') ||
    msg.includes('only request this after') ||
    msg.includes('rate limit')
  );
};

function readRememberPreference() {
  try {
    const until = Number(localStorage.getItem(REMEMBER_KEY) || 0);
    return Number.isFinite(until) && until > Date.now();
  } catch {
    return false;
  }
}

function writeRememberPreference(on) {
  try {
    if (on) {
      localStorage.setItem(REMEMBER_KEY, String(Date.now() + 30 * 24 * 60 * 60 * 1000));
    } else {
      localStorage.removeItem(REMEMBER_KEY);
    }
  } catch {
    /* ignore */
  }
}

function readLoginAudience() {
  try {
    const v = localStorage.getItem(LOGIN_AUDIENCE_KEY);
    return v === 'site' ? 'site' : 'office';
  } catch {
    return 'office';
  }
}

function writeLoginAudience(value) {
  try {
    localStorage.setItem(LOGIN_AUDIENCE_KEY, value === 'site' ? 'site' : 'office');
  } catch {
    /* ignore */
  }
}

function readLoginLang() {
  try {
    const v = localStorage.getItem(LOGIN_LANG_KEY);
    return LANG_OPTIONS.some((o) => o.code === v) ? v : 'en';
  } catch {
    return 'en';
  }
}

function writeLoginLang(code) {
  try {
    localStorage.setItem(LOGIN_LANG_KEY, code);
  } catch {
    /* ignore */
  }
}

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(() => readRememberPreference());
  const [revealPassword, setRevealPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showVerifyCode, setShowVerifyCode] = useState(false);
  const [verifyCode, setVerifyCode] = useState('');
  const [otpSendStatus, setOtpSendStatus] = useState('idle');
  const [successMessage, setSuccessMessage] = useState('');
  const [loginAudience, setLoginAudience] = useState(() => readLoginAudience());
  const [lang, setLang] = useState(() => readLoginLang());
  const [langOpen, setLangOpen] = useState(false);
  const emailRef = useRef(null);
  const langMenuRef = useRef(null);

  const { theme, setTheme, toggleTheme } = useTheme();
  const {
    signIn,
    verifyEmailOtp,
    resendConfirmation,
    user,
    userProfile,
    permissionsReady,
    applyLoginProfile,
    clearInvalidSession,
  } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const activeLang = useMemo(
    () => LANG_OPTIONS.find((o) => o.code === lang) || LANG_OPTIONS[0],
    [lang]
  );

  useEffect(() => {
    const message = location.state?.message;
    if (message) {
      setSuccessMessage(message);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, location.pathname, navigate]);

  useEffect(() => {
    validateTeamLandingPaths();
    if (isCachedAccessTokenExpired()) {
      if (hasCachedRefreshToken()) {
        void ensureFreshCachedSession({ forceRefresh: true });
      } else {
        clearSupabaseAuthStorage();
      }
    }
    emailRef.current?.focus();
    prefetchAppShell();
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    if (!readCachedAccessToken() && !hasCachedRefreshToken()) return;
    if (isCachedAccessTokenExpired()) return;
    if (!permissionsReady || !userProfile) return;
    const mods = getAccessibleModules(userProfile);
    const path = resolveSafeLandingPath(userProfile, mods);
    logLoginStage('already-authenticated-redirect', { path, userId: user.id });
    navigate(path, { replace: true });
  }, [user, userProfile, permissionsReady, navigate]);

  useEffect(() => {
    if (!langOpen) return undefined;
    const onDoc = (e) => {
      if (!langMenuRef.current?.contains(e.target)) setLangOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setLangOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [langOpen]);

  const clearError = () => {
    if (error) setError('');
  };

  const selectAudience = (value) => {
    setLoginAudience(value);
    writeLoginAudience(value);
  };

  const selectLang = (code) => {
    setLang(code);
    writeLoginLang(code);
    setLangOpen(false);
  };

  const sendVerificationCode = async () => {
    const trimmed = email.trim();
    if (!trimmed) {
      setError('Enter your email above, then try again.');
      return false;
    }
    setOtpSendStatus('sending');
    const { error: resendErr } = await resendConfirmation(trimmed);
    if (resendErr) {
      setOtpSendStatus(isRateLimitError(resendErr) ? 'rate_limited' : 'failed');
      setError(
        isNetworkError(resendErr)
          ? NETWORK_ERROR_MESSAGE
          : resendErr.message ||
              'Could not send verification code. Ask an admin to confirm your email in Supabase.'
      );
      return false;
    }
    setOtpSendStatus('sent');
    return true;
  };

  const finishLoginNavigation = async (session, quickProfile) => {
    const result = await planPostLoginNavigation(session, quickProfile);
    if (!result.ok) {
      logLoginStage('redirect-failed', { error: result.error, inactive: result.inactive });
      if (result.inactive || result.code === 'account_inactive') {
        try {
          await clearInvalidSession();
        } catch {
          /* ignore */
        }
        setError(result.error || 'Your account is inactive. Contact your administrator.');
        return false;
      }
      setError(result.error);
      return false;
    }
    applyLoginProfile(result.profile, session.user.id);
    if (result.warning) {
      logLoginStage('redirect-warning', { warning: result.warning });
    }
    logLoginStage('navigate', {
      path: result.path,
      audience: loginAudience,
    });
    prefetchAppShellNow();
    navigate(result.path, { replace: true });
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed || !password) {
      setError('Both fields are required to open a session.');
      return;
    }

    setLoading(true);
    setError('');
    setShowVerifyCode(false);
    setOtpSendStatus('idle');
    writeRememberPreference(remember);
    writeLoginAudience(loginAudience);

    try {
      const { data, error: signInError, profile: quickProfile } = await signIn(trimmed, password);
      if (signInError) {
        if (isAuthBannedError(signInError)) {
          setError(ACCOUNT_INACTIVE_MESSAGE);
        } else if (isEmailNotConfirmedError(signInError)) {
          setShowVerifyCode(true);
          setOtpSendStatus('idle');
          setError(
            'Your email is not verified yet. Tap Resend code to get a 6-digit OTP, or ask an admin to confirm your email.'
          );
        } else if (isNetworkError(signInError)) {
          setError(NETWORK_ERROR_MESSAGE);
        } else if (isInvalidCredentialsError(signInError) && isStagingSupabaseProject()) {
          setError(
            'Staging login failed: user missing, wrong password, or email not confirmed. Confirm the user in Supabase Authentication.'
          );
        } else {
          setError(
            signInError.message ||
              'Sign in failed. Check email, password, and that your account exists in User Management.'
          );
        }
      } else if (data?.session) {
        await finishLoginNavigation(data.session, quickProfile);
      } else {
        setError('Sign in did not return a session. Confirm email in Supabase Authentication or contact admin.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async (e) => {
    e.preventDefault();
    const code = verifyCode.replace(/\D/g, '').slice(0, 6);
    if (code.length !== 6) {
      setError('Please enter the full 6-digit code from your email.');
      return;
    }
    setLoading(true);
    setError('');
    const { data, error: verifyError } = await verifyEmailOtp(email, code);
    if (verifyError) {
      setError(
        isNetworkError(verifyError)
          ? NETWORK_ERROR_MESSAGE
          : verifyError.message || 'Invalid or expired code. Try signing in again to get a new code.'
      );
      setLoading(false);
      return;
    }
    if (data?.session) {
      markSupabaseSessionHydrated();
      await finishLoginNavigation(data.session, null);
    }
    setLoading(false);
  };

  return (
    <div className={`login-hero${theme === 'dark' ? ' is-dark' : ''}`}>
      <div className="login-hero-media" aria-hidden="true">
        <picture>
          <source srcSet={CAMPUS_BG_WEBP} type="image/webp" />
          <img
            className="login-hero-photo"
            src={CAMPUS_BG_JPG}
            alt=""
            width={1920}
            height={1080}
            decoding="async"
            fetchpriority="high"
          />
        </picture>
        <div className="login-hero-scrim" />
        <div className="login-hero-vignette" />
      </div>

      <header className="login-topbar">
        <div className="login-brand">
          <img className="login-brand-logo" src={INDUS_LOGO_SRC} alt="Indus Fire Safety" width={56} height={56} />
          <div className="login-brand-copy">
            <p className="login-brand-title">
              INDUS <span>ERP</span>
            </p>
            <p className="login-brand-sub">Enterprise Resource Platform</p>
          </div>
        </div>

        <div className="login-top-actions">
          <div className="login-theme-toggle" role="group" aria-label="Theme">
            <button
              type="button"
              className={theme === 'light' ? 'is-active' : ''}
              aria-label="Light mode"
              aria-pressed={theme === 'light'}
              onClick={() => setTheme('light')}
            >
              <Sun className="w-4 h-4" strokeWidth={2} />
            </button>
            <button
              type="button"
              className={theme === 'dark' ? 'is-active' : ''}
              aria-label="Dark mode"
              aria-pressed={theme === 'dark'}
              onClick={() => setTheme('dark')}
            >
              <Moon className="w-4 h-4" strokeWidth={2} />
            </button>
          </div>

          {/* Language switcher temporarily hidden
          <div className="login-lang" ref={langMenuRef}>
            <button
              type="button"
              className="login-lang-btn"
              aria-haspopup="listbox"
              aria-expanded={langOpen}
              onClick={() => setLangOpen((v) => !v)}
            >
              <Globe className="w-4 h-4" strokeWidth={2} />
              <span>{activeLang.label}</span>
              <ChevronDown className="w-3.5 h-3.5" strokeWidth={2} />
            </button>
            {langOpen ? (
              <ul className="login-lang-menu" role="listbox" aria-label="Language">
                {LANG_OPTIONS.map((opt) => (
                  <li key={opt.code}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={opt.code === lang}
                      onClick={() => selectLang(opt.code)}
                    >
                      {opt.label}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          */}
        </div>
      </header>

      <div className="login-layout">
        <section className="login-pitch">
          <h1 className="login-headline">
            One Platform.
            <br />
            <span className="login-headline-line">
              Total Operational Control.
              <span className="login-headline-rule" aria-hidden="true" />
            </span>
          </h1>
          <p className="login-lead">
            Powering people, operations, assets, compliance and growth across Indus.
          </p>

          <div className="login-feature-grid">
            {FEATURE_TILES.map(({ title, subtitle, Icon }, index) => (
              <article
                key={title}
                className="login-feature-tile"
                style={{ '--tile-delay': `${80 + index * 55}ms` }}
              >
                <Icon className="login-feature-icon" strokeWidth={1.75} aria-hidden />
                <div>
                  <h2>{title}</h2>
                  <p>{subtitle}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="login-panel" aria-label="Sign in">
          <div className="login-card">
            <div className="login-card-head">
              <h2>
                Welcome to INDUS <span>ERP</span>
              </h2>
              <p>Sign in to access the Enterprise Resource Platform</p>
            </div>

            {showVerifyCode ? (
              <form className="login-form" onSubmit={handleVerifyCode} noValidate>
                <p className="login-form-note">
                  {otpSendStatus === 'sent'
                    ? `Code sent to ${email}. Check inbox and spam.`
                    : otpSendStatus === 'sending'
                      ? `Sending code to ${email}…`
                      : otpSendStatus === 'rate_limited'
                        ? `Too many OTP requests for ${email}. Wait about 1 minute, then resend.`
                        : `Enter the 6-digit code for ${email}, or resend once.`}
                </p>

                <label className="login-field">
                  <span>Verification code</span>
                  <div className="login-input">
                    <Lock className="login-input-icon" strokeWidth={1.75} aria-hidden />
                    <input
                      id="verify-code"
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      value={verifyCode}
                      onChange={(e) => {
                        clearError();
                        setVerifyCode(e.target.value.replace(/\D/g, ''));
                      }}
                      placeholder="000000"
                      autoComplete="one-time-code"
                      autoFocus
                    />
                  </div>
                </label>

                {error ? (
                  <p className="login-error" role="alert" aria-live="polite">
                    {error}
                  </p>
                ) : null}

                <button
                  type="submit"
                  className="login-submit"
                  disabled={loading || verifyCode.replace(/\D/g, '').length !== 6}
                >
                  <span>{loading ? 'Verifying…' : 'Verify and sign in'}</span>
                  <ArrowRight className="w-4 h-4" strokeWidth={2.25} aria-hidden />
                </button>

                <div className="login-otp-actions">
                  <button
                    type="button"
                    className="login-text-btn"
                    disabled={loading || otpSendStatus === 'sending'}
                    onClick={async () => {
                      setLoading(true);
                      setError('');
                      await sendVerificationCode();
                      setLoading(false);
                    }}
                  >
                    Resend code
                  </button>
                  <button
                    type="button"
                    className="login-text-btn"
                    onClick={() => {
                      setShowVerifyCode(false);
                      setVerifyCode('');
                      setError('');
                      setOtpSendStatus('idle');
                    }}
                  >
                    Back to sign in
                  </button>
                </div>
              </form>
            ) : (
              <form className="login-form" onSubmit={handleSubmit} noValidate>
                {successMessage ? (
                  <p className="login-success" role="status" aria-live="polite">
                    {successMessage}
                  </p>
                ) : null}

                <div className="login-audience login-audience--office-only" role="tablist" aria-label="Login type">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={loginAudience === 'office'}
                    className={loginAudience === 'office' ? 'is-active' : ''}
                    onClick={() => selectAudience('office')}
                  >
                    <Building2 className="w-4 h-4" strokeWidth={2} aria-hidden />
                    <span>IFSPL (Office)</span>
                  </button>
                  {/* Site login option temporarily hidden
                  <button
                    type="button"
                    role="tab"
                    aria-selected={loginAudience === 'site'}
                    className={loginAudience === 'site' ? 'is-active' : ''}
                    onClick={() => selectAudience('site')}
                  >
                    <HardHat className="w-4 h-4" strokeWidth={2} aria-hidden />
                    <span>Site</span>
                  </button>
                  */}
                </div>

                <label className="login-field">
                  <span>Email</span>
                  <div className="login-input">
                    <Mail className="login-input-icon" strokeWidth={1.75} aria-hidden />
                    <input
                      ref={emailRef}
                      id="email"
                      name="email"
                      type="email"
                      value={email}
                      onChange={(e) => {
                        clearError();
                        setEmail(e.target.value);
                      }}
                      placeholder="name@indusfiresafety.com"
                      autoComplete="username"
                      autoFocus
                    />
                  </div>
                </label>

                <label className="login-field">
                  <span>Password</span>
                  <div className="login-input">
                    <Lock className="login-input-icon" strokeWidth={1.75} aria-hidden />
                    <input
                      id="password"
                      name="password"
                      type={revealPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => {
                        clearError();
                        setPassword(e.target.value);
                      }}
                      placeholder="••••••••••"
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      className="login-reveal"
                      onClick={() => setRevealPassword((v) => !v)}
                      aria-label={revealPassword ? 'Hide password' : 'Show password'}
                      aria-pressed={revealPassword}
                    >
                      {revealPassword ? (
                        <EyeOff className="w-4 h-4" strokeWidth={1.75} />
                      ) : (
                        <Eye className="w-4 h-4" strokeWidth={1.75} />
                      )}
                    </button>
                  </div>
                </label>

                {error ? (
                  <p className="login-error" role="alert" aria-live="polite">
                    {error}
                  </p>
                ) : null}

                <div className="login-form-row">
                  <label className="login-remember">
                    <input
                      type="checkbox"
                      checked={remember}
                      onChange={(e) => setRemember(e.target.checked)}
                    />
                    <span className="login-remember-box" aria-hidden>
                      {remember ? <Check className="w-3 h-3" strokeWidth={3} /> : null}
                    </span>
                    <span>Remember me</span>
                  </label>
                  <Link className="login-forgot" to="/forgot-password">
                    Forgot password?
                  </Link>
                </div>

                <button type="submit" className="login-submit" disabled={loading}>
                  <span>{loading ? 'Signing in…' : 'Sign In'}</span>
                  <ArrowRight className="w-4 h-4" strokeWidth={2.25} aria-hidden />
                </button>
              </form>
            )}

            <div className="login-card-skyline" aria-hidden="true">
              <svg viewBox="0 0 360 56" preserveAspectRatio="none">
                <rect x="8" y="28" width="18" height="28" rx="2" fill="currentColor" />
                <rect x="34" y="18" width="18" height="38" rx="2" fill="currentColor" />
                <rect x="60" y="24" width="18" height="32" rx="2" fill="currentColor" />
                <rect x="86" y="10" width="22" height="46" rx="2" fill="currentColor" />
                <rect x="116" y="20" width="18" height="36" rx="2" fill="currentColor" />
                <rect x="142" y="14" width="20" height="42" rx="2" fill="currentColor" />
                <rect x="170" y="26" width="16" height="30" rx="2" fill="currentColor" />
                <rect x="194" y="8" width="24" height="48" rx="2" fill="currentColor" />
                <rect x="226" y="18" width="18" height="38" rx="2" fill="currentColor" />
                <rect x="252" y="22" width="16" height="34" rx="2" fill="currentColor" />
                <rect x="276" y="12" width="22" height="44" rx="2" fill="currentColor" />
                <rect x="306" y="24" width="18" height="32" rx="2" fill="currentColor" />
                <rect x="332" y="16" width="20" height="40" rx="2" fill="currentColor" />
              </svg>
            </div>
          </div>
        </section>
      </div>

      {/* Theme toggle helper kept reachable for keyboard users when JS theme state drifts */}
      <button type="button" className="sr-only" onClick={toggleTheme} tabIndex={-1} aria-hidden>
        Toggle theme
      </button>
    </div>
  );
};

export default Login;
