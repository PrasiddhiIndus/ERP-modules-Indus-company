import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { isStagingSupabaseProject } from '../lib/stagingProject';
import {
  markSupabaseSessionHydrated,
  clearSupabaseAuthStorage,
  isCachedAccessTokenExpired,
  readCachedAccessToken,
} from '../lib/authSessionUtils';
import {
  planPostLoginNavigation,
  logLoginStage,
  validateTeamLandingPaths,
  resolveSafeLandingPath,
} from '../lib/loginFlow';
import { getAccessibleModules, MODULES } from '../config/roles';
import { checkSupabaseConnection } from '../lib/supabase';
import { INDUS_LOGO_SRC } from '../constants/branding.js';
import './Login.css';

const REMEMBER_KEY = 'erp_trust_device_until';

/**
 * Public company facts from indusfiresafety.com / company profiles (not marketing placeholders).
 * ISO 27001 / SOC 2 are not claimed publicly — do not show them here.
 */
const COMPANY_PUBLIC = {
  legalName: 'Indus Fire Safety Pvt Ltd',
  foundedYear: 1993,
  /** National footprint stated on company site */
  statesOperated: '26+',
  headquarters: 'Vadodara',
  certifications: ['ISO 9001:2015', 'ISO 14001:2015', 'ISO 45001:2018'],
};

const ERP_MODULE_COUNT = MODULES.length;

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

const NETWORK_ERROR_MESSAGE =
  'Server unreachable. Check your internet, turn off VPN if needed, or restore the project in Supabase Dashboard (free projects pause when inactive).';

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

