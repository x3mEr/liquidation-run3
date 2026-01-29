import { base, sepolia } from "viem/chains";
import { soneium, somnia, meageth } from "./chains";

export const CONTRACT_ADDRESSES: Record<number, `0x${string}`> = {
  [base.id]: (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS_BASE ||
    "") as `0x${string}`,
  [soneium.id]: (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS_SONEIUM ||
    "") as `0x${string}`,
  [somnia.id]: (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS_SOMNIA ||
    "") as `0x${string}`,
  [sepolia.id]: (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS_SEPOLIA ||
    "") as `0x${string}`,
};

if (meageth) {
  CONTRACT_ADDRESSES[meageth.id] = (process.env
    .NEXT_PUBLIC_CONTRACT_ADDRESS_MEAGETH || "") as `0x${string}`;
}

export const getContractAddress = (chainId?: number) => {
  if (!chainId) return undefined;
  const value = CONTRACT_ADDRESSES[chainId];
  if (!value || value === ("0x" as `0x${string}`)) return undefined;
  return value;
};
