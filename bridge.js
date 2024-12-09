import { privateKey } from "./accounts/accounts.js";
import { Helper } from "./src/utils/helper.js";
import { ethers } from "ethers";
import input from "input";
import logger from "./src/utils/logger.js";
import { Config } from "./config/config.js";

// Gunakan Config.NETWORKS
const NETWORKS = Config.NETWORKS;

async function waitForUnichainBridge(wallet, amount) {
    try {
        console.log(`\nMonitoring bridge status on Unichain...`);
        
        // Setup Unichain provider
        const unichainProvider = new ethers.JsonRpcProvider(NETWORKS.UNICHAIN.RPC, NETWORKS.UNICHAIN.CHAINID);
        const initialBalance = await unichainProvider.getBalance(wallet.address);
        
        let attempts = 0;
        const maxAttempts = 30; // 30 x 30 detik = 15 menit
        
        while (attempts < maxAttempts) {
            attempts++;
            
            // Cek balance terbaru
            const currentBalance = await unichainProvider.getBalance(wallet.address);
            
            // Jika balance bertambah, bridge berhasil
            if (currentBalance > initialBalance) {
                // Ambil transaksi terakhir yang mengirim ETH ke wallet
                const blockNumber = await unichainProvider.getBlockNumber();
                const block = await unichainProvider.getBlock(blockNumber, true);
                
                // Cari transaksi bridge di block terakhir
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
            
            // Update status
            const progress = Math.round((attempts / maxAttempts) * 100);
            console.log(`Waiting for bridge completion... ${progress}% (${attempts}/${maxAttempts})`);
            
            // Tunggu 30 detik sebelum cek lagi
            await new Promise(resolve => setTimeout(resolve, 30000));
        }
        
        console.log(`\n⚠️ Bridge monitoring timeout after 15 minutes`);
        console.log(`Please check your balance manually on Unichain`);
        return false;
        
    } catch (error) {
        console.error(`Error monitoring bridge: ${error.message}`);
        return false;
    }
}

async function bridgeToUnichain(wallet, amount) {
    try {
        console.log(`Starting bridge from Sepolia to Unichain...`);
        
        // Data untuk bridge dari Sepolia
        const bridgeData = "0xe11013dd" + 
            "000000000000000000000000" + wallet.address.slice(2) +  // address
            "0000000000000000000000000000000000000000000000000000000000030d40" + // chainId destination
            "0000000000000000000000000000000000000000000000000000000000000060" + // offset
            "0000000000000000000000000000000000000000000000000000000000000007" + // length
            "6272696467670a00000000000000000000000000000000000000000000000000"; // data "bridgg\n"

        const tx = {
            to: NETWORKS.SEPOLIA.BRIDGE_CONTRACT,
            data: bridgeData,
            value: ethers.parseEther(amount)
        };

        // Estimasi gas
        const gasLimit = await wallet.provider.estimateGas(tx);
        tx.gasLimit = gasLimit;

        console.log(`Sending bridge transaction...`);
        const transaction = await wallet.sendTransaction(tx);
        
        console.log(`Transaction sent! Waiting for confirmation...`);
        console.log(`Transaction Hash: ${NETWORKS.SEPOLIA.EXPLORER}${transaction.hash}`);
        
        const receipt = await transaction.wait();
        console.log(`Bridge transaction confirmed!`);
        console.log(`Gas used: ${receipt.gasUsed.toString()}`);
        
        // Tambahkan monitoring
        await waitForUnichainBridge(wallet, amount);
        
    } catch (error) {
        console.error(`Error during bridge: ${error.message}`);
        throw error;
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

        if (privateKey.length == 0) {
            throw Error("Please input your account first on accounts.js file");
        }

        // Pilih account
        let ctx = "Account List \n";
        for (const item of privateKey) {
            ctx += `${privateKey.indexOf(item) + 1}. Account ${privateKey.indexOf(item) + 1}\n`;
        }
        ctx += `\nSelect Account To Bridge: `;
        const opt = await input.text(ctx);
        
        if (!privateKey[opt - 1]) throw Error(`Invalid Input`);

        // Setup wallet
        const provider = new ethers.JsonRpcProvider(NETWORKS.SEPOLIA.RPC, NETWORKS.SEPOLIA.CHAINID);
        const wallet = new ethers.Wallet(privateKey[opt - 1], provider);

        // Check balance
        const balance = await provider.getBalance(wallet.address);
        console.log(`\nCurrent Balance: ${ethers.formatEther(balance)} ETH`);

        // Input amount
        const amount = await input.text("Enter amount to bridge (ETH): ");
        if (ethers.parseEther(amount) > balance) {
            throw Error("Insufficient balance");
        }

        // Execute bridge
        await bridgeToUnichain(wallet, amount);

    } catch (error) {
        console.log("Error during bridge execution:", error.message);
    }
}

main(); 