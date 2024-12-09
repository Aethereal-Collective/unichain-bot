import { privateKey } from "./accounts/accounts.js";
import { Config } from "./config/config.js";
import Core from "./src/core/core.js";
import sqlite from "./src/core/db/sqlite.js";
import { Helper } from "./src/utils/helper.js";
import logger from "./src/utils/logger.js";
import twist from "./src/utils/twist.js";
import * as ethers from "ethers";

// Tambahkan fungsi retry untuk koneksi
async function retryOperation(operation, maxAttempts = 5, delay = 5000) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await operation();
        } catch (error) {
            if (attempt === maxAttempts) throw error;
            
            twist.log(`Connection failed, retrying in ${delay/1000}s... (Attempt ${attempt}/${maxAttempts})`, "error");
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}

// Tambahkan fungsi untuk menangani koneksi RPC
async function ensureRPCConnection(core, maxAttempts = 5) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            await core.provider.getNetwork();
            return true;
        } catch (error) {
            twist.log(`RPC Connection attempt ${attempt}/${maxAttempts} failed`, "error");
            
            if (attempt === maxAttempts) {
                throw new Error("Failed to connect to RPC after multiple attempts");
            }
            
            // Exponential backoff
            const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
            await new Promise(resolve => setTimeout(resolve, delay));
            
            // Reinitialize provider
            core.provider = new ethers.providers.JsonRpcProvider(RPC.URL);
        }
    }
}

async function operation(acc) {
  while (true) {
    try {
      await sqlite.connectToDatabase();
      await sqlite.createTable();
      const core = new Core(acc);
      
      // Pastikan koneksi RPC stabil sebelum mulai
      await ensureRPCConnection(core);
      await core.connectWallet();
      await core.getBalance();

      if (core.balance.ETH < 0.0015) {
        twist.log("Minimum Eth Balance Is 0.0015 ETH", "error");
        throw Error("Minimum Eth Balance Is 0.0015 ETH");
      }
      
      let availableTx = [];
      
      if (Config.USEWRAPUNWRAP ?? true) {
        const wuCount = Number(Config.WRAPUNWRAPCOUNT) - 
          Number((await sqlite.getTodayTxLog(core.address, "tx")).length);
        for(let i = 0; i < wuCount; i++) {
          availableTx.push("wrapunwrap");
        }
      }

      if (Config.USESELFTRANSFER ?? true) {
        const selfCount = Number(Config.SELFTRANSFERCOUNT) - 
          Number((await sqlite.getTodayTxLog(core.address, "self")).length);
        for(let i = 0; i < selfCount; i++) {
          availableTx.push("selftransfer");
        }
      }

      availableTx.sort(() => Math.random() - 0.5);
      
      for (const txType of availableTx) {
        try {
          // Cek koneksi RPC sebelum setiap transaksi
          await ensureRPCConnection(core);
          
          if (core.balance.ETH < 0.0015) {
            twist.log("Balance is less than 0.0015 ETH, please fill up your balance", "error");
            throw Error("Balance is less than 0.0015 ETH, please fill up your balance");
          }
          
          if (txType === "wrapunwrap") {
            await core.deposit();
            await core.withdraw();
            await sqlite.insertData(core.address, new Date().toISOString(), "tx");
          } else {
            await core.transfer();
            await sqlite.insertData(core.address, new Date().toISOString(), "self");
          }
          
          const delay = Helper.random(10000, 60000 * 2);
          await Helper.delay(delay, acc, "Waiting for next transaction", core);
          
        } catch (error) {
          if (error.message.includes('network') || error.message.includes('connection')) {
            twist.log("Network error detected, attempting to reconnect...", "error");
            await ensureRPCConnection(core);
            // Skip ke transaksi berikutnya setelah reconnect
            continue;
          }
          await Helper.delay(3000, acc, error.message, core);
        }
      }

      const restartDelay = Helper.random(60000, 120000);
      twist.log(`All transactions completed. Waiting ${Helper.msToTime(restartDelay)} before starting new cycle...`);
      await Helper.delay(restartDelay, acc, "Preparing for new transaction cycle", core);
      
      await sqlite.clearTodayTxLog(core.address);
      twist.log("Starting new transaction cycle...");

    } catch (error) {
      if (error.message.includes('network') || error.message.includes('connection')) {
        const reconnectDelay = 30000; // 30 detik
        twist.log(`Network error: ${error.message}`, "error");
        twist.log(`Attempting to reconnect in ${reconnectDelay/1000} seconds...`, "error");
        await new Promise(resolve => setTimeout(resolve, reconnectDelay));
        continue;
      }
      
      const retryDelay = 10000;
      twist.log(`Error occurred: ${error.message}, retrying in ${retryDelay/1000}s...`, "error");
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  }
}

async function startBot() {
  return new Promise(async (resolve, reject) => {
    try {
      twist.log("BOT STARTED");
      if (privateKey.length == 0) {
        throw Error("Please input your account first on accounts.js file");
      }
      
      const promiseList = [];
      for (const acc of privateKey) {
        promiseList.push(operation(acc));
      }

      await Promise.all(promiseList);
      resolve();
    } catch (error) {
      twist.log("BOT STOPPED");
      twist.log(error.message, "error");
      reject(error);
    }
  });
}

(async () => {
  try {
    console.log("Unichain Testnet Automation Bot");
    console.log("By : Aethereal");
    console.log("Follow On : https://x.com/aethereal_co");
    console.log("Join Discord : https://discord.gg/aethereal");
    console.log();
    Helper.showSkelLogo();
    console.log();
    await startBot();
  } catch (error) {
    twist.log(`Error During executing bot: ${error.message}`, "error");
    await startBot();
  }
})();
