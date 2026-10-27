# Wordle On-Chain 🟩🟨⬜

A provably fair, on-chain implementation of the Wordle word-guessing game. The core game logic — word validation, attempt tracking, and result computation — executes entirely within an Ethereum smart contract. Each guess is a blockchain transaction, and every game outcome is cryptographically verifiable.

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [How It Works](#how-it-works)
- [Cryptographic Hashing & Fairness](#cryptographic-hashing--fairness)
- [Prerequisites](#prerequisites)
- [Installation & Setup](#installation--setup)
- [Deploying the Contract](#deploying-the-contract)
- [Running the Frontend](#running-the-frontend)
- [Running Tests](#running-tests)
- [Project Structure](#project-structure)
- [Smart Contract API](#smart-contract-api)
- [Security Considerations](#security-considerations)
- [Potential Extensions](#potential-extensions)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (React)                         │
│  ┌──────────────┐  ┌────────────┐  ┌─────────────────────┐  │
│  │ ConnectWallet│  │ WordleBoard│  │ GuessInput          │  │
│  └──────┬───────┘  └─────▲──────┘  └──────────┬──────────┘  │
│         │                │                     │             │
│         │          ┌─────┴─────┐               │             │
│         └──────────│useWordle  │◄──────────────┘             │
│                    │  (hook)   │                              │
│                    └─────┬─────┘                              │
│                          │ ethers.js                          │
└──────────────────────────┼───────────────────────────────────┘
                           │
                    ┌──────▼──────┐
                    │  Ethereum   │
                    │  (Hardhat)  │
                    │             │
                    │ WordleOnChain.sol                         │
                    │  - solutionHash                           │
                    │  - submitGuess()                          │
                    │  - Events: GuessResult, GameWon, GameOver │
                    └─────────────┘
```

**Data Flow:**
1. User connects MetaMask wallet via `ConnectWallet` component.
2. User types a 5-letter word into `GuessInput`.
3. `useWordle` hook calls `contract.submitGuess(guess)` — this sends a transaction.
4. The EVM executes the letter-comparison logic and emits a `GuessResult` event.
5. The hook parses the event from the transaction receipt and updates the `WordleBoard` grid.
6. If the player wins or exhausts 6 guesses, `GameWon` or `GameOver` events are emitted.

---

## How It Works

| Result Code | Color  | Meaning                         |
|:-----------:|:------:|:--------------------------------|
| `2`         | 🟩 Green  | Correct letter, correct position |
| `1`         | 🟨 Yellow | Correct letter, wrong position   |
| `0`         | ⬜ Gray   | Letter not in solution           |

The contract uses a **two-pass algorithm** for accurate duplicate-letter handling:

1. **Pass 1 (Greens):** Scan for exact positional matches. Mark matched solution positions as "used."
2. **Pass 2 (Yellows):** For each non-green guess letter, scan for an unused occurrence in the solution. If found, mark Yellow and consume that position.

**Example:** Solution = `apple`, Guess = `puppy`
- Pass 1: position 2 (`p`==`p`) → Green. Used: `[_,_,✓,_,_]`
- Pass 2: `p` at 0 → finds unused `p` at 1 → Yellow. `u` → Gray. `p` at 3 → no unused `p` → Gray. `y` → Gray.
- **Result: `[1, 0, 2, 0, 0]`**

---

## Cryptographic Hashing & Fairness

The solution word is committed to the blockchain via its `keccak256` hash at deployment time:

```
solutionHash = keccak256(abi.encodePacked("crane"))
             = 0x1b0b9...  (32-byte digest)
```

### Why hash?

- **Commitment scheme:** The hash is published on-chain before any player submits a guess. After the game, anyone can verify that the word was never changed: `keccak256(revealedWord) == solutionHash`.
- **Tamper-proof:** Neither the contract owner nor any third party can modify the solution mid-game without changing the hash (which would be visible on-chain).

### Known Limitations

- **Plaintext storage trade-off:** To enable per-letter validation on-chain, the solution is also stored as a `string private solution`. The `private` keyword does NOT hide data from off-chain observers — raw storage is readable via `eth_getStorageAt`.
- **Small keyspace:** The 5-letter English word space (~12,000 common words) is small enough to brute-force against the hash.
- **Production solutions:**
  - **Salted hashing:** `keccak256(abi.encodePacked(word, salt))` prevents rainbow tables. Reveal `(word, salt)` post-game.
  - **Commit-reveal with oracle:** Store only the hash; an off-chain service evaluates guesses and posts signed results.
  - **ZK Proofs (zkSNARKs/Noir):** Prove correct evaluation without revealing the word.

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
cd web3_dummyps
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
npm run node
```

This starts a Hardhat node at `http://127.0.0.1:8545` with pre-funded test accounts.

**Terminal 2 — Deploy the contract:**

```bash
npm run deploy:local
```

Expected output:

```
Deploying WordleOnChain with solution hash...
WordleOnChain deployed to: 0x5FbDB2315678afecb367f032d93F642f64180aa3
Solution hash: 0x1b0b9...
```

> **Note:** The default solution word for local testing is `crane`. Change it in `scripts/deploy.js` before deploying.

### Configure MetaMask

1. Add a custom network: RPC URL `http://127.0.0.1:8545`, Chain ID `31337`.
2. Import one of Hardhat's test accounts using the private key shown in Terminal 1.

---

## Running the Frontend

```bash
cd frontend
npm start
```

The app will open at `http://localhost:3000`.

If the contract was deployed to a different address, set it in the frontend:

```bash
# In frontend/.env
REACT_APP_CONTRACT_ADDRESS=0xYourDeployedAddress
```

---

## Running Tests

```bash
npm test
```

This runs the full test suite covering:
- ✅ Deployment validation (hash, owner)
- ✅ Correct guess detection (all Greens + GameWon event)
- ✅ Partial match patterns (Yellow/Gray)
- ✅ Duplicate letter handling (`apple` + `puppy`)
- ✅ Input validation (length checks)
- ✅ Game-over enforcement (max 6 guesses)
- ✅ Access control (`startNewGame` owner-only)
- ✅ Multi-player isolation

---

## Project Structure

```
web3_dummyps/
├── contracts/
│   └── WordleOnChain.sol       # Core smart contract
├── scripts/
│   └── deploy.js               # Hardhat deployment script
├── test/
│   └── WordleOnChain.test.js   # Comprehensive test suite
├── frontend/
│   ├── public/
│   │   └── index.html
│   └── src/
│       ├── App.jsx             # Root component
│       ├── App.css             # Dark theme styles
│       ├── index.js            # React entry point
│       ├── abi/
│       │   └── WordleOnChain.json  # Contract ABI
│       ├── components/
│       │   ├── ConnectWallet.jsx    # Wallet connection UI
│       │   ├── WordleBoard.jsx     # 6×5 tile grid
│       │   ├── GuessInput.jsx      # Text input + submit
│       │   └── GameStatus.jsx      # Win/loss/error display
│       ├── hooks/
│       │   └── useWordle.js        # Game state + contract calls
│       └── utils/
│           └── contract.js         # ethers.js contract setup
├── hardhat.config.js
├── package.json
└── README.md
```

---

## Smart Contract API

### `submitGuess(string memory guess) → uint8[5]`

Submit a 5-letter word guess. Returns an array of result codes per letter.

| Param   | Type     | Description              |
|:--------|:---------|:-------------------------|
| `guess` | `string` | 5 ASCII letters (case-insensitive) |

**Reverts if:** game is over, no attempts remaining, or guess is not 5 letters.

**Emits:** `GuessResult(player, guess, result, attemptNumber)`  
**May also emit:** `GameWon(player, attempts)` or `GameOver(player)`

### `startNewGame(string memory _solution)`

Owner-only. Sets a new solution word for the next round.

### `getAttempts(address player) → uint8`

View function. Returns the number of guesses a player has submitted.

### `isGameOver(address player) → bool`

View function. Returns whether the player's game has ended.

---

## Security Considerations

| Concern                      | Status                                                     |
|:-----------------------------|:-----------------------------------------------------------|
| Reentrancy                   | ✅ Safe — no external calls or ETH transfers               |
| Integer overflow             | ✅ Safe — Solidity 0.8.x built-in checks                   |
| Access control               | ✅ `startNewGame` restricted to `owner`                    |
| Solution privacy             | ⚠️ Extractable from storage — acceptable for MVP           |
| Front-running                | ⚠️ Not critical for single-player; add commit-reveal for competitive |
| Gas griefing                 | ✅ Fixed-size operations (5 bytes), bounded loops           |

---

## Potential Extensions

- **NFT Rewards:** Mint ERC-721 tokens for winning streaks.
- **Token Staking:** Players stake ERC-20 tokens; winners take the pot.
- **On-Chain Leaderboard:** Store win rates and ELO ratings as Soulbound Tokens.
- **Chainlink VRF Word Selection:** Randomly select from an on-chain word bank.
- **ZK Proofs:** Use Circom/Noir circuits for solution privacy with full on-chain validation.
- **Game Rounds (`gameId`):** Key player state by round ID for proper game resets.

---

## License

MIT