function formatAuthClock(date = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kolkata',
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(date);
    const get = (type) => parts.find((p) => p.type === type)?.value || '';
    return `${get('weekday')}, ${get('day')} ${get('month')} ${get('year')} · ${get('hour')}:${get('minute')} IST`;
  } catch {
    return date.toUTCString();
  }
}

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
  const [clock, setClock] = useState(() => formatAuthClock());
  const [platformOk, setPlatformOk] = useState(null);
  const [platformLatencyMs, setPlatformLatencyMs] = useState(null);
  const emailRef = useRef(null);

  const yearsOperating = new Date().getFullYear() - COMPANY_PUBLIC.foundedYear;

  const {
    signIn,
    verifyEmailOtp,
    resendConfirmation,
    user,
    userProfile,
    permissionsReady,
    applyLoginProfile,
  } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

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
      clearSupabaseAuthStorage();
    }
    emailRef.current?.focus();
  }, []);

  useEffect(() => {
    const tick = () => setClock(formatAuthClock());
    tick();
    const id = window.setInterval(tick, 30000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const probe = async () => {
      const started = performance.now();
      const result = await checkSupabaseConnection();
      if (cancelled) return;
      setPlatformOk(Boolean(result?.ok));
      setPlatformLatencyMs(Math.round(performance.now() - started));
    };
    probe();
    const id = window.setInterval(probe, 60000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    if (!user?.id || !readCachedAccessToken() || isCachedAccessTokenExpired()) return;
    if (!permissionsReady || !userProfile) return;
    const mods = getAccessibleModules(userProfile);
    const path = resolveSafeLandingPath(userProfile, mods);
    logLoginStage('already-authenticated-redirect', { path, userId: user.id });
    navigate(path, { replace: true });
  }, [user, userProfile, permissionsReady, navigate]);

  const clearError = () => {
    if (error) setError('');
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
      logLoginStage('redirect-failed', { error: result.error });
      setError(result.error);
      return false;
    }
    applyLoginProfile(result.profile, session.user.id);
    if (result.warning) {
      logLoginStage('redirect-warning', { warning: result.warning });
    }
    logLoginStage('navigate', { path: result.path });
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

    try {
      const { data, error: signInError, profile: quickProfile } = await signIn(trimmed, password);
      if (signInError) {
        if (isEmailNotConfirmedError(signInError)) {
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

  const nodeLabel = useMemo(
    () => (isStagingSupabaseProject() ? 'Region staging' : 'Region ap-south-1'),
    []
  );

  return (
    <div className="auth-shell">
      <header className="auth-header">
        <div className="auth-header-left">
          <img className="auth-logo" src={INDUS_LOGO_SRC} alt="Indus Fire Safety" width={46} height={46} />
          <div className="auth-brand-stack">
            <p className="auth-brand-name">INDUS ERP</p>
            <p className="auth-brand-sub">{COMPANY_PUBLIC.legalName}</p>
          </div>
          <span className="auth-header-divider" aria-hidden>
            |
          </span>
          <span className="auth-header-mode">Authentication</span>
        </div>
        <div className="auth-header-right">
          <time dateTime={new Date().toISOString()}>{clock}</time>
          <span aria-hidden>|</span>
          <span>{nodeLabel}</span>
        </div>
      </header>

      <div className="auth-body">
        <aside className="auth-spine" aria-hidden="true">
          <div className="auth-spine-bars">
            <span />
            <span />
            <span />
          </div>
          <p className="auth-spine-label">Enterprise resource platform</p>
          <p className="auth-spine-ver">v4.2.1</p>
        </aside>

        <main className="auth-main">
          <p className="auth-eyebrow">Restricted · credentialed access</p>
          <h1 className="auth-headline">
            Open the
            <br />
            command centre.
          </h1>

          {showVerifyCode ? (
            <form className="auth-ledger" onSubmit={handleVerifyCode} noValidate>
              <div className="auth-step">
                <div className="auth-step-num is-input">01</div>
                <div className="auth-step-body">
                  <div className="auth-label-row">
                    <label className="auth-label" htmlFor="verify-code">
                      Verification code
                    </label>
                  </div>
                  <p className="auth-success-msg" style={{ marginBottom: 12 }}>
                    {otpSendStatus === 'sent'
                      ? `Code sent to ${email}. Check inbox and spam.`
                      : otpSendStatus === 'sending'
                        ? `Sending code to ${email}…`
                        : otpSendStatus === 'rate_limited'
                          ? `Too many OTP requests for ${email}. Wait about 1 minute, then resend.`
                          : `Enter the 6-digit code for ${email}, or resend once.`}
                  </p>
                  <div className="auth-field">
                    <span className="auth-field-glyph" aria-hidden>
                      ›
                    </span>
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
                </div>
              </div>

              {error ? (
                <div className="auth-step" role="alert" aria-live="polite">
                  <div className="auth-step-num is-error">!!</div>
                  <div className="auth-step-body">
                    <p className="auth-error-msg">{error}</p>
                  </div>
                </div>
              ) : null}

              <div className="auth-step">
                <div className="auth-step-num">02</div>
                <div className="auth-step-body">
                  <button
                    type="submit"
                    className="auth-submit"
                    disabled={loading || verifyCode.replace(/\D/g, '').length !== 6}
                  >
                    <span>{loading ? 'Verifying credentials' : 'Verify and sign in'}</span>
                    <span className="auth-submit-arrow" aria-hidden>
                      →
                    </span>
                  </button>
                  <div className="auth-otp-actions">
                    <button
                      type="button"
                      className="auth-text-btn"
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
                      className="auth-text-btn"
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
                </div>
              </div>
            </form>
          ) : (
            <form className="auth-ledger" onSubmit={handleSubmit} noValidate>
              {successMessage ? (
                <div className="auth-step" role="status" aria-live="polite">
                  <div className="auth-step-num is-input">··</div>
                  <div className="auth-step-body">
                    <p className="auth-success-msg">{successMessage}</p>
                  </div>
                </div>
              ) : null}

              <div className="auth-step">
                <div className="auth-step-num is-input">01</div>
                <div className="auth-step-body">
                  <div className="auth-label-row">
                    <label className="auth-label" htmlFor="email">
                      Work email
                    </label>
                  </div>
                  <div className="auth-field">
                    <span className="auth-field-glyph" aria-hidden>
                      ›
                    </span>
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
                      placeholder="name@company.com"
                      autoComplete="username"
                      autoFocus
                    />
                  </div>
                </div>
              </div>

              <div className="auth-step">
                <div className="auth-step-num is-input">02</div>
                <div className="auth-step-body">
                  <div className="auth-label-row">
                    <label className="auth-label" htmlFor="password">
                      Password
                    </label>
                    <button
                      type="button"
                      className="auth-reveal"
                      onClick={() => setRevealPassword((v) => !v)}
                      aria-pressed={revealPassword}
                    >
                      {revealPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                  <div className="auth-field">
                    <span className="auth-field-glyph" aria-hidden>
                      ›
                    </span>
                    <input
                      id="password"
                      name="password"
                      type={revealPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => {
                        clearError();
                        setPassword(e.target.value);
                      }}
                      placeholder="••••••••••••"
                      autoComplete="current-password"
                    />
                  </div>
                </div>
              </div>

              {error ? (
                <div className="auth-step" role="alert" aria-live="polite">
                  <div className="auth-step-num is-error">!!</div>
                  <div className="auth-step-body">
                    <p className="auth-error-msg">{error}</p>
                  </div>
                </div>
              ) : null}

              <div className="auth-step">
                <div className="auth-step-num">03</div>
                <div className="auth-step-body">
                  <div className="auth-trust-row">
                    <label className="auth-check">
                      <input
                        type="checkbox"
                        checked={remember}
                        onChange={(e) => setRemember(e.target.checked)}
                      />
                      Trust this device for 30 days
                    </label>
                    <Link className="auth-reset" to="/forgot-password">
                      Reset password
                    </Link>
                  </div>
                </div>
              </div>

              <div className="auth-step">
                <div className="auth-step-num">04</div>
                <div className="auth-step-body">
                  <button type="submit" className="auth-submit" disabled={loading}>
                    <span>{loading ? 'Verifying credentials' : 'Sign in'}</span>
                    <span className="auth-submit-arrow" aria-hidden>
                      →
                    </span>
                  </button>
                </div>
              </div>

              <div className="auth-step">
                <div className="auth-step-num">05</div>
                <div className="auth-step-body">
                  <div className="auth-sso-row">
                    <span>Federated identity</span>
                    <button
                      type="button"
                      className="auth-sso-btn"
                      onClick={() =>
                        setError('SSO is not enabled for this tenant. Sign in with work email and password.')
                      }
                    >
                      Continue with SSO
                    </button>
                  </div>
                </div>
              </div>
            </form>
          )}

          <div className="auth-mobile-strip" aria-label="Tenant summary">
            <div className="auth-cell">
              <p className="auth-cell-label">Tenant</p>
              <p className="auth-cell-value">{COMPANY_PUBLIC.legalName}</p>
            </div>
            <div className="auth-cell">
              <p className="auth-cell-label">States</p>
              <p className="auth-stat">{COMPANY_PUBLIC.statesOperated}</p>
            </div>
            <div className="auth-cell">
              <p className="auth-cell-label">Modules</p>
              <p className="auth-stat">{ERP_MODULE_COUNT}</p>
            </div>
          </div>
        </main>

        <aside className="auth-aside" aria-label="Platform information">
          <div className="auth-cell">
            <p className="auth-cell-label">Tenant</p>
            <p className="auth-cell-value">{COMPANY_PUBLIC.legalName}</p>
          </div>
          <div className="auth-cell-split">
            <div className="auth-cell">
              <p className="auth-cell-label">States</p>
              <p className="auth-stat">{COMPANY_PUBLIC.statesOperated}</p>
            </div>
            <div className="auth-cell">
              <p className="auth-cell-label">Modules</p>
              <p className="auth-stat">{ERP_MODULE_COUNT}</p>
            </div>
          </div>
          <div className="auth-cell">
            <p className="auth-cell-label">Since</p>
            <p className="auth-cell-value">
              {COMPANY_PUBLIC.foundedYear} · {yearsOperating} years
            </p>
          </div>
          <div className="auth-cell">
            <p className="auth-cell-label">Platform status</p>
            <p className="auth-status-line">
              <span
                className={`auth-status-dot${platformOk === false ? ' is-down' : ''}${platformOk === null ? ' is-pending' : ''}`}
                aria-hidden
              />
              {platformOk === null
                ? 'Checking auth service…'
                : platformOk
                  ? 'Auth service reachable'
                  : 'Auth service unreachable'}
            </p>
            <p className="auth-uptime-caption">
              {platformLatencyMs != null
                ? `Live check · ${platformLatencyMs} ms · Asia/Kolkata`
                : 'Live check · waiting'}
            </p>
          </div>
          <div className="auth-cell">
            <p className="auth-cell-label">Compliance</p>
            <ul className="auth-compliance">
              {COMPANY_PUBLIC.certifications.map((item) => (
                <li key={item}>{item}</li>
              ))}
              <li>Headquarters · {COMPANY_PUBLIC.headquarters}</li>
            </ul>
          </div>
        </aside>
      </div>

      <footer className="auth-footer">
        <p>Unauthorised access is logged and audited.</p>
        <div className="auth-footer-links">
          <a href="mailto:support@indusfiresafety.com">Support</a>
          <span>·</span>
          <a href="#status">Status</a>
          <span>·</span>
          <a href="#privacy">Privacy</a>
        </div>
      </footer>
    </div>
  );
};

export default Login;
