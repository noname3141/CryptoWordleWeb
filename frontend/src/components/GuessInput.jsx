import React, { useState } from "react";

/**
 * GuessInput — A controlled text input for 5-letter guesses.
 * Only allows alphabetic characters, auto-uppercases display,
 * and disables submission when the game is over or loading.
 */
const GuessInput = ({ onSubmit, isLoading, disabled }) => {
  const [input, setInput] = useState("");

  const handleChange = (e) => {
    // Allow only alphabetic characters, max 5
    const filtered = e.target.value.replace(/[^a-zA-Z]/g, "").slice(0, 5);
    setInput(filtered);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (input.length !== 5 || isLoading || disabled) return;

    try {
      await onSubmit(input);
      setInput(""); // Clear on success
    } catch {
      // Error is handled by the hook; keep input so user can retry
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      handleSubmit(e);
    }
  };

  return (
    <form className="guess-input" onSubmit={handleSubmit}>
      <input
        type="text"
        value={input.toUpperCase()}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder="Enter 5-letter word"
        maxLength={5}
        disabled={isLoading || disabled}
        autoFocus
        spellCheck={false}
        autoComplete="off"
      />
      <button
        type="submit"
        disabled={input.length !== 5 || isLoading || disabled}
      >
        {isLoading ? (
          <span className="spinner-text">⛓️ Submitting...</span>
        ) : (
          "Submit Guess"
        )}
      </button>
    </form>
  );
};

export default GuessInput;
