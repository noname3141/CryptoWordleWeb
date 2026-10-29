const { expect } = require("chai");
const { ethers } = require("hardhat");

function toBytes5(word) {
  return ethers.dataSlice(ethers.toUtf8Bytes(word.toLowerCase().trim()), 0, 5);
}

describe("WordleOnChain", function () {
  let wordle;
  let owner;
  let player1;
  let player2;
  const sampleWords = ["crane", "apple", "react", "ghost", "tight", "puppy", "house", "fight", "light", "might", "sight"].map(toBytes5);

  beforeEach(async function () {
    [owner, player1, player2] = await ethers.getSigners();
    const WordleOnChain = await ethers.getContractFactory("WordleOnChain");
    wordle = await WordleOnChain.deploy(sampleWords);
    await wordle.waitForDeployment();
  });

  // ---------------------------------------------------------------------------
  // Deployment Tests
  // ---------------------------------------------------------------------------
  describe("Deployment", function () {
    it("should set the correct owner", async function () {
      expect(await wordle.owner()).to.equal(owner.address);
    });

    it("should initialize with sample words in wordBank", async function () {
      expect(await wordle.getWordCount()).to.equal(sampleWords.length);
    });

    it("should start with currentGameId = 1", async function () {
      expect(await wordle.currentGameId()).to.equal(1);
    });

    it("should have a non-zero initial solution hash", async function () {
      const hash = await wordle.solutionHash();
      expect(hash).to.not.equal(ethers.ZeroHash);
    });

    it("should set MAX_GUESSES to 6", async function () {
      expect(await wordle.MAX_GUESSES()).to.equal(6);
    });

    it("should mark all initial words as valid in the dictionary", async function () {
      for (const word of sampleWords) {
        expect(await wordle.isValidWord(word)).to.be.true;
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Word Bank & Random Selection
  // ---------------------------------------------------------------------------
  describe("Word Bank & Random Games", function () {
    it("should allow owner to add more words", async function () {
      const newWords = ["train", "plant"].map(toBytes5);
      await expect(wordle.connect(owner).addWords(newWords))
        .to.emit(wordle, "WordsAdded")
        .withArgs(2, sampleWords.length + 2);

      expect(await wordle.getWordCount()).to.equal(sampleWords.length + 2);
    });

    it("should mark newly added words as valid", async function () {
      const newWords = ["train", "plant"].map(toBytes5);
      await wordle.connect(owner).addWords(newWords);

      expect(await wordle.isValidWord(toBytes5("train"))).to.be.true;
      expect(await wordle.isValidWord(toBytes5("plant"))).to.be.true;
    });

    it("should reject non-owner adding words", async function () {
      const newWords = ["train"].map(toBytes5);
      await expect(
        wordle.connect(player1).addWords(newWords)
      ).to.be.revertedWith("Only owner");
    });

    it("should allow owner to start a new random game", async function () {
      const initialGameId = await wordle.currentGameId();
      await expect(wordle.connect(owner).startRandomGame())
        .to.emit(wordle, "NewGameStarted");

      expect(await wordle.currentGameId()).to.equal(initialGameId + 1n);
    });
  });

  // ---------------------------------------------------------------------------
  // Dictionary Validation (Feature 1)
  // ---------------------------------------------------------------------------
  describe("Dictionary Validation", function () {
    beforeEach(async function () {
      await wordle.connect(owner).startNewGame("crane");
    });

    it("should reject a guess that is not in the dictionary", async function () {
      await expect(
        wordle.connect(player1).submitGuess("zzzzz")
      ).to.be.revertedWith("Word not in dictionary");
    });

    it("should reject another made-up word", async function () {
      await expect(
        wordle.connect(player1).submitGuess("abcde")
      ).to.be.revertedWith("Word not in dictionary");
    });

    it("should accept a valid dictionary word", async function () {
      // "ghost" is in our sampleWords
      await expect(
        wordle.connect(player1).submitGuess("ghost")
      ).to.not.be.reverted;
    });

    it("should accept case-insensitive valid words", async function () {
      await expect(
        wordle.connect(player1).submitGuess("GHOST")
      ).to.not.be.reverted;
    });
  });

  // ---------------------------------------------------------------------------
  // Solution Reveal (Feature 2)
  // ---------------------------------------------------------------------------
  describe("Solution Reveal", function () {
    beforeEach(async function () {
      await wordle.connect(owner).startNewGame("crane");
    });

    it("should hide the solution while the player is still playing", async function () {
      const gid = await wordle.currentGameId();
      await expect(
        wordle.connect(player1).getRevealedSolution(gid)
      ).to.be.revertedWith("Solution hidden until game over");
    });

    it("should reveal the solution after the player wins", async function () {
      const gid = await wordle.currentGameId();
      await wordle.connect(player1).submitGuess("crane");

      const revealed = await wordle.connect(player1).getRevealedSolution(gid);
      expect(revealed).to.equal("crane");
    });

    it("should reveal the solution after the player loses (6 wrong guesses)", async function () {
      const gid = await wordle.currentGameId();
      await wordle.connect(player1).submitGuess("ghost");
      await wordle.connect(player1).submitGuess("fight");
      await wordle.connect(player1).submitGuess("light");
      await wordle.connect(player1).submitGuess("might");
      await wordle.connect(player1).submitGuess("sight");
      await wordle.connect(player1).submitGuess("tight");

      const revealed = await wordle.connect(player1).getRevealedSolution(gid);
      expect(revealed).to.equal("crane");
    });

    it("should reveal old round solutions once the round advances", async function () {
      const gid = await wordle.currentGameId();

      // Player1 hasn't played at all in this round
      await expect(
        wordle.connect(player1).getRevealedSolution(gid)
      ).to.be.revertedWith("Solution hidden until game over");

      // Owner starts a new round — old round is now over for everyone
      await wordle.connect(owner).startNewGame("house");

      // Now player1 can see the old round's solution even without having played
      const revealed = await wordle.connect(player1).getRevealedSolution(gid);
      expect(revealed).to.equal("crane");
    });

    it("should include solution in GameWon event", async function () {
      const gid = await wordle.currentGameId();
      await expect(wordle.connect(player1).submitGuess("crane"))
        .to.emit(wordle, "GameWon")
        .withArgs(player1.address, gid, 1, "crane");
    });

    it("should include solution in GameOver event", async function () {
      const gid = await wordle.currentGameId();
      await wordle.connect(player1).submitGuess("ghost");
      await wordle.connect(player1).submitGuess("fight");
      await wordle.connect(player1).submitGuess("light");
      await wordle.connect(player1).submitGuess("might");
      await wordle.connect(player1).submitGuess("sight");

      await expect(wordle.connect(player1).submitGuess("tight"))
        .to.emit(wordle, "GameOver")
        .withArgs(player1.address, gid, "crane");
    });
  });

  // ---------------------------------------------------------------------------
  // Deterministic Gameplay (via startNewGame)
  // ---------------------------------------------------------------------------
  describe("Deterministic Gameplay", function () {
    beforeEach(async function () {
      await wordle.connect(owner).startNewGame("crane");
    });

    it("should return all 2s for an exact match", async function () {
      const tx = await wordle.connect(player1).submitGuess("crane");
      const receipt = await tx.wait();

      const guessEvent = receipt.logs
        .map((log) => {
          try {
            return wordle.interface.parseLog({ topics: log.topics, data: log.data });
          } catch {
            return null;
          }
        })
        .find((e) => e && e.name === "GuessResult");

      expect(guessEvent).to.not.be.undefined;
      const result = guessEvent.args.result.map(Number);
      expect(result).to.deep.equal([2, 2, 2, 2, 2]);
    });

    it("should emit GameWon event on correct guess", async function () {
      const gid = await wordle.currentGameId();
      await expect(wordle.connect(player1).submitGuess("crane"))
        .to.emit(wordle, "GameWon")
        .withArgs(player1.address, gid, 1, "crane");
    });

    it("should mark the player as having won", async function () {
      await wordle.connect(player1).submitGuess("crane");
      expect(await wordle.hasPlayerWon(player1.address)).to.be.true;
      expect(await wordle.isGameOver(player1.address)).to.be.true;
    });

    it("should handle case-insensitive guesses", async function () {
      const gid = await wordle.currentGameId();
      await expect(wordle.connect(player1).submitGuess("CRANE"))
        .to.emit(wordle, "GameWon")
        .withArgs(player1.address, gid, 1, "crane");
    });

    it("should return correct Yellow and Gray pattern", async function () {
      // Solution: "crane", Guess: "react"
      // r -> Yellow (1), e -> Yellow (1), a -> Green (2), c -> Yellow (1), t -> Gray (0)
      const tx = await wordle.connect(player1).submitGuess("react");
      const receipt = await tx.wait();

      const guessEvent = receipt.logs
        .map((log) => {
          try {
            return wordle.interface.parseLog({ topics: log.topics, data: log.data });
          } catch {
            return null;
          }
        })
        .find((e) => e && e.name === "GuessResult");

      const result = guessEvent.args.result.map(Number);
      expect(result).to.deep.equal([1, 1, 2, 1, 0]);
    });
  });

  // ---------------------------------------------------------------------------
  // Duplicate Letter Handling
  // ---------------------------------------------------------------------------
  describe("Duplicate Letter Handling", function () {
    beforeEach(async function () {
      await wordle.connect(owner).startNewGame("apple");
    });

    it("should handle guess with more duplicates than solution", async function () {
      // Solution: "apple", Guess: "puppy" -> [1, 0, 2, 0, 0]
      const tx = await wordle.connect(player1).submitGuess("puppy");
      const receipt = await tx.wait();

      const guessEvent = receipt.logs
        .map((log) => {
          try {
            return wordle.interface.parseLog({ topics: log.topics, data: log.data });
          } catch {
            return null;
          }
        })
        .find((e) => e && e.name === "GuessResult");

      const result = guessEvent.args.result.map(Number);
      expect(result).to.deep.equal([1, 0, 2, 0, 0]);
    });
  });

  // ---------------------------------------------------------------------------
  // Input Validation & Max Attempts
  // ---------------------------------------------------------------------------
  describe("Input Validation & Limits", function () {
    beforeEach(async function () {
      await wordle.connect(owner).startNewGame("crane");
    });

    it("should reject guesses that are not 5 letters", async function () {
      await expect(wordle.connect(player1).submitGuess("hi")).to.be.revertedWith(
        "Guess must be 5 letters"
      );
    });

    it("should reject guesses after game is over", async function () {
      await wordle.connect(player1).submitGuess("crane");
      await expect(
        wordle.connect(player1).submitGuess("house")
      ).to.be.revertedWith("Game is already over");
    });

    it("should emit GameOver and reject 7th attempt", async function () {
      const gid = await wordle.currentGameId();
      await wordle.connect(player1).submitGuess("ghost");
      await wordle.connect(player1).submitGuess("fight");
      await wordle.connect(player1).submitGuess("light");
      await wordle.connect(player1).submitGuess("might");
      await wordle.connect(player1).submitGuess("sight");

      await expect(wordle.connect(player1).submitGuess("tight"))
        .to.emit(wordle, "GameOver")
        .withArgs(player1.address, gid, "crane");

      await expect(
        wordle.connect(player1).submitGuess("react")
      ).to.be.revertedWith("Game is already over");
    });
  });

  // ---------------------------------------------------------------------------
  // Multi-Round Isolation
  // ---------------------------------------------------------------------------
  describe("Multi-Round Isolation", function () {
    it("should allow a player to play again in a new round after winning", async function () {
      await wordle.connect(owner).startNewGame("crane");
      await wordle.connect(player1).submitGuess("crane");
      expect(await wordle.isGameOver(player1.address)).to.be.true;

      // Start new round
      await wordle.connect(owner).startNewGame("house");
      expect(await wordle.isGameOver(player1.address)).to.be.false;
      expect(await wordle.getAttempts(player1.address)).to.equal(0);

      // Guess in new round
      await wordle.connect(player1).submitGuess("house");
      expect(await wordle.hasPlayerWon(player1.address)).to.be.true;
    });
  });
});
