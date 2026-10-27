import React from "react";

/**
 * WordleBoard — Renders the 6×5 grid of tiles.
 * Filled rows display guessed letters with color-coded backgrounds.
 * Empty rows display placeholder tiles.
 */
const WordleBoard = ({ guesses, maxGuesses }) => {
  // Build a 6-row grid; fill with guesses, pad remaining with empties
  const rows = [];

  for (let i = 0; i < maxGuesses; i++) {
    if (i < guesses.length) {
      // Filled row
      const { word, result } = guesses[i];
      rows.push(
        <div className="board-row" key={i}>
          {word.split("").map((letter, j) => (
            <div
              className={`tile tile-${result[j]} tile-filled`}
              key={j}
              style={{ animationDelay: `${j * 100}ms` }}
            >
              {letter.toUpperCase()}
            </div>
          ))}
        </div>
      );
    } else {
      // Empty row
      rows.push(
        <div className="board-row" key={i}>
          {[0, 1, 2, 3, 4].map((j) => (
            <div className="tile tile-empty" key={j} />
          ))}
        </div>
      );
    }
  }

  return <div className="board">{rows}</div>;
};

export default WordleBoard;
