import { base, sepolia } from "viem/chains";
import { defineChain } from "viem";
import type { Chain } from "viem";

export const soneium = defineChain({
  id: 1868,
  name: "Soneium",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.soneium.org"] },
    public: { http: ["https://rpc.soneium.org"] },
  },
  blockExplorers: {
    default: { name: "Soneium Blockscout", url: "https://soneium.blockscout.com" },
  },
  iconUrl: "/chains_logos/soneium_icon.svg",
  iconBackground: "#05060a",
});

export const somnia = defineChain({
  id: 5031,
  name: "Somnia",
  nativeCurrency: { name: "Somnia", symbol: "SOMI", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://api.infra.mainnet.somnia.network"] },
    public: { http: ["https://api.infra.mainnet.somnia.network"] },
  },
  blockExplorers: {
    default: { name: "Somnia Explorer", url: "https://explorer.somnia.network" },
  },
  iconUrl: "/chains_logos/somnia_icon.svg",
  iconBackground: "#05060a",
});

export const meageth = (() => {
  const chainId = Number(process.env.NEXT_PUBLIC_MEAGETH_CHAIN_ID);
  const rpcUrl = process.env.NEXT_PUBLIC_MEAGETH_RPC_URL;
  if (!chainId || !rpcUrl) return null;
  return defineChain({
    id: chainId,
    name: "Meageth",
    nativeCurrency: { name: "Meageth", symbol: "MEG", decimals: 18 },
    rpcUrls: {
      default: { http: [rpcUrl] },
      public: { http: [rpcUrl] },
    },
    blockExplorers: {
      default: { name: "Meageth Explorer", url: "https://meageth.explorer" },
    },
  });
})();

export const supportedChains = [
  base,
  soneium,
  somnia,
  sepolia,
  meageth,
].filter(Boolean) as Chain[];
