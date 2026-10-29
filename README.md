# Wordle On-Chain 🟩🟨⬜

A provably fair, on-chain implementation of Wordle built on Ethereum. The core game logic — word validation against an on-chain dictionary, letter-by-letter matching, multi-round player tracking, and post-game solution reveal — executes entirely within a Solidity smart contract. Each guess is a blockchain transaction, and every game outcome is cryptographically verifiable.

---

## Table of Contents

- [Key Features](#key-features)
- [Architecture Overview](#architecture-overview)
- [How It Works](#how-it-works)
- [On-Chain Randomness & Solution Selection](#on-chain-randomness--solution-selection)
- [Cryptographic Hashing & Fairness](#cryptographic-hashing--fairness)
- [Dictionary Validation & Gas Optimization](#dictionary-validation--gas-optimization)
- [Post-Game Solution Reveal](#post-game-solution-reveal)
- [Prerequisites](#prerequisites)
- [Installation & Setup](#installation--setup)
- [Deploying the Contract](#deploying-the-contract)
- [Running the Frontend](#running-the-frontend)
- [Running Tests](#running-tests)
- [Project Structure](#project-structure)
- [Smart Contract API](#smart-contract-api)
- [Security Considerations](#security-considerations)
- [Potential Extensions](#potential-extensions)
- [License](#license)

---

## Key Features

- **On-Chain 6,030-Word Bank**: Packed as `bytes5[]` to cut storage gas costs by ~70%.
- **Automated Random Selection**: Selects secret words dynamically each round using EVM entropy (`block.prevrandao`).
- **Multi-Round Lifecycle**: `currentGameId` isolates player attempts per round, allowing continuous play across new rounds.
- **Strict Dictionary Validation**: Rejects invalid/made-up words (`"Word not in dictionary"`) with O(1) mapping lookups.
- **Controlled Post-Game Reveal**: Exposes the secret word only after a player wins, loses (6 guesses), or when the round advances.
- **Interactive UI**: Real-time round display (`Round #X`), Wordle color grid (Green, Yellow, Gray) with flip animations, and revealed solution banners.
- **Comprehensive Test Suite**: 30 passing automated tests covering all game mechanics, edge cases, and access controls.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (React)                        │
│  ┌──────────────┐  ┌────────────┐  ┌─────────────────────┐  │
│  │ ConnectWallet│  │ WordleBoard│  │ GuessInput          │  │
│  └──────┬───────┘  └─────▲──────┘  └──────────┬──────────┘  │
│         │                │                    │             │
│         │          ┌─────┴─────┐              │             │
│         └──────────│useWordle  │◄─────────────┘             │
│                    │  (hook)   │                            │
│                    └─────┬─────┘                            │
│                          │ ethers.js                        │
└──────────────────────────┼──────────────────────────────────┘
                           │
              ┌────────────▼─────────────┐
              │  Ethereum                │
              │  (Hardhat)               │
              │                          │
              │ WordleOnChain.sol        │
              │  - wordBank (bytes5[])   │
              │  - isValidWord (mapping) │
              │  - solutionHash          │
              │  - currentGameId         │
              │  - submitGuess()         │
              │  - getRevealedSolution() │
              │  - Events: GuessResult,  │
              │      GameWon, GameOver   │
              └──────────────────────────┘
```

**Data Flow:**
1. User connects MetaMask wallet via `ConnectWallet`.
2. UI displays active round ID (`Round #X`) fetched from `currentGameId`.
3. User enters a 5-letter word; `GuessInput` submits it to `useWordle`.
4. `contract.submitGuess(guess)` executes on-chain:
   - Verifies the guess exists in `isValidWord`.
   - Compares letters against the secret solution (Greens, Yellows, Grays).
   - Emits `GuessResult`.
   - On win (all Greens) or loss (6 attempts), emits `GameWon` / `GameOver` with the revealed solution word.
5. The frontend displays the result grid and reveals the secret solution on game completion.

---

## How It Works

| Result Code | Color  | Meaning                         |
|:-----------:|:------:|:--------------------------------|
| `2`         | 🟩 Green  | Correct letter, correct position |
| `1`         | 🟨 Yellow | Correct letter, wrong position   |
| `0`         | ⬜ Gray   | Letter not in solution           |

### Two-Pass Duplicate Matching Algorithm
The contract implements a two-pass algorithm to correctly score duplicate letters:
1. **Pass 1 (Greens):** Scans for exact positional matches. Flags matched solution positions as "used".
2. **Pass 2 (Yellows):** For each remaining guess letter, scans for an unused occurrence in the solution. If found, marks Yellow and consumes that position.

**Example:** Solution = `apple`, Guess = `puppy`
- Pass 1: position 2 (`p` == `p`) → Green. Used: `[_, _, ✓, _, _]`
- Pass 2:
  - `p` (index 0) → matches unused `p` at index 1 → Yellow.
  - `u` (index 1) → not in solution → Gray.
  - `p` (index 3) → no unused `p` remaining → Gray.
  - `y` (index 4) → not in solution → Gray.
- **Result:** `[1, 0, 2, 0, 0]`

---

## On-Chain Randomness & Solution Selection

The contract selects its secret solution dynamically using `_pickNewRandomSolution()`:

```solidity
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
```

- **Gas Optimization**: 6,030 words are stored as `bytes5[]` (packed into storage slots vs. dynamic `string[]`).
- **Round Isolation**: Starting a new round (`startRandomGame()` or `startNewGame()`) increments `currentGameId`, archiving the previous solution in `roundSolutions` and giving every player a fresh set of 6 attempts.

---

## Cryptographic Hashing & Fairness

At the start of every round, the solution is committed to the blockchain:

```
solutionHash = keccak256(abi.encodePacked(solution))
```

- **Provable Fairness**: The hash is public from block 0 of each round. When the round completes and the word is revealed, anyone can verify `keccak256(revealedWord) == solutionHash` to prove the word was never modified mid-game.
- **Production Extension**: For competitive tournaments with real stakes, pseudo-randomness (`block.prevrandao`) can be replaced with **Chainlink VRF**, and off-chain zero-knowledge proofs (zk-SNARKs via Circom or Noir) can be used to prevent mempool front-running.

---

## Dictionary Validation & Gas Optimization

To prevent players from spamming non-words (e.g. `"ZZZZZ"`), the contract maintains an on-chain dictionary:

- **O(1) Verification**: Words loaded into `wordBank` automatically populate `mapping(bytes5 => bool) public isValidWord`.
- **Inline Assembly Slicing**:
  ```solidity
  bytes5 guessBytes5;
  assembly {
      guessBytes5 := mload(add(guessBytes, 32))
  }
  require(isValidWord[guessBytes5], "Word not in dictionary");
  ```
- **User Experience**: The frontend catches this revert and immediately surfaces a friendly `"Not in word list"` alert without burning unnecessary gas.

---

## Post-Game Solution Reveal

Unlike traditional contracts that keep solutions permanently private or leak them prematurely:

1. **Storage**: Solutions are indexed by round ID: `mapping(uint256 => string) private roundSolutions`.
2. **Access Control**: `getRevealedSolution(gameId)` enforces that the secret word is only visible if:
   - `gameOver[msg.sender][gameId] == true` (the caller has won or exhausted all 6 guesses), OR
   - `gameId < currentGameId` (the round has officially ended and advanced).
3. **Event Payloads**: `GameWon` and `GameOver` events directly broadcast the solution word to update the UI instantly without extra RPC calls.

---

## Prerequisites

| Tool          | Version   | Purpose                              |
|:------------- |:--------- |:-------------------------------------|
| **Node.js**   | ≥ 18.x    | Runtime for Hardhat and React        |
| **npm**       | ≥ 9.x     | Package manager                      |
| **MetaMask**  | Latest    | Browser wallet for transaction signing |
| **Git**       | Latest    | Version control                      |

---

## Installation & Setup

### 1. Clone the Repository

```bash
git clone <repository-url>
cd CryptoWordleWeb
```

### 2. Install Smart Contract Dependencies

```bash
npm install
```

### 3. Install Frontend Dependencies

```bash
cd frontend
npm install
cd ..
```

---

## Deploying the Contract

### Local Deployment (Hardhat Node)

**Terminal 1 — Start the local blockchain:**

```bash
npx hardhat node
```

**Terminal 2 — Deploy the contract with the 6,030-word bank:**

```bash
npx hardhat run scripts/deploy.js --network localhost
```

Expected output:

```
Loading 6,030-word dictionary...
Prepared 6030 words formatted as bytes5.
Deploying WordleOnChain with initial batch of 250 words...
WordleOnChain deployed to: 0x5FbDB2315678afecb367f032d93F642f64180aa3
Uploading words in batches...

Deployment Complete!
Total words in bank: 6030
Initial Game ID: 1
Initial Solution Hash: 0x...

--- Save this address in your frontend .env ---
REACT_APP_CONTRACT_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3
```

### Configure MetaMask

1. Add custom network: RPC URL `http://127.0.0.1:8545`, Chain ID `31337`.
2. Import one of Hardhat's test accounts using its private key.

---

## Running the Frontend

```bash
cd frontend
npm start
```

The application opens at `http://localhost:3000`.

---

## Running Tests

Run the full automated test suite (30 passing tests):

```bash
npx hardhat test
```

Test coverage includes:
- ✅ **Deployment**: Owner assignment, initial word bank loading, round ID setup.
- ✅ **Word Bank Management**: Batch addition, access control.
- ✅ **Dictionary Validation**: Rejection of non-dictionary words (`"zzzzz"`), acceptance of valid words regardless of case.
- ✅ **Solution Reveal**: Hiding solution while playing, revealing upon win/loss, historical round access.
- ✅ **Gameplay Evaluation**: Exact matches (all Greens), partial matches (Yellow/Gray), duplicate letter handling (`apple` + `puppy`).
- ✅ **Limits & Controls**: Input length checks, game over after 6 attempts, multi-round player state isolation.

---

## Project Structure

```
CryptoWordleWeb/
├── contracts/
│   └── WordleOnChain.sol       # Core smart contract
├── scripts/
│   ├── deploy.js               # Deployment script with batched 6,030-word upload
│   └── words6030.json          # 6,030 curated 5-letter English words
├── test/
│   └── WordleOnChain.test.js   # 30 comprehensive Hardhat unit tests
├── frontend/
│   ├── public/
│   │   └── index.html
│   └── src/
│       ├── App.jsx             # Main application layout & round display
│       ├── App.css             # Wordle dark theme styles
│       ├── index.js            # React entry point
│       ├── abi/
│       │   └── WordleOnChain.json  # Synced contract ABI
│       ├── components/
│       │   ├── ConnectWallet.jsx   # MetaMask connection & network helper
│       │   ├── WordleBoard.jsx     # 6×5 color grid with flip animations
│       │   ├── GuessInput.jsx      # Input validation & submit handler
│       │   └── GameStatus.jsx      # Win/loss banners & revealed solution display
│       ├── hooks/
│       │   └── useWordle.js        # Web3 game state, events & error parsing
│       └── utils/
│           └── contract.js         # ethers.js contract connection factory
├── hardhat.config.js
├── package.json
└── README.md
```

---

## Smart Contract API

### Core Gameplay

#### `submitGuess(string memory guess) → uint8[5]`
Submits a 5-letter guess.
- Validates guess length (5 letters) and dictionary membership (`isValidWord`).
- Evaluates against the active round solution.
- Emits `GuessResult(player, gameId, guess, result, attemptNumber)`.
- If won, emits `GameWon(player, gameId, attempts, solution)`.
- If exhausted (6 attempts), emits `GameOver(player, gameId, solution)`.

#### `getRevealedSolution(uint256 _gameId) → string`
Returns the plaintext solution word for round `_gameId`.
- **Requires:** `gameOver[msg.sender][_gameId] == true` OR `_gameId < currentGameId`.

### Round & Word Bank Management (Owner Only)

#### `startRandomGame()`
Selects a new pseudo-random word from `wordBank`, increments `currentGameId`, and commits the new `solutionHash`.

#### `startNewGame(string memory _solution)`
Manually sets a specific 5-letter solution (used for deterministic testing or custom daily puzzles).

#### `addWords(bytes5[] calldata _words)`
Adds new 5-letter words to `wordBank` and enables them in `isValidWord`.

### Views
- `getAttempts(address player) → uint8`: Returns player guesses used in the current round.
- `isGameOver(address player) → bool`: Returns whether the current round has ended for the player.
- `hasPlayerWon(address player) → bool`: Returns whether the player solved the current round.
- `getWordCount() → uint256`: Returns total words in `wordBank`.
- `isValidWord(bytes5 word) → bool`: Checks if a word is in the dictionary.

---

## Security Considerations

| Concern                      | Status                                                     |
|:-----------------------------|:-----------------------------------------------------------|
| **Reentrancy**               | ✅ Safe — state transitions occur prior to event emission; no external calls. |
| **Integer Overflow**         | ✅ Safe — Solidity 0.8.20 includes built-in overflow checks. |
| **Access Control**           | ✅ Sensitive functions (`startRandomGame`, `addWords`, `startNewGame`) guarded by `onlyOwner`. |
| **Dictionary Spam**          | ✅ Safe — guesses must exist in `isValidWord`. |
| **Solution Peeking**         | ✅ Safe — `getRevealedSolution` is restricted to finished players or expired rounds. |
| **Gas Griefing**             | ✅ Bounded loops (fixed 5-character length, O(1) word checks). |

---

## Potential Extensions

- **Chainlink VRF v2.5**: Upgrade pseudo-randomness to verifiable, tamper-proof randomness for competitive staking.
- **Zero-Knowledge Proofs (zk-SNARKs)**: Validate guesses against hidden solutions without revealing storage slots off-chain.
- **NFT Achievements**: Mint dynamic ERC-721 trophies recording win streaks and guess distributions.
- **ERC-20 Staking Pool**: Winner-takes-all daily jackpot pools based on fewest attempts.

---

## License

MIT
