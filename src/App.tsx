import React from 'react';
import { useAuth } from './hooks/useAuth';
import Auth from './components/Auth';
import RSSReader from './components/RSSReader';
import './App.css';

function App() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div className="App loading-container">
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <div className="App">
      {session ? <RSSReader session={session} /> : <Auth />}
    </div>
  );
}

export default App;
