import React from "react";

/**
 * GameStatus — Displays game state messages: win/loss with revealed solution,
 * errors (including "Not in word list"), transaction hash, and remaining guesses.
 */
const GameStatus = ({ gameWon, gameOver, error, txHash, guessCount, maxGuesses, revealedSolution }) => {
  const remaining = maxGuesses - guessCount;

  return (
    <div className="game-status">
      {/* Win Banner — includes the revealed solution */}
      {gameWon && (
        <div className="status-banner status-win">
          🎉 You solved it in {guessCount} guess{guessCount !== 1 ? "es" : ""}!
          {revealedSolution && (
            <span className="revealed-word"> The word was <strong>{revealedSolution}</strong>.</span>
          )}
        </div>
      )}

      {/* Loss Banner — includes the revealed solution */}
      {gameOver && !gameWon && (
        <div className="status-banner status-loss">
          💀 Game Over!
          {revealedSolution ? (
            <span className="revealed-word"> The word was <strong>{revealedSolution}</strong>.</span>
          ) : (
            " Better luck next time."
          )}
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
