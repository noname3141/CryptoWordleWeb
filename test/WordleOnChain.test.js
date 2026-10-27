const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("WordleOnChain", function () {
  let wordle;
  let owner;
  let player1;
  let player2;

  // Deploy a fresh contract before each test with solution "crane"
  beforeEach(async function () {
    [owner, player1, player2] = await ethers.getSigners();
    const WordleOnChain = await ethers.getContractFactory("WordleOnChain");
    wordle = await WordleOnChain.deploy("crane");
    await wordle.waitForDeployment();
  });

  // ---------------------------------------------------------------------------
  // Deployment Tests
  // ---------------------------------------------------------------------------
  describe("Deployment", function () {
    it("should set the correct owner", async function () {
      expect(await wordle.owner()).to.equal(owner.address);
    });

    it("should store the correct solution hash", async function () {
      const expectedHash = ethers.keccak256(
        ethers.toUtf8Bytes("crane")
      );
      expect(await wordle.solutionHash()).to.equal(expectedHash);
    });

    it("should reject a solution that is not 5 letters", async function () {
      const WordleOnChain = await ethers.getContractFactory("WordleOnChain");
      await expect(WordleOnChain.deploy("hi")).to.be.revertedWith(
        "Solution must be 5 letters"
      );
    });

    it("should set MAX_GUESSES to 6", async function () {
      expect(await wordle.MAX_GUESSES()).to.equal(6);
    });
  });

  // ---------------------------------------------------------------------------
  // Correct Guess (All Greens)
  // ---------------------------------------------------------------------------
  describe("Correct Guess", function () {
    it("should return all 2s for an exact match", async function () {
      const tx = await wordle.connect(player1).submitGuess("crane");
      const receipt = await tx.wait();

      // Parse the GuessResult event
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
      await expect(wordle.connect(player1).submitGuess("crane"))
        .to.emit(wordle, "GameWon")
        .withArgs(player1.address, 1);
    });

    it("should mark the player as having won", async function () {
      await wordle.connect(player1).submitGuess("crane");
      expect(await wordle.hasWon(player1.address)).to.be.true;
      expect(await wordle.gameOver(player1.address)).to.be.true;
    });

    it("should handle case-insensitive guesses", async function () {
      await expect(wordle.connect(player1).submitGuess("CRANE"))
        .to.emit(wordle, "GameWon")
        .withArgs(player1.address, 1);
    });
  });

  // ---------------------------------------------------------------------------
  // Partial Match (Yellow / Gray)
  // ---------------------------------------------------------------------------
  describe("Partial Match", function () {
    it("should return correct Yellow and Gray pattern", async function () {
      // Solution: "crane"
      // Guess:    "react"
      //   r: in solution at pos 1, guessed at pos 0 → Yellow (1)
      //   e: in solution at pos 4, guessed at pos 1 → Yellow (1)
      //   a: in solution at pos 2, guessed at pos 2 → Green  (2)
      //   c: in solution at pos 0, guessed at pos 3 → Yellow (1)
      //   t: not in solution                        → Gray   (0)
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

    it("should return all 0s for a completely wrong guess", async function () {
      // Solution: "crane" — none of these letters appear
      const tx = await wordle.connect(player1).submitGuess("fight");
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
      expect(result).to.deep.equal([0, 0, 0, 0, 0]);
    });
  });

  // ---------------------------------------------------------------------------
  // Duplicate Letter Handling
  // ---------------------------------------------------------------------------
  describe("Duplicate Letter Handling", function () {
    let wordleApple;

    beforeEach(async function () {
      // Deploy with solution "apple" for duplicate-letter tests
      const WordleOnChain = await ethers.getContractFactory("WordleOnChain");
      wordleApple = await WordleOnChain.deploy("apple");
      await wordleApple.waitForDeployment();
    });

    it("should handle guess with more duplicates than solution", async function () {
      // Solution: "apple" (has 'p' at positions 1 and 2)
      // Guess:    "puppy"
      //   p(0): not at pos 0 in solution, but unused 'p' at pos 1 → Yellow (1)
      //   u(1): not in solution → Gray (0)
      //   p(2): at pos 2 in solution → Green (2)
      //   p(3): no more unused 'p's → Gray (0)
      //   y(4): not in solution → Gray (0)
      const tx = await wordleApple.connect(player1).submitGuess("puppy");
      const receipt = await tx.wait();

      const guessEvent = receipt.logs
        .map((log) => {
          try {
            return wordleApple.interface.parseLog({ topics: log.topics, data: log.data });
          } catch {
            return null;
          }
        })
        .find((e) => e && e.name === "GuessResult");

      const result = guessEvent.args.result.map(Number);
      expect(result).to.deep.equal([1, 0, 2, 0, 0]);
    });

    it("should correctly handle double letters in solution", async function () {
      // Solution: "apple"
      // Guess:    "paper"
      //   p(0): not at pos 0, but unused 'p' at pos 1 → Yellow (1)
      //   a(1): not at pos 1, but unused 'a' at pos 0 → Yellow (1)
      //   p(2): at pos 2 → Green (2)
      //   e(3): not at pos 3, but unused 'e' at pos 4 → Yellow (1)
      //   r(4): not in solution → Gray (0)
      const tx = await wordleApple.connect(player1).submitGuess("paper");
      const receipt = await tx.wait();

      const guessEvent = receipt.logs
        .map((log) => {
          try {
            return wordleApple.interface.parseLog({ topics: log.topics, data: log.data });
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
  // Input Validation
  // ---------------------------------------------------------------------------
  describe("Input Validation", function () {
    it("should reject guesses that are not 5 letters", async function () {
      await expect(
        wordle.connect(player1).submitGuess("hi")
      ).to.be.revertedWith("Guess must be 5 letters");

      await expect(
        wordle.connect(player1).submitGuess("toolong")
      ).to.be.revertedWith("Guess must be 5 letters");
    });

    it("should reject guesses after game is over (won)", async function () {
      await wordle.connect(player1).submitGuess("crane"); // wins
      await expect(
        wordle.connect(player1).submitGuess("house")
      ).to.be.revertedWith("Game is already over");
    });

    it("should reject guesses after 6 attempts", async function () {
      // Use 6 wrong guesses
      await wordle.connect(player1).submitGuess("ghost");
      await wordle.connect(player1).submitGuess("fight");
      await wordle.connect(player1).submitGuess("light");
      await wordle.connect(player1).submitGuess("might");
      await wordle.connect(player1).submitGuess("sight");
      await wordle.connect(player1).submitGuess("tight"); // 6th attempt

      await expect(
        wordle.connect(player1).submitGuess("bight")
      ).to.be.revertedWith("Game is already over");
    });

    it("should emit GameOver after 6 failed attempts", async function () {
      await wordle.connect(player1).submitGuess("ghost");
      await wordle.connect(player1).submitGuess("fight");
      await wordle.connect(player1).submitGuess("light");
      await wordle.connect(player1).submitGuess("might");
      await wordle.connect(player1).submitGuess("sight");

      await expect(wordle.connect(player1).submitGuess("tight"))
        .to.emit(wordle, "GameOver")
        .withArgs(player1.address);
    });
  });

  // ---------------------------------------------------------------------------
  // Access Control
  // ---------------------------------------------------------------------------
  describe("Access Control", function () {
    it("should allow only the owner to start a new game", async function () {
      await expect(
        wordle.connect(player1).startNewGame("house")
      ).to.be.revertedWith("Only owner");
    });

    it("should allow the owner to start a new game", async function () {
      await expect(wordle.connect(owner).startNewGame("house"))
        .to.emit(wordle, "NewGameStarted");
    });

    it("should update the solution hash after starting a new game", async function () {
      const oldHash = await wordle.solutionHash();
      await wordle.connect(owner).startNewGame("house");
      const newHash = await wordle.solutionHash();

      expect(oldHash).to.not.equal(newHash);
      expect(newHash).to.equal(
        ethers.keccak256(ethers.toUtf8Bytes("house"))
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Multi-Player Isolation
  // ---------------------------------------------------------------------------
  describe("Multi-Player", function () {
    it("should track attempts independently per player", async function () {
      await wordle.connect(player1).submitGuess("ghost");
      await wordle.connect(player1).submitGuess("fight");

      await wordle.connect(player2).submitGuess("light");

      expect(await wordle.getAttempts(player1.address)).to.equal(2);
      expect(await wordle.getAttempts(player2.address)).to.equal(1);
    });

    it("should allow one player to win while another continues", async function () {
      await wordle.connect(player1).submitGuess("crane"); // wins
      expect(await wordle.hasWon(player1.address)).to.be.true;

      // Player 2 is unaffected
      expect(await wordle.hasWon(player2.address)).to.be.false;
      expect(await wordle.isGameOver(player2.address)).to.be.false;

      await wordle.connect(player2).submitGuess("ghost"); // still playing
      expect(await wordle.getAttempts(player2.address)).to.equal(1);
    });
  });
});
