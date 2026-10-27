import React from "react";

/**
 * GameStatus — Displays game state messages: win, loss, errors,
 * transaction hash, and remaining guess count.
 */
const GameStatus = ({ gameWon, gameOver, error, txHash, guessCount, maxGuesses }) => {
  const remaining = maxGuesses - guessCount;

  return (
    <div className="game-status">
      {/* Win Banner */}
      {gameWon && (
        <div className="status-banner status-win">
          🎉 You solved it in {guessCount} guess{guessCount !== 1 ? "es" : ""}!
        </div>
      )}

      {/* Loss Banner */}
      {gameOver && !gameWon && (
        <div className="status-banner status-loss">
          💀 Game Over! Better luck next time.
        </div>
      )}

      {/* Error Alert */}
      {error && (
        <div className="status-banner status-error">
          ⚠️ {error}
        </div>
      )}

      {/* Transaction Hash */}
      {txHash && (
        <div className="tx-info">
          Tx: <code>{txHash.slice(0, 10)}...{txHash.slice(-8)}</code>
        </div>
      )}

      {/* Remaining Guesses */}
      {!gameOver && !gameWon && (
        <div className="remaining-guesses">
          {remaining} guess{remaining !== 1 ? "es" : ""} remaining
        </div>
      )}
    </div>
  );
};

export default GameStatus;
