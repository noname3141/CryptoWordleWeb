import { useState, useCallback, useEffect } from "react";
import { getContract } from "../utils/contract";

/** Map contract result codes to CSS-friendly color names. */
const RESULT_MAP = { 0: "gray", 1: "yellow", 2: "green" };

/**
 * Custom hook that encapsulates all Wordle game state and contract interaction.
 */
export const useWordle = () => {
  const [guesses, setGuesses] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [gameWon, setGameWon] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [txHash, setTxHash] = useState(null);
  const [gameId, setGameId] = useState(null);

  // Fetch current active round ID
  const refreshGameInfo = useCallback(async () => {
    try {
      const contract = await getContract(false);
      const gid = await contract.currentGameId();
      setGameId(Number(gid));
    } catch {
      // Contract may not be deployed yet or provider not ready
    }
  }, []);

  useEffect(() => {
    refreshGameInfo();
  }, [refreshGameInfo]);

  const submitGuess = useCallback(async (guess) => {
    setIsLoading(true);
    setError(null);
    setTxHash(null);

    try {
      const contract = await getContract(true);
      const tx = await contract.submitGuess(guess.toLowerCase());
      setTxHash(tx.hash);

      const receipt = await tx.wait();

      // Parse events from transaction receipt
      let resultArray = null;
      let won = false;
      let lost = false;

      for (const log of receipt.logs) {
        try {
          const parsed = contract.interface.parseLog({
            topics: log.topics,
            data: log.data,
          });
          if (parsed && parsed.name === "GuessResult") {
            resultArray = parsed.args.result.map(
              (r) => RESULT_MAP[Number(r)]
            );
            if (parsed.args.gameId) {
              setGameId(Number(parsed.args.gameId));
            }
          }
          if (parsed && parsed.name === "GameWon") {
            won = true;
          }
          if (parsed && parsed.name === "GameOver") {
            lost = true;
          }
        } catch {
          // Unrelated log — ignore
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
    refreshGameInfo();
  }, [refreshGameInfo]);

  return {
    guesses,
    isLoading,
    error,
    gameWon,
    gameOver,
    txHash,
    gameId,
    submitGuess,
    resetLocal,
    refreshGameInfo,
    maxGuesses: 6,
  };
};
