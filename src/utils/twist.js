import logger from "./logger.js";
import Core from "../core/core.js";
import { privateKey } from "../../accounts/accounts.js";
import { RPC } from "../core/network/rpc.js";
import { Config } from "../../config/config.js";
import sqlite from "../core/db/sqlite.js";

let lastMessage = '';
let lastTimestamp = 0;

/**
 * @param {string} msg
 * @param {string} type
 */
function log(msg, type = 'info') {
    const timestamp = new Date().toISOString().replace('T', ' ').substr(0, 19);
    const currentTime = Date.now();
    
    // Hindari log duplikat dalam interval 2 detik
    if (msg === lastMessage && currentTime - lastTimestamp < 2000) {
        return;
    }
    
    lastMessage = msg;
    lastTimestamp = currentTime;
    
    console.log(`${timestamp} [\x1b[32m${type}\x1b[39m]: ${msg}`);
}

/**
 * @param {string} acc
 * @param {Core} core
 * @param {string} msg
 * @param {string} delay
 */
async function logStatus(msg = "", acc = "", core = new Core(), delay) {
    const accIdx = privateKey.indexOf(acc);
    
    // Hanya tampilkan status transaksi dan delay
    if (msg.includes("Waiting") || msg.includes("Delay")) {
        log(`Account ${accIdx + 1} - ${msg}`);
        return;
    }

    // Untuk transaksi penting, tampilkan detail minimal
    if (msg.includes("Tx") || msg.includes("Error")) {
        log(`Account ${accIdx + 1} - ${msg}`);
        if (core.balance?.ETH) {
            log(`Balance: ${core.balance.ETH} ${RPC.SYMBOL}`);
        }
        return;
    }

    // Untuk update balance
    if (msg.includes("Balance updated")) {
        // Skip log balance update berulang
        return;
    }

    // Untuk status update berkala
    if (msg === "Status Update") {
        const tx = (await sqlite.getTodayTxLog(core.address, "tx")).length;
        const raw = (await sqlite.getTodayTxLog(core.address, "raw")).length;
        const self = (await sqlite.getTodayTxLog(core.address, "self")).length;
        
        log(`Account ${accIdx + 1} - Transaction Summary:`);
        log(`W/U: ${tx}/${Config.WRAPUNWRAPCOUNT ?? "?"} | RAW: ${raw}/${Config.RAWTXCOUNT ?? "?"} | Transfer: ${self}/${Config.SELFTRANSFERCOUNT ?? "?"}`);
        return;
    }

    // Untuk pesan umum lainnya
    log(`Account ${accIdx + 1} - ${msg}`);
}

/**
 * @param {string} msg
 */
function logInfo(msg = "") {
    log(msg);
}

export default {
    log,
    logStatus,
    logInfo
};
