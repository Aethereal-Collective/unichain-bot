import { privateKey } from "./accounts/accounts.js";
import { Helper } from "./src/utils/helper.js";
import { ethers } from "ethers";
import input from "input";
import logger from "./src/utils/logger.js";
import Core from "./src/core/core.js";
import sqlite from "./src/core/db/sqlite.js";
import { Config } from "./config/config.js";
import solc from "solc";
import fs from "fs";
import path from "path";

// Gunakan Config.NETWORKS
const NETWORKS = Config.NETWORKS;

async function getUserInputs() {
    const config = {
        bridgeAmount: "0",
        tokenName: "",
        tokenSymbol: "",
        initialSupply: "",
        txAmountMin: "0",
        txAmountMax: "0",
        txCount: 0
    };

    console.log("\nMasukkan parameter transaksi:");
    
    if (Config.USEBRIDGE) {
        config.bridgeAmount = await input.text("Jumlah ETH untuk di-bridge: ");
    }
    if (Config.USECONTRACT) {
        config.tokenName = await input.text("Nama token: ");
        config.tokenSymbol = await input.text("Symbol token: ");
        config.initialSupply = await input.text("Initial supply: ");
    }
    if (Config.USETX) {
        config.txCount = parseInt(await input.text("Jumlah transaksi: "));
    }

    return config;
}

async function showMenu() {
    console.log("\n=== MENU TESTNET ===");
    console.log("1. Bridge ETH");
    console.log("2. Deploy Contract");
    console.log("3. Execute Transactions");
    console.log("4. Keluar");
    
    const choice = await input.text("\nPilih menu (1-4): ");
    return choice;
}

async function executeBridge(wallet, amount) {
    try {
        console.log(`Starting bridge from Sepolia to Unichain...`);
        
        // Data untuk bridge dari Sepolia
        const bridgeData = "0xe11013dd" + 
            "000000000000000000000000" + wallet.address.slice(2) +  
            "0000000000000000000000000000000000000000000000000000000000030d40" + 
            "0000000000000000000000000000000000000000000000000000000000000060" + 
            "0000000000000000000000000000000000000000000000000000000000000007" + 
            "6272696467670a00000000000000000000000000000000000000000000000000";

        const tx = {
            to: NETWORKS.SEPOLIA.BRIDGE_CONTRACT,
            data: bridgeData,
            value: ethers.parseEther(amount)
        };

        // Estimate gas dengan retry
        let gasLimit;
        for (let i = 0; i < 3; i++) {
            try {
                gasLimit = await wallet.provider.estimateGas(tx);
                break;
            } catch (error) {
                if (i === 2) throw error;
                await new Promise(resolve => setTimeout(resolve, 3000));
            }
        }
        tx.gasLimit = gasLimit;

        console.log(`Sending bridge transaction...`);
        const transaction = await wallet.sendTransaction(tx);
        
        console.log(`Transaction sent! Waiting for confirmation...`);
        console.log(`Transaction Hash: ${NETWORKS.SEPOLIA.EXPLORER}${transaction.hash}`);
        
        const receipt = await transaction.wait();
        console.log(`Bridge transaction confirmed!`);
        console.log(`Gas used: ${receipt.gasUsed.toString()}`);
        
        // Tunggu bridge selesai dengan retry mechanism
        let bridgeSuccess = false;
        for (let i = 0; i < 3; i++) {
            try {
                bridgeSuccess = await waitForUnichainBridge(wallet, amount);
                if (bridgeSuccess) break;
            } catch (error) {
                console.log(`Bridge monitoring attempt ${i + 1}/3 failed, retrying in 10s...`);
                await new Promise(resolve => setTimeout(resolve, 10000));
            }
        }
        
        if (!bridgeSuccess) {
            throw new Error("Failed to monitor bridge completion after multiple attempts");
        }
        
    } catch (error) {
        console.error(`Error during bridge: ${error.message}`);
        throw error;
    }
}

