const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

// Helper to convert an ASCII 5-letter word to bytes5
function toBytes5(word) {
  return hre.ethers.dataSlice(hre.ethers.toUtf8Bytes(word.toLowerCase().trim()), 0, 5);
}

async function main() {
  console.log("Loading 500-word dictionary...");
  const wordsPath = path.join(__dirname, "words500.json");
  const wordsList = JSON.parse(fs.readFileSync(wordsPath, "utf-8"));

  const bytes5Words = wordsList.map(toBytes5);
  console.log(`Prepared ${bytes5Words.length} words formatted as bytes5.`);

  const WordleOnChain = await hre.ethers.getContractFactory("WordleOnChain");

  // Deploy with first batch (e.g. 200 words) to stay well within single transaction gas limit
  const BATCH_SIZE = 200;
  const initialBatch = bytes5Words.slice(0, BATCH_SIZE);

  console.log(`Deploying WordleOnChain with initial batch of ${initialBatch.length} words...`);
  const wordle = await WordleOnChain.deploy(initialBatch);
  await wordle.waitForDeployment();

  const address = await wordle.getAddress();
  console.log(`WordleOnChain deployed to: ${address}`);

  // Upload remaining words in chunks
  for (let i = BATCH_SIZE; i < bytes5Words.length; i += BATCH_SIZE) {
    const chunk = bytes5Words.slice(i, i + BATCH_SIZE);
    console.log(`Uploading words ${i + 1} to ${i + chunk.length}...`);
    const tx = await wordle.addWords(chunk);
    await tx.wait();
  }

  const totalWords = await wordle.getWordCount();
  const currentGameId = await wordle.currentGameId();
  const solutionHash = await wordle.solutionHash();

  console.log(`\nDeployment Complete!`);
  console.log(`Total words in bank: ${totalWords.toString()}`);
  console.log(`Initial Game ID: ${currentGameId.toString()}`);
  console.log(`Initial Solution Hash: ${solutionHash}`);
  console.log("");
  console.log("--- Save this address in your frontend .env ---");
  console.log(`REACT_APP_CONTRACT_ADDRESS=${address}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
