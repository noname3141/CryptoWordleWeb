import React, { useState } from "react";
import ConnectWallet from "./components/ConnectWallet";
import WordleBoard from "./components/WordleBoard";
import GuessInput from "./components/GuessInput";
import GameStatus from "./components/GameStatus";
import { useWordle } from "./hooks/useWordle";

/**
 * App — Root component composing the on-chain Wordle UI.
 * Layout: Header → Wallet → Board → Input → Status
 */
function App() {
  const [account, setAccount] = useState(null);
  const {
    guesses,
    isLoading,
    error,
    gameWon,
    gameOver,
    txHash,
    gameId,
    revealedSolution,
    submitGuess,
    maxGuesses,
  } = useWordle();

  const isGameFinished = gameWon || gameOver;

  return (
    <div className="app">
      {/* Header */}
      <header className="app-header">
        <h1>⛓️ Wordle On-Chain</h1>
        <p className="subtitle">
          Provably fair word guessing on Ethereum
          {gameId ? ` • Round #${gameId}` : ""}
        </p>
      </header>

      {/* Wallet Connection */}
      <ConnectWallet account={account} setAccount={setAccount} />

      {/* Main Game Area */}
      {account ? (
        <main className="game-container">
          <WordleBoard guesses={guesses} maxGuesses={maxGuesses} />

          <GuessInput
            onSubmit={submitGuess}
            isLoading={isLoading}
            disabled={isGameFinished}
          />

          <GameStatus
            gameWon={gameWon}
            gameOver={gameOver}
            error={error}
            txHash={txHash}
            guessCount={guesses.length}
            maxGuesses={maxGuesses}
            revealedSolution={revealedSolution}
          />
        </main>
      ) : (
        <div className="connect-prompt">
          <p>Connect your wallet to start playing 👆</p>
        </div>
      )}

      {/* Footer */}
      <footer className="app-footer">
        <p>
          Each guess is an on-chain transaction •{" "}
          <span className="legend-green">🟩 Green</span> = correct •{" "}
          <span className="legend-yellow">🟨 Yellow</span> = misplaced •{" "}
          <span className="legend-gray">⬜ Gray</span> = wrong
        </p>
      </footer>
    </div>
  );
}

export default App;
