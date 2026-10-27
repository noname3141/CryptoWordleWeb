import React, { useState, useCallback } from "react";

/**
 * ConnectWallet — Handles MetaMask wallet connection and displays the
 * connected address.  Prompts the user to switch to Hardhat's local network
 * (chainId 31337) if they're on a different chain.
 */
const ConnectWallet = ({ account, setAccount }) => {
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState(null);

  const connectWallet = useCallback(async () => {
    setIsConnecting(true);
    setError(null);

    try {
      if (!window.ethereum) {
        throw new Error("MetaMask not detected. Please install MetaMask.");
      }

      // Request account access
      const accounts = await window.ethereum.request({
        method: "eth_requestAccounts",
      });

      if (accounts.length === 0) {
        throw new Error("No accounts found.");
      }

      setAccount(accounts[0]);

      // Check if we're on the right network (Hardhat local = 31337)
      const chainId = await window.ethereum.request({
        method: "eth_chainId",
      });

      if (chainId !== "0x7a69") {
        // 31337 in hex
        try {
          await window.ethereum.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: "0x7a69" }],
          });
        } catch (switchError) {
          // Chain not added — try to add it
          if (switchError.code === 4902) {
            await window.ethereum.request({
              method: "wallet_addEthereumChain",
              params: [
                {
                  chainId: "0x7a69",
                  chainName: "Hardhat Local",
                  rpcUrls: ["http://127.0.0.1:8545"],
                  nativeCurrency: {
                    name: "ETH",
                    symbol: "ETH",
                    decimals: 18,
                  },
                },
              ],
            });
          }
        }
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsConnecting(false);
    }
  }, [setAccount]);

  const truncateAddress = (addr) =>
    `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  return (
    <div className="connect-wallet">
      {account ? (
        <div className="wallet-connected">
          <span className="wallet-dot" />
          <span className="wallet-address">{truncateAddress(account)}</span>
          <span className="wallet-badge">Connected</span>
        </div>
      ) : (
        <button
          className="connect-btn"
          onClick={connectWallet}
          disabled={isConnecting}
        >
          {isConnecting ? "Connecting..." : "🦊 Connect Wallet"}
        </button>
      )}
      {error && <p className="wallet-error">{error}</p>}
    </div>
  );
};

export default ConnectWallet;
