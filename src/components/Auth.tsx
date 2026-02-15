import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import './Auth.css';

type View = 'login' | 'signup' | 'forgot';

const Auth: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [view, setView] = useState<View>('login');
  const [message, setMessage] = useState<string | null>(null);

  const handleAuth = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      if (view === 'forgot') {
        const { error } = await supabase!.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin,
        });
        if (error) throw error;
        setMessage('Check your email for the reset link.');
        return;
      }

      if (view === 'login') {
        const { error } = await supabase!.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
      } else {
        const { error } = await supabase!.auth.signUp({
          email,
          password,
        });
        if (error) throw error;
        setMessage('Check your email for the confirmation link.');
      }
    } catch (error: any) {
      setMessage(error.error_description || error.message);
    } finally {
      setLoading(false);
    }
  };

  const heading = view === 'login' ? 'Welcome Back' : view === 'signup' ? 'Create Account' : 'Reset Password';
  const subheading = view === 'login'
    ? 'Sign in to access your feeds'
    : view === 'signup'
      ? 'Get started with your personal feed reader'
      : 'Enter your email and we\'ll send a reset link';

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h1 className="auth-header">{heading}</h1>
        <p className="auth-subheader">{subheading}</p>
        {message && <div className="auth-message">{message}</div>}
        <form onSubmit={handleAuth}>
          <div className="input-group">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              className="input-field"
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          {view !== 'forgot' && (
            <div className="input-group">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                className="input-field"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          )}
          {view === 'login' && (
            <p className="forgot-link">
              <button type="button" onClick={() => { setView('forgot'); setMessage(null); }}>
                Forgot password?
              </button>
            </p>
          )}
          <button className="auth-button" type="submit" disabled={loading}>
            {loading ? 'Loading...' : view === 'login' ? 'Sign In' : view === 'signup' ? 'Sign Up' : 'Send Reset Link'}
          </button>
        </form>
        <p className="toggle-view">
          {view === 'login' ? "Don't have an account?" : 'Already have an account?'}
          <button onClick={() => { setView(view === 'login' ? 'signup' : 'login'); setMessage(null); }}>
            {view === 'login' ? 'Sign Up' : 'Sign In'}
          </button>
        </p>
      </div>
    </div>
  );
};

export default Auth; 