async function waitForUnichainBridge(wallet, amount) {
    try {
        console.log(`\nMonitoring bridge status on Unichain...`);
        
        // Retry mechanism untuk koneksi Unichain
        const getUnichainProvider = async (retries = 5) => {
            for (let i = 0; i < retries; i++) {
                try {
                    const provider = new ethers.JsonRpcProvider(NETWORKS.UNICHAIN.RPC, NETWORKS.UNICHAIN.CHAINID);
                    // Test koneksi
                    await provider.getNetwork();
                    return provider;
                } catch (error) {
                    console.log(`Attempt ${i + 1}/${retries}: Retrying Unichain connection in 5s...`);
                    await new Promise(resolve => setTimeout(resolve, 5000));
                }
            }
            throw new Error("Failed to connect to Unichain after multiple attempts");
        };

        const unichainProvider = await getUnichainProvider();
        const initialBalance = await unichainProvider.getBalance(wallet.address);
        
        let attempts = 0;
        const maxAttempts = 30;
        
        while (attempts < maxAttempts) {
            try {
                attempts++;
                
                const currentBalance = await unichainProvider.getBalance(wallet.address);
                
                if (currentBalance > initialBalance) {
                    const blockNumber = await unichainProvider.getBlockNumber();
                    const block = await unichainProvider.getBlock(blockNumber, true);
                    
                    const bridgeTx = block.transactions.find(tx => 
                        tx.to?.toLowerCase() === wallet.address.toLowerCase() && 
                        tx.value > 0
                    );

                    console.log(`\n✅ Bridge completed successfully!`);
                    console.log(`Received ${ethers.formatEther(currentBalance - initialBalance)} ETH on Unichain`);
                    if (bridgeTx) {
                        console.log(`Unichain Transaction Hash: ${NETWORKS.UNICHAIN.EXPLORER}${bridgeTx.hash}`);
                    }
                    return true;
                }
                
                const progress = Math.round((attempts / maxAttempts) * 100);
                console.log(`Waiting for bridge completion... ${progress}% (${attempts}/${maxAttempts})`);
                
                await new Promise(resolve => setTimeout(resolve, 30000)); // 30 detik delay
                
            } catch (error) {
                console.log(`Connection error during attempt ${attempts}, retrying in 5s...`);
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        }
        
        throw new Error("Bridge timeout after 15 minutes");
        
    } catch (error) {
        console.error(`Error monitoring bridge: ${error.message}`);
        throw error;
    }
}

async function deployContract(wallet, tokenName, tokenSymbol, initialSupply) {
    try {
        console.log("\nCompiling Contract...");
        const contractPath = path.resolve("src/core/deployer", "YourToken.sol");
        const contractSource = fs.readFileSync(contractPath, "utf8");

        const input = {
            language: "Solidity",
            sources: {
                ["YourToken.sol"]: {
                    content: contractSource,
                },
            },
            settings: {
                outputSelection: {
                    "*": {
                        "*": ["abi", "evm.bytecode"],
                    },
                },
            },
        };

        const compiledContract = JSON.parse(solc.compile(JSON.stringify(input)));
        const contractData = compiledContract.contracts["YourToken.sol"];
        const contractName = Object.keys(contractData)[0];
        const abi = contractData[contractName].abi;
        const bytecode = contractData[contractName].evm.bytecode.object;

        console.log(`Contract ${contractName} compiled successfully!`);

        // Deploy contract
        console.log("\nDeploying Contract...");
        const factory = new ethers.ContractFactory(abi, bytecode, wallet);
        
        const deployTx = await factory.deploy(
            tokenName,
            tokenSymbol,
            ethers.parseEther(initialSupply)
        );

        console.log(`Deployment transaction sent!`);
        console.log(`Transaction Hash: ${NETWORKS.UNICHAIN.EXPLORER}tx/${deployTx.deploymentTransaction().hash}`);

        console.log(`Waiting for deployment confirmation...`);
        await deployTx.waitForDeployment();
        
        const deployedAddress = await deployTx.getAddress();
        console.log(`\n✅ Contract deployed successfully!`);
        console.log(`Contract Address: ${NETWORKS.UNICHAIN.EXPLORER}address/${deployedAddress}`);
        
        // Verifikasi contract sudah deployed
        const code = await wallet.provider.getCode(deployedAddress);
        if (code === "0x") {
            throw new Error("Contract deployment failed - no code at address");
        }

        return deployedAddress;

    } catch (error) {
        console.error("\n❌ Contract deployment failed:", error.message);
        throw error;
    }
}

async function executeTransactions(privateKey, walletIndex) {
    try {
        // Setup provider dengan retry mechanism
        const getProvider = async () => {
            try {
                return new ethers.JsonRpcProvider(NETWORKS.UNICHAIN.RPC, NETWORKS.UNICHAIN.CHAINID);
            } catch (error) {
                console.error(`Failed to connect to RPC, retrying... (Wallet ${walletIndex + 1})`);
                await new Promise(resolve => setTimeout(resolve, 5000));
                return getProvider();
            }
        };

        const unichainProvider = await getProvider();
        const unichainWallet = new ethers.Wallet(privateKey, unichainProvider);
        
        // Setup WETH contract
        const wethContract = new ethers.Contract(
            Config.WETHCONTRACTADDRESS,
            [
                "function deposit() external payable",
                "function withdraw(uint256 wad) external",
                "function balanceOf(address) external view returns (uint256)"
            ],
            unichainWallet
        );

        console.log(`\n🚀 Starting bot for Wallet ${walletIndex + 1}: ${unichainWallet.address}`);

        while (true) {
            try {
                console.log(`\n=== Starting New Cycle for Wallet ${walletIndex + 1} ===`);
                
                // Generate random transaction sequence
                let txSequence = [];
                for (let i = 0; i < 5; i++) {
                    const rand = Math.random() * 100;
                    if (rand < 80) {
                        txSequence.push(Math.random() < 0.5 ? 'wrap' : 'unwrap');
                    } else {
                        txSequence.push('transfer');
                    }
                }
                
                console.log(`\nWallet ${walletIndex + 1} Transaction sequence:`, txSequence);

                for (let i = 0; i < txSequence.length; i++) {
                    // Add random delay between wallets to prevent rate limiting
                    await new Promise(resolve => setTimeout(resolve, Helper.random(1000, 3000)));

                    const ethBalance = await unichainProvider.getBalance(unichainWallet.address);
                    const wethBalance = await wethContract.balanceOf(unichainWallet.address);
                    
                    console.log(`\nWallet ${walletIndex + 1} Balance:`);
                    console.log(`ETH: ${ethers.formatEther(ethBalance)} ETH`);
                    console.log(`WETH: ${ethers.formatEther(wethBalance)} WETH`);

                    try {
                        let transaction;
                        const txType = txSequence[i];
                        
                        switch(txType) {
                            case 'wrap':
                                const wrapAmount = ethers.parseEther(
                                    (Helper.randomFloat(0.5, 0.8) * Number(ethers.formatEther(ethBalance))).toString()
                                );
                                
                                if (wrapAmount < ethers.parseEther("0.0001")) {
                                    console.log(`⚠️ Wallet ${walletIndex + 1}: ETH balance too low for wrap`);
                                    continue;
                                }
                                
                                console.log(`Wallet ${walletIndex + 1}: Wrapping ${ethers.formatEther(wrapAmount)} ETH...`);
                                transaction = await wethContract.deposit({ value: wrapAmount });
                                break;
                                
                            case 'unwrap':
                                if (wethBalance === 0n) {
                                    console.log(`⚠️ Wallet ${walletIndex + 1}: No WETH to unwrap, performing wrap...`);
                                    const altWrapAmount = ethers.parseEther(
                                        (Helper.randomFloat(0.5, 0.8) * Number(ethers.formatEther(ethBalance))).toString()
                                    );
                                    transaction = await wethContract.deposit({ value: altWrapAmount });
                                } else {
                                    console.log(`Wallet ${walletIndex + 1}: Unwrapping ${ethers.formatEther(wethBalance)} WETH...`);
                                    transaction = await wethContract.withdraw(wethBalance);
                                }
                                break;
                                
                            case 'transfer':
                                const transferAmount = ethers.parseEther(
                                    (Helper.randomFloat(0.1, 0.2) * Number(ethers.formatEther(ethBalance))).toString()
                                );
                                
                                if (transferAmount < ethers.parseEther("0.0001")) {
                                    console.log(`⚠️ Wallet ${walletIndex + 1}: ETH balance too low for transfer`);
                                    continue;
                                }
                                
                                console.log(`Wallet ${walletIndex + 1}: Self transferring ${ethers.formatEther(transferAmount)} ETH...`);
                                transaction = await unichainWallet.sendTransaction({
                                    to: unichainWallet.address,
                                    value: transferAmount
                                });
                                break;
                        }
                        
                        console.log(`Transaction sent! Hash: ${NETWORKS.UNICHAIN.EXPLORER}${transaction.hash}`);
                        const receipt = await transaction.wait();
                        console.log(`✅ Wallet ${walletIndex + 1}: Transaction confirmed! Gas: ${receipt.gasUsed.toString()}`);
                        
                    } catch (error) {
                        console.error(`❌ Wallet ${walletIndex + 1} Transaction failed:`, error.message);
                        // Add longer delay on error to prevent rate limiting
                        await new Promise(resolve => setTimeout(resolve, 10000));
                    }
                    
                    // Random delay between transactions
                    const txDelay = Helper.random(3000, 5000);
                    await new Promise(resolve => setTimeout(resolve, txDelay));
                }
                
                // Random delay between cycles (1-2 minutes)
                const cycleDelay = Helper.random(5760, 17280);
                console.log(`\n✅ Wallet ${walletIndex + 1}: Cycle completed! Waiting ${cycleDelay}s...`);
                await new Promise(resolve => setTimeout(resolve, cycleDelay * 1000));
                
            } catch (error) {
                console.error(`Error in wallet ${walletIndex + 1} cycle:`, error.message);
                // Add longer delay on cycle error
                await new Promise(resolve => setTimeout(resolve, 30000));
            }
        }
    } catch (error) {
        console.error(`Fatal error in wallet ${walletIndex + 1}:`, error.message);
        // Restart the wallet's process
        await new Promise(resolve => setTimeout(resolve, 60000));
        return executeTransactions(privateKey, walletIndex);
    }
}

async function main() {
    try {
        console.log("Unichain Testnet Automation Bot");
        console.log("By : Aethereal");
        console.log("Follow On : https://x.com/aethereal_co");
        console.log("Join Discord : https://discord.gg/aethereal");
        console.log();
        Helper.showSkelLogo();
        console.log();

        if (privateKey.length === 0) {
            throw Error("Please input your account first on accounts.js file");
        }

        while (true) {
            const choice = await showMenu();

            switch (choice) {
                case "1":
                    // Bridge ETH
                    console.log("\n=== Starting Bridge Process ===");
                    const bridgeAmount = await input.text("Masukkan jumlah ETH untuk di-bridge: ");
                    
                    // Run bridge for all wallets in sequence
                    for (let i = 0; i < privateKey.length; i++) {
                        const wallet = new ethers.Wallet(privateKey[i], new ethers.JsonRpcProvider(NETWORKS.SEPOLIA.RPC));
                        console.log(`\nProcessing Bridge for Wallet ${i + 1}: ${wallet.address}`);
                        await executeBridge(wallet, bridgeAmount);
                    }
                    break;

                case "2":
                    // Deploy Contract
                    console.log("\n=== Starting Contract Deployment ===");
                    const tokenName = await input.text("Masukkan nama token: ");
                    const tokenSymbol = await input.text("Masukkan symbol token: ");
                    const initialSupply = await input.text("Masukkan initial supply: ");
                    
                    // Run deployment for all wallets in sequence
                    for (let i = 0; i < privateKey.length; i++) {
                        const unichainProvider = new ethers.JsonRpcProvider(NETWORKS.UNICHAIN.RPC, NETWORKS.UNICHAIN.CHAINID);
                        const wallet = new ethers.Wallet(privateKey[i], unichainProvider);
                        console.log(`\nDeploying Contract from Wallet ${i + 1}: ${wallet.address}`);
                        await deployContract(wallet, tokenName, tokenSymbol, initialSupply);
                    }
                    break;

                case "3":
                    // Execute Transactions
                    console.log("\n=== Starting Transaction Process ===");
                    console.log("Running transactions for all wallets in parallel...");
                    
                    // Start all wallets in parallel
                    const walletPromises = privateKey.map((pk, index) => 
                        executeTransactions(pk, index)
                    );
                    
                    await Promise.all(walletPromises);
                    break;

                case "4":
                    console.log("\nTerima kasih telah menggunakan bot!");
                    return;

                default:
                    console.log("\nPilihan tidak valid, silakan coba lagi.");
            }

            if (choice !== "3") { // Untuk opsi 3 tidak perlu konfirmasi karena berjalan terus
                await input.text("\nTekan Enter untuk kembali ke menu...");
            }
        }

    } catch (error) {
        console.error("\n❌ Error during execution:", error.message);
        await new Promise(resolve => setTimeout(resolve, 60000));
        main();
    }
}

main(); 