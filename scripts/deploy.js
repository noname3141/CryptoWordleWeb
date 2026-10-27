const hre = require("hardhat");

async function main() {
  const solution = "crane"; // Default word for local testing
  console.log("Deploying WordleOnChain with solution hash...");

  const WordleOnChain = await hre.ethers.getContractFactory("WordleOnChain");
  const wordle = await WordleOnChain.deploy(solution);
  await wordle.waitForDeployment();

  const address = await wordle.getAddress();
  console.log(`WordleOnChain deployed to: ${address}`);
  console.log(`Solution hash: ${await wordle.solutionHash()}`);
  console.log("");
  console.log("--- Save this address in your frontend .env ---");
  console.log(`REACT_APP_CONTRACT_ADDRESS=${address}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
