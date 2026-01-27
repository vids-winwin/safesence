'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useDarkMode } from '../DarkModeContext';
// Custom authentication - no longer using Supabase
console.log('Google Client ID:', process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID);

// Authentication helper functions
const checkAuth = async () => {
  try {
    const token = localStorage.getItem('auth-token');
    if (!token) return null;
    
    const response = await fetch('/api/verify-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    });
    
    if (response.ok) {
      const data = await response.json();
      return data.user;
    }
    return null;
  } catch (error) {
    console.error('Auth check error:', error);
    return null;
  }
};

export default function Home() {
  const { darkMode } = useDarkMode();
  const [isSignup, setIsSignup] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [error, setError] = useState('');

  // Forgot password flow states
  const [showResetOTP, setShowResetOTP] = useState(false);
  const [resetOTP, setResetOTP] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [retypeNewPassword, setRetypeNewPassword] = useState('');
  const [showNewPasswordField, setShowNewPasswordField] = useState(false);
  const [showRetypeNewPasswordField, setShowRetypeNewPasswordField] = useState(false);
  const [isRequestingReset, setIsRequestingReset] = useState(false);
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [resetOTPResendCooldown, setResetOTPResendCooldown] = useState(0);

  // Signup state
  const [signupName, setSignupName] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupReenterPassword, setSignupReenterPassword] = useState('');
  const [signupMessage, setSignupMessage] = useState('');
  const [showSignupPassword, setShowSignupPassword] = useState(false);
  const [showSignupRePassword, setShowSignupRePassword] = useState(false);
  const [isSignupLoading, setIsSignupLoading] = useState(false);
  const [showOTPVerification, setShowOTPVerification] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [signupToken, setSignupToken] = useState('');
  const [isVerifyingOTP, setIsVerifyingOTP] = useState(false);
  const [otpResendCooldown, setOtpResendCooldown] = useState(0);

  // Login state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginMessage, setLoginMessage] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showResendOption, setShowResendOption] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [deviceFingerprint, setDeviceFingerprint] = useState('');

  const router = useRouter();

  // Prevent scrolling issues on login page
  useEffect(() => {
    // Prevent body scroll and fix viewport
    document.body.style.overflow = 'hidden';
    document.body.style.height = '100vh';
    document.body.style.position = 'fixed';
    document.body.style.width = '100%';
    
    // Cleanup on unmount
    return () => {
      document.body.style.overflow = '';
      document.body.style.height = '';
      document.body.style.position = '';
      document.body.style.width = '';
    };
  }, []);

  // Redirect logged-in users
  useEffect(() => {
    const checkSession = async () => {
      try {
        console.log('Checking session...');
        const user = await checkAuth();
        if (user) {
          console.log('Session found, redirecting to dashboard');
          router.push('/dashboard');
        }
      } catch (err) {
        console.error('Session check error:', err.message);
        setError(
          err.message === 'Failed to fetch'
            ? 'Unable to connect to authentication server. Please check your network or contact support.'
            : 'Failed to verify session: ' + err.message
        );
      }
    };
    checkSession();
  }, [router]);

  // Google Sign-In
  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID) {
      console.warn('Google Client ID is missing. Google Sign-In will not work.');
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (window.google) {
        console.log('Google Sign-In script loaded');
        window.google.accounts.id.initialize({
          client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
          callback: handleCredentialResponse,
        });
      } else {
        console.error('Google Sign-In script loaded but window.google is undefined');
      }
    };
    script.onerror = () => console.error('Failed to load Google Sign-In script');
    document.body.appendChild(script);
    return () => document.body.removeChild(script);
  }, []);

  const handleCredentialResponse = async (response) => {
    const idToken = response.credential;
    console.log('Google ID Token received');
    setError('');
    setLoginMessage('');

    try {
      const res = await fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: idToken })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'Google login failed');
      }

      console.log('Google login successful:', data);
      
      // Store token and redirect
      if (data.token) {
        localStorage.setItem('auth-token', data.token);
        setLoginMessage('Logged in successfully! Redirecting...');
        setTimeout(() => router.push('/dashboard'), 1000);
      } else {
        setLoginMessage('Login successful! Please try again.');
      }
    } catch (error) {
      console.error('Google login error:', error);
      setError('Google login failed: ' + error.message);
    }
  };

  const handleGoogleSignIn = async () => {
    // Trigger Google Sign-In button click
    if (window.google && window.google.accounts) {
      window.google.accounts.id.prompt();
    } else {
      setError('Google Sign-In is not available. Please refresh the page.');
    }
  };

  // Signup - Step 1: Send OTP
  const handleSignup = async (e) => {
    e.preventDefault();
    
    // Prevent double clicks
    if (isSignupLoading) {
      return;
    }
    
    setSignupMessage('');
    setError('');
    setIsSignupLoading(true);

    // Validation
    if (!signupName || signupName.trim().length < 2) {
      setSignupMessage('Name must be at least 2 characters');
      setIsSignupLoading(false);
      return;
    }

    if (!signupEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(signupEmail)) {
      setSignupMessage('Valid email is required');
      setIsSignupLoading(false);
      return;
    }

    if (!signupPassword || signupPassword.length < 8) {
      setSignupMessage('Password must be at least 8 characters');
      setIsSignupLoading(false);
      return;
    }

    if (signupPassword !== signupReenterPassword) {
      setSignupMessage('Passwords do not match');
      setIsSignupLoading(false);
      return;
    }

    // Password strength check
    const hasUpperCase = /[A-Z]/.test(signupPassword);
    const hasLowerCase = /[a-z]/.test(signupPassword);
    const hasNumbers = /\d/.test(signupPassword);

    if (!hasUpperCase || !hasLowerCase || !hasNumbers) {
      setSignupMessage('Password must contain uppercase, lowercase, and numbers');
      setIsSignupLoading(false);
      return;
    }

    try {
      console.log('Attempting signup:', { name: signupName, email: signupEmail });
      const response = await fetch('/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: signupName,
          email: signupEmail,
          password: signupPassword,
          retypePassword: signupReenterPassword
        })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || 'Signup failed');
      }
      
      console.log('OTP sent successfully:', data);
      
      // Store signup token and move to OTP verification
      if (data.signupToken) {
        setSignupToken(data.signupToken);
        setShowOTPVerification(true);
        setSignupMessage('');
        setOtpResendCooldown(60); // 60 second cooldown
        // Start countdown
        const countdown = setInterval(() => {
          setOtpResendCooldown((prev) => {
            if (prev <= 1) {
              clearInterval(countdown);
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      } else {
        setSignupMessage('Failed to initiate signup. Please try again.');
      }
    } catch (error) {
      console.error('Signup error:', error.message);
      setSignupMessage(
        error.message === 'Failed to fetch'
          ? 'Unable to connect to authentication server. Please check your network or contact support.'
          : error.message.includes('already exists') || error.message.includes('User already')
          ? 'An account with this email already exists. Please try logging in instead.'
          : 'Signup failed: ' + error.message
      );
    } finally {
      setIsSignupLoading(false);
    }
  };

  // Signup - Step 2: Verify OTP
  const handleVerifyOTP = async (e) => {
    e.preventDefault();
    
    if (isVerifyingOTP) {
      return;
    }

    if (!otpCode || !/^\d{6}$/.test(otpCode)) {
      setSignupMessage('Please enter a valid 6-digit code');
      return;
    }

    setIsVerifyingOTP(true);
    setSignupMessage('');

    try {
      const response = await fetch('/api/signup/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: signupEmail,
          otp: otpCode,
          signupToken: signupToken
        })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || 'Verification failed');
      }
      
      console.log('Account created successfully:', data);
      
      // Store token and redirect
      if (data.token) {
        localStorage.setItem('auth-token', data.token);
        setSignupMessage('Account created successfully! Redirecting...');
        setTimeout(() => {
          router.push('/dashboard');
        }, 1000);
      } else {
        setSignupMessage('Account created! Please log in.');
        setTimeout(() => {
          setIsSignup(false);
          setShowOTPVerification(false);
          setOtpCode('');
          setSignupToken('');
        }, 2000);
      }
    } catch (error) {
      console.error('OTP verification error:', error.message);
      setSignupMessage(error.message || 'Verification failed. Please try again.');
      setOtpCode(''); // Clear OTP on error
    } finally {
      setIsVerifyingOTP(false);
    }
  };

  // Resend OTP
  const handleResendOTP = async () => {
    if (otpResendCooldown > 0) {
      return;
    }

    setIsSignupLoading(true);
    setSignupMessage('');

    try {
      const response = await fetch('/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: signupName,
          email: signupEmail,
          password: signupPassword,
          retypePassword: signupReenterPassword
        })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || 'Failed to resend code');
      }
      
      if (data.signupToken) {
        setSignupToken(data.signupToken);
        setSignupMessage('Verification code resent! Please check your email.');
        setOtpResendCooldown(60);
        const countdown = setInterval(() => {
          setOtpResendCooldown((prev) => {
            if (prev <= 1) {
              clearInterval(countdown);
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      }
    } catch (error) {
      setSignupMessage(error.message || 'Failed to resend code. Please try again.');
    } finally {
      setIsSignupLoading(false);
    }
  };

  // Generate device fingerprint on mount
  useEffect(() => {
    const generateFingerprint = async () => {
      try {
        const userAgent = navigator.userAgent;
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        ctx.textBaseline = 'top';
        ctx.font = '14px Arial';
        ctx.fillText('Device fingerprint', 2, 2);
        const canvasFingerprint = canvas.toDataURL();
        
        const fingerprint = await crypto.subtle.digest(
          'SHA-256',
          new TextEncoder().encode(`${userAgent}|${canvasFingerprint}|${screen.width}x${screen.height}`)
        ).then(hash => 
          Array.from(new Uint8Array(hash))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('')
        );
        
        setDeviceFingerprint(fingerprint);
      } catch (error) {
        console.error('Failed to generate device fingerprint:', error);
        // Fallback to simple hash
        const simpleHash = btoa(navigator.userAgent + screen.width + screen.height).substring(0, 64);
        setDeviceFingerprint(simpleHash);
      }
    };
    generateFingerprint();
  }, []);

  // Login - Step 1: Initial login attempt
  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginMessage('');
    setError('');

    if (!loginEmail || !loginPassword) {
      setLoginMessage('Email and password are required');
      return;
    }

    try {
      console.log('Attempting login:', { email: loginEmail });
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: loginEmail,
          password: loginPassword,
          deviceFingerprint: deviceFingerprint
        })
      });
      
      let data;
      try {
        data = await response.json();
      } catch (parseError) {
        throw new Error('Failed to parse server response');
      }
      
      if (!response.ok) {
        const error = new Error(data.message || 'Login failed');
        error.code = data.code;
        throw error;
      }
      
      console.log('Login successful:', data);
      
      // Store token and redirect
      if (data.token) {
        localStorage.setItem('auth-token', data.token);
        setLoginMessage('Logged in successfully! Redirecting...');
        setTimeout(() => router.push('/dashboard'), 1000);
      } else {
        setLoginMessage('Login successful! Please try again.');
      }
    } catch (error) {
      console.error('Login error:', error.message);
      
      const errorMessage = error.message || 'Login failed';
      const errorCode = error.code;
      
      // Check if error is about email verification
      const isVerificationError = errorMessage.includes('verify your email') || 
                                 errorMessage.includes('email before logging in') ||
                                 errorCode === 'VERIFICATION_REQUIRED';
      
      if (isVerificationError) {
        setShowResendOption(true);
      } else {
        setShowResendOption(false);
      }
      
      // Handle different error types
      if (error.message === 'Failed to fetch' || errorCode === 'DATABASE_ERROR') {
        setLoginMessage('Unable to connect to the server. Please check your network connection or try again later.');
      } else if (errorMessage.includes('Invalid') || errorMessage.includes('credentials')) {
        setLoginMessage('Invalid email or password. Please try again.');
      } else if (errorMessage.includes('database') || errorMessage.includes('server') || errorMessage.includes('Can\'t reach')) {
        setLoginMessage('Server connection error. Please try again later or contact support.');
      } else {
        setLoginMessage('Login failed: ' + errorMessage);
      }
    }
  };

  // Resend Verification Email
  const handleResendVerification = async () => {
    if (!loginEmail) {
      setLoginMessage('Please enter your email address first');
      return;
    }
    
    setIsResending(true);
    setLoginMessage('');
    
    try {
      const response = await fetch('/api/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || 'Failed to resend verification email');
      }
      
      setLoginMessage('Verification email sent! Please check your inbox.');
      setShowResendOption(false);
    } catch (error) {
      console.error('Resend verification error:', error.message);
      setLoginMessage('Failed to resend verification email: ' + error.message);
    } finally {
      setIsResending(false);
    }
  };

  // Forgot Password - Step 1: Request OTP
  const handleForgotPassword = async (e) => {
    e.preventDefault();
    setError('');

    if (!resetEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(resetEmail)) {
      setError('Please enter a valid email address');
      return;
    }

    if (isRequestingReset) {
      return;
    }

    setIsRequestingReset(true);
    setError('');

    try {
      console.log('Requesting password reset:', resetEmail);
      const response = await fetch('/api/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: resetEmail })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to send reset code');
      }

      // Move to OTP verification step
      setShowResetOTP(true);
      setError('');
      setResetOTPResendCooldown(60); // 60 second cooldown
      
      // Start countdown
      const countdown = setInterval(() => {
        setResetOTPResendCooldown((prev) => {
          if (prev <= 1) {
            clearInterval(countdown);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch (error) {
      console.error('Password reset request error:', error.message);
      setError(
        error.message === 'Failed to fetch'
          ? 'Unable to connect to authentication server. Please check your network or contact support.'
          : error.message
      );
    } finally {
      setIsRequestingReset(false);
    }
  };

  // Forgot Password - Step 2: Validate OTP format and move to next step (verify later)
  const handleVerifyResetOTP = async (e) => {
    e.preventDefault();

    if (!resetOTP || !/^\d{6}$/.test(resetOTP)) {
      setError('Please enter a valid 6-digit code');
      return;
    }

    // Just move to password reset step - OTP will be verified when password is submitted
    setShowResetOTP(false);
    setShowNewPassword(true);
    setError('');
  };

  // Forgot Password - Step 3: Set New Password
  const handleResetPassword = async (e) => {
    e.preventDefault();
    
    if (isResettingPassword) {
      return;
    }

    setError('');

    // Validation
    if (!newPassword || newPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    if (newPassword !== retypeNewPassword) {
      setError('Passwords do not match');
      return;
    }

    // Password strength check
    const hasUpperCase = /[A-Z]/.test(newPassword);
    const hasLowerCase = /[a-z]/.test(newPassword);
    const hasNumbers = /\d/.test(newPassword);

    if (!hasUpperCase || !hasLowerCase || !hasNumbers) {
      setError('Password must contain uppercase, lowercase, and numbers');
      return;
    }

    setIsResettingPassword(true);
    setError('');

    try {
      const response = await fetch('/api/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: resetEmail,
          otp: resetOTP,
          newPassword: newPassword,
          retypePassword: retypeNewPassword
        })
      });

      let data;
      try {
        data = await response.json();
      } catch (parseError) {
        throw new Error('Failed to parse server response');
      }

      if (!response.ok) {
        throw new Error(data.message || data.error || 'Failed to reset password');
      }

      // Success - close modal and show success message
      setError('');
      setShowForgotPassword(false);
      setShowResetOTP(false);
      setShowNewPassword(false);
      setResetEmail('');
      setResetOTP('');
      setNewPassword('');
      setRetypeNewPassword('');
      setResetOTPResendCooldown(0);
      
      // Show success message in login form
      setLoginMessage('Password reset successful! You can now log in with your new password.');
      setTimeout(() => {
        setLoginMessage('');
      }, 5000);
    } catch (error) {
      console.error('Password reset error:', error);
      console.error('Error details:', {
        message: error.message,
        stack: error.stack
      });
      setError(error.message || 'Failed to reset password. Please try again.');
    } finally {
      setIsResettingPassword(false);
    }
  };

  // Resend Reset OTP
  const handleResendResetOTP = async () => {
    if (resetOTPResendCooldown > 0) {
      return;
    }

    setIsRequestingReset(true);
    setError('');

    try {
      const response = await fetch('/api/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: resetEmail })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to resend code');
      }

      setError('');
      setResetOTPResendCooldown(60);
      const countdown = setInterval(() => {
        setResetOTPResendCooldown((prev) => {
          if (prev <= 1) {
            clearInterval(countdown);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch (error) {
      setError(error.message || 'Failed to resend code. Please try again.');
    } finally {
      setIsRequestingReset(false);
    }
  };

  const styles = getStyles(darkMode);

  return (
    <main style={styles.main}>
      <div style={styles.contentWrapper}>
        {/* Left side */}
        <div style={styles.welcomeText}>
          <div style={styles.logo}>
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" style={styles.logoImage}>
              <rect width="32" height="32" rx="8" fill="#F97316" />
              <circle cx="16" cy="16" r="10" stroke="#FFFFFF" strokeWidth="2" />
            </svg>
            <span style={styles.logoText}>Safe Sense</span>
          </div>
          {!isSignup ? (
            <>
              <p style={styles.subtitleBold}>Welcome back to Safe Sense</p>
              <p style={styles.subtitle}>Stay connected. Stay protected.</p>
            </>
          ) : (
            <>
              <p style={styles.subtitleBold}>Create An Account to Start your Journey</p>
              <p style={styles.subtitle}>with Safe Sense</p>
            </>
          )}
        </div>

        {/* Right side: Card */}
        <div style={styles.card}>
          {!isSignup ? (
            <>
              <form onSubmit={handleLogin}>
                <label style={styles.label}>Email</label>
                <input
                  type="email"
                  placeholder="Email"
                  style={styles.input}
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  required
                />
                <label style={styles.label}>Password</label>
                <div style={styles.passwordWrapper}>
                  <input
                    type={showLoginPassword ? 'text' : 'password'}
                    placeholder="Password"
                    style={styles.input}
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    required
                  />
                  <span style={styles.eyeIcon} onClick={() => setShowLoginPassword(!showLoginPassword)}>
                    {showLoginPassword ? '🙈' : '👁️'}
                  </span>
                </div>
                <a href="#forgot" onClick={() => setShowForgotPassword(true)} style={styles.linkRight}>
                  Forgot Password?
                </a>
                <button style={styles.loginBtn} type="submit">
                  Log in
                </button>
              </form>
              {loginMessage && <p style={styles.message}>{loginMessage}</p>}
              {error && <p style={styles.error}>{error}</p>}
              {showResendOption && (
                <div style={styles.resendContainer}>
                  <button 
                    style={{
                      ...styles.resendBtn,
                      ...(isResending ? styles.resendBtnDisabled : {})
                    }}
                    onClick={handleResendVerification}
                    disabled={isResending}
                  >
                    {isResending ? 'Sending...' : 'Resend Verification Email'}
                  </button>
                </div>
              )}
              <div style={styles.or}>or</div>
              <button style={styles.googleBtn} onClick={handleGoogleSignIn}>
                Sign-in with Google
              </button>
              <div style={styles.links}>
                <a href="#signup" onClick={() => setIsSignup(true)} style={styles.link}>
                  Not a Member? Sign-up
                </a>
              </div>
            </>
          ) : (
            <>
              {!showOTPVerification ? (
            <>
              <form onSubmit={handleSignup}>
                    <label style={styles.label}>Name</label>
                    <input
                      type="text"
                      placeholder="Your full name"
                      style={styles.input}
                      value={signupName}
                      onChange={(e) => setSignupName(e.target.value)}
                      required
                      disabled={isSignupLoading}
                    />
                <label style={styles.label}>Email</label>
                <input
                  type="email"
                  placeholder="Email"
                  style={styles.input}
                  value={signupEmail}
                  onChange={(e) => setSignupEmail(e.target.value)}
                  required
                      disabled={isSignupLoading}
                />
                <label style={styles.label}>Password</label>
                <div style={styles.passwordWrapper}>
                  <input
                    type={showSignupPassword ? 'text' : 'password'}
                        placeholder="Password (min 8 chars, uppercase, lowercase, numbers)"
                    style={styles.input}
                    value={signupPassword}
                    onChange={(e) => setSignupPassword(e.target.value)}
                    required
                        disabled={isSignupLoading}
                  />
                  <span style={styles.eyeIcon} onClick={() => setShowSignupPassword(!showSignupPassword)}>
                    {showSignupPassword ? '🙈' : '👁️'}
                  </span>
                </div>
                <label style={styles.label}>Re-enter Password</label>
                <div style={styles.passwordWrapper}>
                  <input
                    type={showSignupRePassword ? 'text' : 'password'}
                    placeholder="Re-enter Password"
                    style={styles.input}
                    value={signupReenterPassword}
                    onChange={(e) => setSignupReenterPassword(e.target.value)}
                    required
                        disabled={isSignupLoading}
                  />
                  <span style={styles.eyeIcon} onClick={() => setShowSignupRePassword(!showSignupRePassword)}>
                    {showSignupRePassword ? '🙈' : '👁️'}
                  </span>
                </div>
                <button 
                  style={{
                    ...styles.loginBtn,
                    ...(isSignupLoading ? styles.loginBtnDisabled : {})
                  }} 
                  type="submit"
                  disabled={isSignupLoading}
                >
                      {isSignupLoading ? 'Sending Code...' : 'Create Account'}
                </button>
              </form>
              {signupMessage && <p style={styles.message}>{signupMessage}</p>}
              {error && <p style={styles.error}>{error}</p>}
              <div style={styles.or}>or</div>
              <button style={styles.googleBtn} onClick={handleGoogleSignIn}>
                Sign-in with Google
              </button>
              <div style={styles.links}>
                <a href="#login" onClick={() => setIsSignup(false)} style={styles.link}>
                  Already a member? Sign-in
                </a>
              </div>
                </>
              ) : (
                <>
                  <div style={{ marginBottom: '1rem' }}>
                    <h3 style={{ ...styles.subtitleBold, marginBottom: '0.5rem' }}>Verify Your Email</h3>
                    <p style={{ ...styles.subtitle, fontSize: '0.875rem' }}>
                      We sent a 6-digit code to <strong>{signupEmail}</strong>
                    </p>
                  </div>
                  <form onSubmit={handleVerifyOTP}>
                    <label style={styles.label}>Enter Verification Code</label>
                    <input
                      type="text"
                      placeholder="000000"
                      style={{
                        ...styles.input,
                        textAlign: 'center',
                        fontSize: '1.5rem',
                        letterSpacing: '0.5rem',
                        fontFamily: 'monospace'
                      }}
                      value={otpCode}
                      onChange={(e) => {
                        const value = e.target.value.replace(/\D/g, '').slice(0, 6);
                        setOtpCode(value);
                      }}
                      maxLength={6}
                      required
                      disabled={isVerifyingOTP}
                      autoFocus
                    />
                    <button 
                      style={{
                        ...styles.loginBtn,
                        ...(isVerifyingOTP ? styles.loginBtnDisabled : {})
                      }} 
                      type="submit"
                      disabled={isVerifyingOTP || otpCode.length !== 6}
                    >
                      {isVerifyingOTP ? 'Verifying...' : 'Verify & Create Account'}
                    </button>
                  </form>
                  {signupMessage && <p style={styles.message}>{signupMessage}</p>}
                  {error && <p style={styles.error}>{error}</p>}
                  <div style={{ textAlign: 'center', marginTop: '1rem' }}>
                    <p style={{ ...styles.subtitle, fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                      Did not receive the code?
                    </p>
                    <button
                      onClick={handleResendOTP}
                      disabled={otpResendCooldown > 0 || isSignupLoading}
                      style={{
                        ...styles.resendBtn,
                        ...(otpResendCooldown > 0 || isSignupLoading ? styles.resendBtnDisabled : {})
                      }}
                    >
                      {otpResendCooldown > 0 
                        ? `Resend in ${otpResendCooldown}s` 
                        : 'Resend Code'}
                    </button>
                  </div>
                  <div style={styles.links}>
                    <a 
                      href="#back" 
                      onClick={() => {
                        setShowOTPVerification(false);
                        setOtpCode('');
                        setSignupToken('');
                        setOtpResendCooldown(0);
                      }} 
                      style={styles.link}
                    >
                      ← Back to signup
                    </a>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* Forgot Password Modal */}
      {showForgotPassword && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalContent}>
            {!showResetOTP && !showNewPassword ? (
              <>
            <h2 style={styles.modalTitle}>Reset Password</h2>
                <p style={{ ...styles.subtitle, marginBottom: '1rem', fontSize: '0.875rem' }}>
                  Enter your email address and we will send you a verification code to reset your password.
                </p>
            <form onSubmit={handleForgotPassword} style={styles.form}>
                  <label style={styles.label}>Email</label>
              <input
                type="email"
                placeholder="Email"
                style={styles.input}
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                required
                    disabled={isRequestingReset}
              />
              {error && <p style={styles.error}>{error}</p>}
                  <button 
                    type="submit" 
                    style={{
                      ...styles.loginBtn,
                      ...(isRequestingReset ? styles.loginBtnDisabled : {})
                    }}
                    disabled={isRequestingReset}
                  >
                    {isRequestingReset ? 'Sending Code...' : 'Send Verification Code'}
              </button>
                  <button 
                    type="button" 
                    style={styles.closeBtn} 
                    onClick={() => {
                      setShowForgotPassword(false);
                      setResetEmail('');
                      setError('');
                      setShowResetOTP(false);
                      setShowNewPassword(false);
                      setResetOTP('');
                      setNewPassword('');
                      setRetypeNewPassword('');
                      setResetOTPResendCooldown(0);
                    }}
                  >
                Cancel
              </button>
            </form>
              </>
            ) : showResetOTP && !showNewPassword ? (
              <>
                <h2 style={styles.modalTitle}>Verify Your Email</h2>
                <p style={{ ...styles.subtitle, marginBottom: '1rem', fontSize: '0.875rem' }}>
                  We sent a 6-digit code to <strong>{resetEmail}</strong>
                </p>
                <form onSubmit={handleVerifyResetOTP} style={styles.form}>
                  <label style={styles.label}>Enter Verification Code</label>
                  <input
                    type="text"
                    placeholder="000000"
                    style={{
                      ...styles.input,
                      textAlign: 'center',
                      fontSize: '1.5rem',
                      letterSpacing: '0.5rem',
                      fontFamily: 'monospace'
                    }}
                    value={resetOTP}
                    onChange={(e) => {
                      const value = e.target.value.replace(/\D/g, '').slice(0, 6);
                      setResetOTP(value);
                    }}
                    maxLength={6}
                    required
                    autoFocus
                  />
                  {error && <p style={styles.error}>{error}</p>}
                  <button 
                    type="submit" 
                    style={styles.loginBtn}
                    disabled={resetOTP.length !== 6}
                  >
                    Continue
                  </button>
                  <div style={{ textAlign: 'center', marginTop: '1rem' }}>
                    <p style={{ ...styles.subtitle, fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                      Did not receive the code?
                    </p>
                    <button
                      type="button"
                      onClick={handleResendResetOTP}
                      disabled={resetOTPResendCooldown > 0 || isRequestingReset}
                      style={{
                        ...styles.resendBtn,
                        ...(resetOTPResendCooldown > 0 || isRequestingReset ? styles.resendBtnDisabled : {})
                      }}
                    >
                      {resetOTPResendCooldown > 0 
                        ? `Resend in ${resetOTPResendCooldown}s` 
                        : 'Resend Code'}
                    </button>
          </div>
                  <button 
                    type="button" 
                    style={styles.closeBtn} 
                    onClick={() => {
                      setShowResetOTP(false);
                      setResetOTP('');
                      setError('');
                    }}
                  >
                    ← Back
                  </button>
                </form>
              </>
            ) : (
              <>
                <h2 style={styles.modalTitle}>Create New Password</h2>
                <p style={{ ...styles.subtitle, marginBottom: '1rem', fontSize: '0.875rem' }}>
                  Enter your new password below.
                </p>
                <form onSubmit={handleResetPassword} style={styles.form}>
                  <label style={styles.label}>New Password</label>
                  <div style={styles.passwordWrapper}>
                    <input
                      type={showNewPasswordField ? 'text' : 'password'}
                      placeholder="Password (min 8 chars, uppercase, lowercase, numbers)"
                      style={styles.input}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                      disabled={isResettingPassword}
                    />
                    <span style={styles.eyeIcon} onClick={() => setShowNewPasswordField(!showNewPasswordField)}>
                      {showNewPasswordField ? '🙈' : '👁️'}
                    </span>
                  </div>
                  <label style={styles.label}>Re-enter New Password</label>
                  <div style={styles.passwordWrapper}>
                    <input
                      type={showRetypeNewPasswordField ? 'text' : 'password'}
                      placeholder="Re-enter Password"
                      style={styles.input}
                      value={retypeNewPassword}
                      onChange={(e) => setRetypeNewPassword(e.target.value)}
                      required
                      disabled={isResettingPassword}
                    />
                    <span style={styles.eyeIcon} onClick={() => setShowRetypeNewPasswordField(!showRetypeNewPasswordField)}>
                      {showRetypeNewPasswordField ? '🙈' : '👁️'}
                    </span>
                  </div>
                  {error && <p style={styles.error}>{error}</p>}
                  <button 
                    type="submit" 
                    style={{
                      ...styles.loginBtn,
                      ...(isResettingPassword ? styles.loginBtnDisabled : {})
                    }}
                    disabled={isResettingPassword}
                  >
                    {isResettingPassword ? 'Resetting Password...' : 'Reset Password'}
                  </button>
                  <button 
                    type="button" 
                    style={styles.closeBtn} 
                    onClick={() => {
                      setShowNewPassword(false);
                      setNewPassword('');
                      setRetypeNewPassword('');
                      setError('');
                    }}
                  >
                    ← Back
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      )}
      <footer style={styles.footer}>© 2025 Safe Sense. All rights reserved.</footer>
    </main>
  );
}

const getStyles = (darkMode) => ({
  main: { 
    display: 'flex', 
    flexDirection: 'column', 
    justifyContent: 'center', 
    alignItems: 'center', 
    height: '100vh', 
    width: '100vw',
    fontFamily: 'Arial',
    overflow: 'hidden',
    position: 'fixed',
    top: 0,
    left: 0,
    backgroundColor: darkMode ? '#0f172a' : '#ffffff',
    color: darkMode ? '#ededed' : '#000000'
  },
  contentWrapper: { 
    display: 'flex', 
    width: '80%', 
    maxWidth: '1000px', 
    boxShadow: darkMode ? '0 0 15px rgba(0,0,0,0.5)' : '0 0 15px rgba(0,0,0,0.1)',
    overflow: 'auto',
    maxHeight: '90vh'
  },
  welcomeText: { 
    flex: 1, 
    backgroundColor: darkMode ? '#1e293b' : '#F3F4F6', 
    padding: '3rem', 
    display: 'flex', 
    flexDirection: 'column', 
    justifyContent: 'center' 
  },
  card: { 
    flex: 1, 
    backgroundColor: darkMode ? '#1e293b' : '#fff', 
    padding: '2rem', 
    display: 'flex', 
    flexDirection: 'column', 
    justifyContent: 'center' 
  },
  logo: { display: 'flex', alignItems: 'center', marginBottom: '1rem' },
  logoImage: { marginRight: '0.5rem' },
  logoText: { fontSize: '1.5rem', fontWeight: 'bold', color: darkMode ? '#ededed' : '#000000' },
  subtitleBold: { fontSize: '1.25rem', fontWeight: 'bold', color: darkMode ? '#ededed' : '#000000' },
  subtitle: { fontSize: '1rem', color: darkMode ? '#cbd5e1' : '#6B7280' },
  label: { marginTop: '1rem', marginBottom: '0.5rem', fontWeight: 'bold', color: darkMode ? '#ededed' : '#000000' },
  input: { 
    width: '100%', 
    padding: '0.5rem', 
    marginBottom: '0.5rem', 
    border: darkMode ? '1px solid #475569' : '1px solid #D1D5DB', 
    borderRadius: '0.25rem',
    backgroundColor: darkMode ? '#334155' : '#ffffff',
    color: darkMode ? '#ededed' : '#000000'
  },
  loginBtn: { width: '100%', padding: '0.5rem', backgroundColor: '#F97316', color: '#fff', border: 'none', borderRadius: '0.25rem', cursor: 'pointer', marginTop: '0.5rem' },
  loginBtnDisabled: { backgroundColor: '#9CA3AF', cursor: 'not-allowed', opacity: 0.6 },
  resendContainer: { marginTop: '0.5rem', textAlign: 'center' },
  resendBtn: { padding: '0.5rem 1rem', backgroundColor: '#10B981', color: '#fff', border: 'none', borderRadius: '0.25rem', cursor: 'pointer', fontSize: '0.875rem' },
  resendBtnDisabled: { backgroundColor: '#9CA3AF', cursor: 'not-allowed', opacity: 0.6 },
  googleBtn: { width: '100%', padding: '0.5rem', backgroundColor: '#4285F4', color: '#fff', border: 'none', borderRadius: '0.25rem', cursor: 'pointer', marginTop: '0.5rem' },
  link: { color: '#F97316', textDecoration: 'none', cursor: 'pointer' },
  linkRight: { color: '#F97316', textDecoration: 'none', cursor: 'pointer', display: 'block', textAlign: 'right', marginBottom: '1rem' },
  links: { marginTop: '1rem', textAlign: 'center' },
  or: { textAlign: 'center', margin: '1rem 0', color: darkMode ? '#cbd5e1' : '#6B7280' },
  modalOverlay: { position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center' },
  modalContent: { backgroundColor: darkMode ? '#1e293b' : '#fff', padding: '2rem', borderRadius: '0.5rem', width: '400px', color: darkMode ? '#ededed' : '#000000' },
  modalTitle: { fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '1rem', color: darkMode ? '#ededed' : '#000000' },
  form: { display: 'flex', flexDirection: 'column' },
  error: { color: '#ef4444', marginBottom: '0.5rem' },
  message: { color: '#F97316', marginBottom: '0.5rem' },
  closeBtn: { width: '100%', padding: '0.5rem', backgroundColor: '#6B7280', color: '#fff', border: 'none', borderRadius: '0.25rem', cursor: 'pointer', marginTop: '0.5rem' },
  passwordWrapper: { position: 'relative' },
  eyeIcon: { position: 'absolute', right: '0.5rem', top: '0.5rem', cursor: 'pointer' },
  footer: { textAlign: 'center', marginTop: '1rem', color: darkMode ? '#cbd5e1' : '#6B7280' },
});