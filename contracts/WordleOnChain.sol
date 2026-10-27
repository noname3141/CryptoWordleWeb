// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title WordleOnChain
 * @notice An on-chain implementation of the Wordle word-guessing game.
 *
 * @dev SECURITY & PRIVACY TRADE-OFFS
 * ---------------------------------------------------------------------------
 * 1. **Why the solution is hashed (`solutionHash`)**
 *    The keccak256 hash of the solution word is stored publicly so that anyone
 *    can later verify the word was NOT changed mid-game.  This gives provable
 *    fairness: after a round ends the owner reveals the plaintext and anyone
 *    can check `keccak256(abi.encodePacked(revealedWord)) == solutionHash`.
 *
 * 2. **Why the plaintext solution is also stored (the big trade-off)**
 *    Solidity has no efficient way to do per-letter comparison against a hash
 *    alone.  We therefore store the actual solution string so `submitGuess`
 *    can iterate over its bytes.  This means:
 *      - Miners / validators executing the transaction can read it.
 *      - Anyone who knows how to read raw contract storage slots can extract
 *        it, because `private` in Solidity only prevents *other contracts*
 *        from reading the variable — it does NOT hide data from off-chain
 *        observers.  Tools like `eth_getStorageAt` expose it trivially.
 *
 *    **How to fix this in production:**
 *      a) *Commit-reveal with an off-chain oracle*: the contract stores only
 *         the hash; an oracle (or the owner's backend) evaluates guesses
 *         off-chain and posts signed results.  Players can dispute via the
 *         hash after the round.
 *      b) *Zero-Knowledge Proofs*: the evaluator submits a ZK proof that the
 *         guess was evaluated correctly against a word whose hash matches
 *         `solutionHash`, without revealing the word itself.
 *
 * 3. **Gas considerations for string operations**
 *    Solidity strings are dynamically-sized `bytes`.  Every byte-level
 *    comparison, copy, or conversion costs gas proportional to the length.
 *    Since Wordle words are fixed at 5 ASCII characters the cost is bounded
 *    and acceptable, but this pattern should not be generalised to
 *    arbitrarily long strings without careful gas budgeting.
 * ---------------------------------------------------------------------------
 */
