import { useState, useCallback } from "react";
import { getContract } from "../utils/contract";

/** Map contract result codes to CSS-friendly color names. */
const RESULT_MAP = { 0: "gray", 1: "yellow", 2: "green" };

/**
 * Custom hook that encapsulates all Wordle game state and contract interaction.
 *
 * Returns:
 *  - guesses:     Array of { word: string, result: string[] }
 *  - isLoading:   True while a transaction is being mined
 *  - error:       Last error message (or null)
 *  - gameWon:     True if the player has solved the puzzle
 *  - gameOver:    True if the game is over (win or loss)
 *  - txHash:      Hash of the last submitted transaction
 *  - submitGuess: Async function to submit a guess to the contract
 *  - resetLocal:  Resets local UI state (does NOT reset on-chain state)
 *  - maxGuesses:  Constant (6)
 */
export const useWordle = () => {
  const [guesses, setGuesses] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [gameWon, setGameWon] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [txHash, setTxHash] = useState(null);

  const submitGuess = useCallback(async (guess) => {
    setIsLoading(true);
    setError(null);
    setTxHash(null);

    try {
      const contract = await getContract(true);
      const tx = await contract.submitGuess(guess.toLowerCase());
      setTxHash(tx.hash);

      const receipt = await tx.wait();

      // Parse events from the transaction receipt
      let resultArray = null;
      let won = false;
      let lost = false;

      for (const log of receipt.logs) {
        try {
          const parsed = contract.interface.parseLog({
            topics: log.topics,
            data: log.data,
          });
          if (parsed.name === "GuessResult") {
            resultArray = parsed.args.result.map(
              (r) => RESULT_MAP[Number(r)]
            );
          }
          if (parsed.name === "GameWon") {
            won = true;
          }
          if (parsed.name === "GameOver") {
            lost = true;
          }
        } catch {
          // Log from a different contract/event — skip
        }
      }

      if (resultArray) {
        setGuesses((prev) => [
          ...prev,
          { word: guess.toLowerCase(), result: resultArray },
        ]);
      }

      if (won) setGameWon(true);
      if (lost) setGameOver(true);

      return resultArray;
    } catch (err) {
      // Extract revert reason from various error formats
      const reason =
        err.reason ||
        err.shortMessage ||
        err.message ||
        "Transaction failed";
      setError(reason);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const resetLocal = useCallback(() => {
    setGuesses([]);
    setGameWon(false);
    setGameOver(false);
    setError(null);
    setTxHash(null);
  }, []);

  return {
    guesses,
    isLoading,
    error,
    gameWon,
    gameOver,
    txHash,
    submitGuess,
    resetLocal,
    maxGuesses: 6,
  };
};
