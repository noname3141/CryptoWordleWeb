import { ethers } from "ethers";
import WordleABI from "../abi/WordleOnChain.json";

// Default to the first Hardhat-deployed contract address on localhost
const CONTRACT_ADDRESS =
  process.env.REACT_APP_CONTRACT_ADDRESS ||
  "0x5FbDB2315678afecb367f032d93F642f64180aa3";

/**
 * Returns an ethers.js BrowserProvider connected to the user's wallet.
 * Throws if no injected provider (MetaMask, etc.) is detected.
 */
export const getProvider = () => {
  if (window.ethereum) {
    return new ethers.BrowserProvider(window.ethereum);
  }
  throw new Error("No Ethereum wallet found. Please install MetaMask.");
};

/**
 * Returns an ethers.js Contract instance.
 * @param {boolean} withSigner - If true, connects the contract with a signer
 *                                 so write transactions can be sent.
 */
export const getContract = async (withSigner = false) => {
  const provider = getProvider();
  if (withSigner) {
    const signer = await provider.getSigner();
    return new ethers.Contract(CONTRACT_ADDRESS, WordleABI, signer);
  }
  return new ethers.Contract(CONTRACT_ADDRESS, WordleABI, provider);
};

export const CONTRACT_ABI = WordleABI;
export { CONTRACT_ADDRESS };
