import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import './Auth.css';

const Auth: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoginView, setIsLoginView] = useState(true);

  const handleAuth = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);

    try {
      if (isLoginView) {
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
        alert('Check your email for the confirmation link!');
      }
    } catch (error: any) {
      alert(error.error_description || error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h1 className="auth-header">{isLoginView ? 'Welcome Back' : 'Create Account'}</h1>
        <p className="auth-subheader">
          {isLoginView
            ? 'Sign in to access your feeds'
            : 'Get started with your personal feed reader'}
        </p>
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
          <button className="auth-button" type="submit" disabled={loading}>
            {loading ? <span>Loading...</span> : <span>{isLoginView ? 'Sign In' : 'Sign Up'}</span>}
          </button>
        </form>
        <p className="toggle-view">
          {isLoginView ? "Don't have an account?" : 'Already have an account?'}
          <button onClick={() => setIsLoginView(!isLoginView)}>
            {isLoginView ? 'Sign Up' : 'Sign In'}
          </button>
        </p>
      </div>
    </div>
  );
};

export default Auth; 