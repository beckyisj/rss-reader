import React, { useState, useEffect } from 'react';
import './App.css';
import RSSReader from './components/RSSReader';

function App() {
  return (
    <div className="App">
      <header className="App-header">
        <h1>📰 RSS Reader</h1>
        <p>Your personal feed aggregator</p>
      </header>
      <main>
        <RSSReader />
      </main>
    </div>
  );
}

export default App;
