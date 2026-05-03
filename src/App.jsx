import { useState, useEffect, useCallback } from 'react';
import useGameEngine from './useGameEngine';
import './App.css';

function App() {
  const [gameState, setGameState] = useState('start');
  const [score, setScore] = useState(0);
  const [bestScore, setBestScore] = useState(
    parseInt(localStorage.getItem('trBest') || '0')
  );
  const [speed, setSpeed] = useState(0);
  const [coins, setCoins] = useState(0);
  const [level, setLevel] = useState(1);
  const [muted, setMuted] = useState(false);

  const { canvasRef, setup, startGame, toggleMute, togglePause } = useGameEngine();

  const handleStateChange = useCallback((newState, newScore, newBest, newSpeed, newCoins, newLevel, newMuted) => {
    setGameState(newState);
    setScore(newScore);
    setBestScore(newBest);
    setSpeed(newSpeed);
    setCoins(newCoins || 0);
    if (newLevel !== undefined) setLevel(newLevel);
    if (newMuted !== undefined) setMuted(newMuted);
  }, []);

  useEffect(() => {
    const cleanup = setup(handleStateChange);
    return cleanup;
  }, [setup, handleStateChange]);

  const handleStart = () => {
    setGameState('playing');
    startGame();
  };

  const handleRestart = () => {
    setGameState('playing');
    startGame();
  };

  return (
    <div className="game-container" id="game-container">
      <canvas ref={canvasRef} id="gameCanvas" className="game-canvas" />

      {/* HUD */}
      {(gameState === 'playing' || gameState === 'paused') && (
        <div className="hud" id="hud">
          <div className="hud-item" id="hud-score">
            <span className="hud-label">WYNIK</span>
            <span className="hud-value hud-cyan">{score}</span>
          </div>
          <div className="hud-item" id="hud-coins">
            <span className="hud-label">💰 MONETY</span>
            <span className="hud-value hud-gold">{coins}</span>
          </div>
          <div className="hud-item" id="hud-speed">
            <span className="hud-label">KM/H</span>
            <span className="hud-value hud-yellow">{speed}</span>
          </div>
          <div className="hud-item" id="hud-level">
            <span className="hud-label">POZIOM</span>
            <span className="hud-value hud-yellow">{level}</span>
          </div>
          <div className="hud-item" id="hud-best">
            <span className="hud-label">REKORD</span>
            <span className="hud-value hud-magenta">{bestScore}</span>
          </div>
        </div>
      )}

      {/* Top-right controls */}
      <div className="top-controls">
        <button
          className="icon-btn"
          onClick={toggleMute}
          title={muted ? 'Włącz dźwięk (M)' : 'Wycisz (M)'}
        >
          {muted ? '🔇' : '🔊'}
        </button>
        {(gameState === 'playing' || gameState === 'paused') && (
          <button
            className="icon-btn"
            onClick={togglePause}
            title={gameState === 'paused' ? 'Wznów (P)' : 'Pauza (P)'}
          >
            {gameState === 'paused' ? '▶' : '⏸'}
          </button>
        )}
      </div>

      {/* Pause overlay */}
      {gameState === 'paused' && (
        <div className="overlay" id="pause-screen">
          <div className="overlay-content">
            <h2 className="gameover-title" style={{ color: 'var(--accent-cyan)', textShadow: 'var(--glow-cyan)' }}>PAUZA</h2>
            <p className="instructions">Naciśnij <kbd>P</kbd> lub <kbd>SPACJA</kbd> aby wznowić</p>
            <button className="btn-glow" onClick={togglePause}>WZNÓW</button>
          </div>
        </div>
      )}

      {/* Start Screen */}
      {gameState === 'start' && (
        <div className="overlay" id="start-screen">
          <div className="overlay-content">
            <h1 className="game-title">
              TURBO<br /><span className="accent">RACER</span>
            </h1>
            <div className="car-emoji">🏎️</div>
            <p className="instructions">
              <kbd>←</kbd> <kbd>→</kbd> sterowanie &nbsp;
              <kbd>↑</kbd> gaz &nbsp; <kbd>↓</kbd> hamulec
            </p>
            <p className="instructions">
              <kbd>P</kbd> pauza &nbsp; <kbd>M</kbd> wycisz
            </p>
            <p className="instructions mobile-hint">
              Na telefonie: dotknij lewą/prawą stronę ekranu
            </p>
            <div className="legend">
              <p>🚗 Inne auta & 🛢️ Beczki = kraksa (stop!)</p>
              <p>🔶 Pachołki = spowolnienie</p>
              <p>🛢️ Plamy oleju = poślizg</p>
              <p>💰 Monety = +50 punktów</p>
              <p><kbd>SPACJA</kbd> = skok (przeskakuj przeszkody)</p>
            </div>
            <button id="start-btn" className="btn-glow" onClick={handleStart}>
              START
            </button>
          </div>
        </div>
      )}

      {/* Game Over Screen */}
      {gameState === 'gameover' && (
        <div className="overlay" id="gameover-screen">
          <div className="overlay-content">
            <h2 className="gameover-title">KONIEC GRY!</h2>
            <div className="crash-emoji">💥</div>
            <div className="final-stats">
              <div className="stat">
                <span className="stat-label">Wynik</span>
                <span className="stat-value" id="final-score">{score}</span>
              </div>
              <div className="stat">
                <span className="stat-label">Monety</span>
                <span className="stat-value hud-gold" id="final-coins">💰 {coins}</span>
              </div>
              <div className="stat">
                <span className="stat-label">Najlepszy</span>
                <span className="stat-value" id="final-best">{bestScore}</span>
              </div>
            </div>
            <button id="restart-btn" className="btn-glow" onClick={handleRestart}>
              ZAGRAJ PONOWNIE
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
