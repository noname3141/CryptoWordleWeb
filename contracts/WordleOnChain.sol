// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title WordleOnChain
 * @notice An on-chain implementation of Wordle supporting random word selection from a word bank.
 */
contract WordleOnChain {
    // -----------------------------------------------------------------------
    // State Variables
    // -----------------------------------------------------------------------

    address public owner;

    /// @notice keccak256 hash of the current active solution
    bytes32 public solutionHash;

    /// @dev Plaintext solution for on-chain letter verification
    string private solution;
    
    /// @notice On-chain dictionary of 5-letter words stored as bytes5 for gas efficiency
    bytes5[] public wordBank;
    
    /// @notice Tracks current round/game ID
    uint256 public currentGameId;

    uint8 public constant MAX_GUESSES = 6;

    /// @notice (player => gameId => attempts)
    mapping(address => mapping(uint256 => uint8)) public attempts;

    /// @notice (player => gameId => hasWon)
    mapping(address => mapping(uint256 => bool)) public hasWon;

    /// @notice (player => gameId => gameOver)
    mapping(address => mapping(uint256 => bool)) public gameOver;

    // -----------------------------------------------------------------------
    // Events
    // -----------------------------------------------------------------------

    event GuessResult(
        address indexed player,
        uint256 indexed gameId,
        string guess,
        uint8[5] result,
        uint8 attemptNumber
    );

    event GameWon(address indexed player, uint256 gameId, uint8 attempts);

    event GameOver(address indexed player, uint256 gameId);

    event NewGameStarted(uint256 indexed gameId, bytes32 solutionHash);
    
    event WordsAdded(uint256 countAdded, uint256 totalWords);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    // -----------------------------------------------------------------------
    // Constructor
    // -----------------------------------------------------------------------

    /**
     * @param _initialWords Optional initial batch of 5-letter words in bytes5 format.
     */
    constructor(bytes5[] memory _initialWords) {
        owner = msg.sender;

        if (_initialWords.length > 0) {
            _appendWords(_initialWords);
            _pickNewRandomSolution();
        }
    }

    // -----------------------------------------------------------------------
    // Word Bank Management
    // -----------------------------------------------------------------------

    /**
     * @notice Add words to the word bank in batches
     * @param _words Array of 5-letter words encoded as bytes5
     */
    function addWords(bytes5[] calldata _words) external onlyOwner {
        _appendWords(_words);
    }

    function _appendWords(bytes5[] memory _words) internal {
        for (uint256 i = 0; i < _words.length; i++) {
            wordBank.push(_words[i]);
        }
        emit WordsAdded(_words.length, wordBank.length);
    }

    // -----------------------------------------------------------------------
    // Game Management (Random / Custom)
    // -----------------------------------------------------------------------

    /**
     * @notice Pick a random word from the word bank and start a new game round
     */
    function startRandomGame() external onlyOwner {
        _pickNewRandomSolution();
    }

    function _pickNewRandomSolution() internal {
        require(wordBank.length > 0, "Word bank is empty");

        uint256 randomIndex = uint256(
            keccak256(
                abi.encodePacked(
                    block.prevrandao,
                    block.timestamp,
                    msg.sender,
                    currentGameId,
                    wordBank.length
                )
            )
        ) % wordBank.length;

        bytes5 chosen = wordBank[randomIndex];

        bytes memory solBytes = new bytes(5);
        for (uint8 i = 0; i < 5; i++) {
            solBytes[i] = _toLower(chosen[i]);
        }

        currentGameId++;
        solution = string(solBytes);
        solutionHash = keccak256(abi.encodePacked(solution));

        emit NewGameStarted(currentGameId, solutionHash);
    }

    /**
     * @notice Owner-only: manually set a specific 5-letter solution (useful for testing or fixed daily word)
     * @param _solution The 5-letter solution word
     */
    function startNewGame(string memory _solution) external onlyOwner {
        require(bytes(_solution).length == 5, "Solution must be 5 letters");

        bytes memory solBytes = bytes(_solution);
        for (uint8 i = 0; i < 5; i++) {
            solBytes[i] = _toLower(solBytes[i]);
        }

        currentGameId++;
        solution = string(solBytes);
        solutionHash = keccak256(abi.encodePacked(solution));

        emit NewGameStarted(currentGameId, solutionHash);
    }

    // -----------------------------------------------------------------------
    // External Gameplay Functions
    // -----------------------------------------------------------------------

    /**
     * @notice Submit a 5-letter guess and receive a colour-coded result.
     * @param guess The player's 5-letter guess (case-insensitive).
     * @return result A fixed-size array of 5 uint8 values:
     *         2 = correct letter & position (Green),
     *         1 = correct letter, wrong position (Yellow),
     *         0 = letter not in solution (Gray).
     */
    function submitGuess(string memory guess)
        external
        returns (uint8[5] memory result)
    {
        uint256 gid = currentGameId;
        require(gid > 0, "No active game");
        require(!gameOver[msg.sender][gid], "Game is already over");
        require(attempts[msg.sender][gid] < MAX_GUESSES, "No attempts remaining");
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
        }

        // Increment attempt counter for current game
        attempts[msg.sender][gid] += 1;

        // Check for a win (all positions are Green)
        bool won = true;
        for (uint8 i = 0; i < 5; i++) {
            if (result[i] != 2) {
                won = false;
                break;
            }
        }

        if (won) {
            hasWon[msg.sender][gid] = true;
            gameOver[msg.sender][gid] = true;
            emit GameWon(msg.sender, gid, attempts[msg.sender][gid]);
        } else if (attempts[msg.sender][gid] == MAX_GUESSES) {
            gameOver[msg.sender][gid] = true;
            emit GameOver(msg.sender, gid);
        }

        emit GuessResult(
            msg.sender,
            gid,
            string(guessBytes),
            result,
            attempts[msg.sender][gid]
        );

        return result;
    }

    // -----------------------------------------------------------------------
    // View Functions
    // -----------------------------------------------------------------------

    function getAttempts(address player) external view returns (uint8) {
        return attempts[player][currentGameId];
    }

    function isGameOver(address player) external view returns (bool) {
        return gameOver[player][currentGameId];
    }

    function hasPlayerWon(address player) external view returns (bool) {
        return hasWon[player][currentGameId];
    }

    function getWordCount() external view returns (uint256) {
        return wordBank.length;
    }

    // -----------------------------------------------------------------------
    // Internal Helpers
    // -----------------------------------------------------------------------

    function _toLower(bytes1 char) internal pure returns (bytes1) {
        if (char >= 0x41 && char <= 0x5A) {
            return bytes1(uint8(char) + 0x20);
        }
        return char;
    }
}
