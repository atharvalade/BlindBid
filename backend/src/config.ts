import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

function required(key: string): string {
  const val = process.env[key];
  if (!val || val.trim() === "") {
    throw new Error(`Missing required env var: ${key}`);
  }
  return val.trim();
}

function optional(key: string, fallback = ""): string {
  return (process.env[key] ?? fallback).trim();
}

export const config = {
  server: {
    port: parseInt(optional("PORT", "3001")),
    env: optional("NODE_ENV", "development"),
  },

  adi: {
    rpcUrl: required("ADI_RPC_URL"),
    rpcUrlLive: optional("ADI_RPC_URL_LIVE"),
    explorerUrl: optional("ADI_EXPLORER_URL"),
    entryPointV07: required("ENTRYPOINT_V07") as `0x${string}`,
  },

  deployer: {
    address: required("DEPLOYER_ADDRESS") as `0x${string}`,
    privateKey: required("DEPLOYER_PRIVATE_KEY") as `0x${string}`,
  },

  sponsorSigner: {
    address: required("SPONSOR_SIGNER_ADDRESS") as `0x${string}`,
    privateKey: required("SPONSOR_SIGNER_PRIVATE_KEY") as `0x${string}`,
  },

  hedera: {
    accountId: required("HEDERA_ACCOUNT_ID"),
    evmAddress: required("HEDERA_EVM_ADDRESS"),
    // Private key is optional during Canton-only dev; required for HCS publishing
    privateKey: optional("HEDERA_PRIVATE_KEY"),
    network: optional("HEDERA_NETWORK", "testnet") as "testnet" | "mainnet",
    mirrorNode: optional(
      "HEDERA_MIRROR_NODE",
      "https://testnet.mirrornode.hedera.com"
    ),
  },

  canton: {
    ledgerApiUrl: optional("CANTON_LEDGER_API_URL", "http://127.0.0.1:7575"),
    packageId: optional("CANTON_PACKAGE_ID"),
    namespace: optional("CANTON_NAMESPACE"),
    jwtSecret: optional("CANTON_JWT_SECRET", "secret"),
    parties: {
      seller: optional("CANTON_PARTY_SELLER"),
      bidderA: optional("CANTON_PARTY_BIDDER_A"),
      bidderB: optional("CANTON_PARTY_BIDDER_B"),
      auditor: optional("CANTON_PARTY_AUDITOR"),
    },
  },

  contracts: {
    nativePaymaster: optional("NATIVE_PAYMASTER_ADDRESS") as
      | `0x${string}`
      | "",
    erc20Paymaster: optional("ERC20_PAYMASTER_ADDRESS") as `0x${string}` | "",
    mockErc20: optional("MOCK_ERC20_ADDRESS") as `0x${string}` | "",
    escrow: optional("ESCROW_ADDRESS") as `0x${string}` | "",
  },
};

export type Config = typeof config;