contract WordleOnChain {
    // -----------------------------------------------------------------------
    // State Variables
    // -----------------------------------------------------------------------

    /// @notice The deployer / admin who can set new solutions.
    address public owner;

    /// @notice keccak256 hash of the current lowercase solution word.
    /// @dev Stored publicly for provable fairness — anyone can verify that the
    ///      word was not swapped mid-game by checking the hash after reveal.
    bytes32 public solutionHash;

    /// @dev The actual plaintext solution (lowercase, 5 ASCII letters).
    ///      Marked `private` but remember: `private` only restricts Solidity-
    ///      level access.  Any off-chain observer can still read this from the
    ///      contract's storage slots using `eth_getStorageAt`.
    string private solution;

    /// @notice Maximum number of guesses each player is allowed.
    uint8 public constant MAX_GUESSES = 6;

    /// @notice Number of guesses a player has submitted so far.
    mapping(address => uint8) public attempts;

    /// @notice Whether the player has correctly guessed the word.
    mapping(address => bool) public hasWon;

    /// @notice Whether the player's game is over (won OR exhausted guesses).
    mapping(address => bool) public gameOver;

    // -----------------------------------------------------------------------
    // Events
    // -----------------------------------------------------------------------

    /// @notice Emitted after every valid guess with the per-letter result.
    /// @param result Each element is 2 (green), 1 (yellow), or 0 (gray).
    event GuessResult(
        address indexed player,
        string guess,
        uint8[5] result,
        uint8 attemptNumber
    );

    /// @notice Emitted when a player guesses the word correctly.
    event GameWon(address indexed player, uint8 attempts);

    /// @notice Emitted when a player exhausts all guesses without winning.
    event GameOver(address indexed player);

    /// @notice Emitted when the owner sets a new solution word.
    event NewGameStarted(bytes32 solutionHash);

    // -----------------------------------------------------------------------
    // Constructor
    // -----------------------------------------------------------------------

    /**
     * @param _solution The 5-letter lowercase solution word for the first
     *                   round.
     */
    constructor(string memory _solution) {
        require(bytes(_solution).length == 5, "Solution must be 5 letters");

        owner = msg.sender;

        // Store the solution in lowercase and its hash.
        bytes memory solBytes = bytes(_solution);
        for (uint8 i = 0; i < 5; i++) {
            solBytes[i] = _toLower(solBytes[i]);
        }
        solution = string(solBytes);
        solutionHash = keccak256(abi.encodePacked(solution));
    }

    // -----------------------------------------------------------------------
    // External / Public Functions
    // -----------------------------------------------------------------------

    /**
     * @notice Submit a 5-letter guess and receive a colour-coded result.
     * @param guess The player's 5-letter guess (case-insensitive).
     * @return result A fixed-size array of 5 uint8 values:
     *         2 = correct letter & position (Green),
     *         1 = correct letter, wrong position (Yellow),
     *         0 = letter not in solution (Gray).
     *
     * @dev Duplicate-letter handling
     * ──────────────────────────────
     * The algorithm uses a classic two-pass approach so that duplicates are
     * scored correctly:
     *
     *   **Pass 1 — Exact matches (Greens):**
     *     Walk both strings simultaneously.  Wherever the letters match, mark
     *     the result as 2 and flag that solution position as "used" so it
     *     cannot also satisfy a Yellow in Pass 2.
     *
     *   **Pass 2 — Misplaced matches (Yellows):**
     *     For every guess position that was NOT an exact match, scan the
     *     solution for an *unused* occurrence of that letter.  If found, mark
     *     the result as 1 and flag that solution position as used.  Otherwise
     *     leave the result as 0.
     *
     * Example: solution = "apple", guess = "puppy"
     *   Pass 1: position 2 → 'p'=='p' → Green.  used = [_,_,X,_,_]
     *   Pass 2: pos 0 'p' → finds unused 'p' at pos 1 → Yellow.  used = [_,X,X,_,_]
     *           pos 1 'u' → not found → Gray.
     *           pos 3 'p' → no more unused 'p's → Gray.
     *           pos 4 'y' → not found → Gray.
     *   Result: [1, 0, 2, 0, 0]
     */
    function submitGuess(string memory guess)
        external
        returns (uint8[5] memory result)
    {
        require(!gameOver[msg.sender], "Game is already over");
        require(attempts[msg.sender] < MAX_GUESSES, "No attempts remaining");
        require(bytes(guess).length == 5, "Guess must be 5 letters");

        // Convert guess to lowercase bytes for comparison.
        bytes memory guessBytes = bytes(guess);
        for (uint8 i = 0; i < 5; i++) {
            guessBytes[i] = _toLower(guessBytes[i]);
        }

        bytes memory solBytes = bytes(solution);

        // Track which solution positions have been "consumed" by a match.
        bool[5] memory used;

        // ----- Pass 1: Exact matches (Green = 2) -----
        for (uint8 i = 0; i < 5; i++) {
            if (guessBytes[i] == solBytes[i]) {
                result[i] = 2;
                used[i] = true;
            }
        }

        // ----- Pass 2: Misplaced matches (Yellow = 1) -----
        for (uint8 i = 0; i < 5; i++) {
            if (result[i] == 2) continue; // already green

            for (uint8 j = 0; j < 5; j++) {
                if (!used[j] && guessBytes[i] == solBytes[j]) {
                    result[i] = 1;
                    used[j] = true;
                    break;
                }
            }
            // If no unused match was found, result[i] stays 0 (Gray).
        }

        // Increment attempt counter.
        attempts[msg.sender] += 1;

        // Check for a win (all positions are Green).
        bool won = true;
        for (uint8 i = 0; i < 5; i++) {
            if (result[i] != 2) {
                won = false;
                break;
            }
        }

        if (won) {
            hasWon[msg.sender] = true;
            gameOver[msg.sender] = true;
            emit GameWon(msg.sender, attempts[msg.sender]);
        } else if (attempts[msg.sender] == MAX_GUESSES) {
            gameOver[msg.sender] = true;
            emit GameOver(msg.sender);
        }

        // Emit the result for off-chain UIs to consume.
        emit GuessResult(
            msg.sender,
            string(guessBytes),
            result,
            attempts[msg.sender]
        );

        return result;
    }

    /**
     * @notice Owner-only: set a new solution word for the next round.
     * @param _solution The new 5-letter lowercase solution.
     *
     * @dev NOTE: This function does NOT reset individual player states
     *      (`attempts`, `hasWon`, `gameOver`).  In a production contract you
     *      would introduce a `gameId` counter that increments here, and all
     *      player-state mappings would be keyed by `(gameId, player)` so that
     *      each round is cleanly isolated.
     */
    function startNewGame(string memory _solution) external {
        require(msg.sender == owner, "Only owner");
        require(bytes(_solution).length == 5, "Solution must be 5 letters");

        bytes memory solBytes = bytes(_solution);
        for (uint8 i = 0; i < 5; i++) {
            solBytes[i] = _toLower(solBytes[i]);
        }
        solution = string(solBytes);
        solutionHash = keccak256(abi.encodePacked(solution));

        emit NewGameStarted(solutionHash);
    }

    /**
     * @notice View how many guesses `player` has used.
     */
    function getAttempts(address player) external view returns (uint8) {
        return attempts[player];
    }

    /**
     * @notice Check whether `player`'s game is over.
     */
    function isGameOver(address player) external view returns (bool) {
        return gameOver[player];
    }

    // -----------------------------------------------------------------------
    // Internal Helpers
    // -----------------------------------------------------------------------

    /**
     * @dev Convert an ASCII uppercase letter (A-Z) to lowercase (a-z).
     *      Leaves lowercase letters and all other bytes unchanged.
     *
     *      Gas note: this is a single comparison + subtraction, so it is
     *      negligible.  We call it at most 5 times per guess.
     */
    function _toLower(bytes1 char) internal pure returns (bytes1) {
        if (char >= 0x41 && char <= 0x5A) {
            // 0x41 = 'A', 0x5A = 'Z'; adding 0x20 maps to lowercase.
            return bytes1(uint8(char) + 0x20);
        }
        return char;
    }
}
