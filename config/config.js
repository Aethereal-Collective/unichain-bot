export class Config {
  static GWEIPRICE = 0.15; // Harga gas yang rendah
  static WAITFORBLOCKCONFIRMATION = true; // Recommended untuk keamanan
  static TXAMOUNTMIN = 0.0001; 
  static TXAMOUNTMAX = 0.001;

  // WRAP UNWRAP SECTION
  static USEWRAPUNWRAP = true;
  static WRAPUNWRAPCOUNT = 3; // Jumlah transaksi wrap/unwrap
  static WETHCONTRACTADDRESS = "0x4200000000000000000000000000000000000006"; // WETH di Arbitrum

  // RAW TX SECTION
  static USERAWTXDATA = false;
  static RAWTXCOUNT = 3;
  static RAWTX = {
    CONTRACTTOINTERACT: "0x",
    RAWDATA: "0x",
  };

  // TRANSFER SECTION
  static USESELFTRANSFER = true;
  static SELFTRANSFERCOUNT = 3;
  static CONTRACTADDRESS = undefined; // Menggunakan native ETH

  // RPC PROVIDER SECTION
  static RPC = {
    CHAINID: 1301, // Arbitrum One Chain ID
    RPCURL: "https://sepolia.unichain.org", // RPC publik Arbitrum
    EXPLORER: "https://sepolia.uniscan.xyz/",
    SYMBOL: "ETH",
  };

  // NETWORK CONFIGURATION
  static NETWORKS = {
    SEPOLIA: {
      RPC: "https://eth-sepolia.g.alchemy.com/v2/YOUR_API_KEY",
      CHAINID: 11155111,
      BRIDGE_CONTRACT: "0xea58fcA6849d79EAd1f26608855c2D6407d54Ce2",
      EXPLORER: "https://sepolia.etherscan.io/tx/"
    },
    UNICHAIN: {
      RPC: "https://unichain-sepolia.g.alchemy.com/v2/YOUR_API_KEY",
      CHAINID: 1301,
      BRIDGE_CONTRACT: "0x4200000000000000000000000000000000000007",
      EXPLORER: "https://sepolia.uniscan.xyz/"
    }
  };
}
