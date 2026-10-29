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
  const [revealedSolution, setRevealedSolution] = useState(null);

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
      let solutionWord = null;

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
            // The 4th argument (index 3) is the revealed solution string
            solutionWord = parsed.args.solution || parsed.args[3];
          }
          if (parsed && parsed.name === "GameOver") {
            lost = true;
            // The 3rd argument (index 2) is the revealed solution string
            solutionWord = parsed.args.solution || parsed.args[2];
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
      if (solutionWord) setRevealedSolution(solutionWord.toUpperCase());

      return resultArray;
    } catch (err) {
      let reason =
        err.reason ||
        err.shortMessage ||
        err.message ||
        "Transaction failed";

      // Map contract revert reason to a user-friendly message
      if (reason.includes("Word not in dictionary")) {
        reason = "Not in word list";
      }

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
    setRevealedSolution(null);
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
    revealedSolution,
    submitGuess,
    resetLocal,
    refreshGameInfo,
    maxGuesses: 6,
  };
};
