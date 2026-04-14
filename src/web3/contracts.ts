import { base, megaeth, soneium, somnia, linea,sepolia } from "viem/chains";

const readAddress = (value?: string): `0x${string}` | undefined => {
  if (!value || value === "0x") return undefined;
  return value as `0x${string}`;
};

export const CONTRACT_ADDRESSES: Record<number, `0x${string}` | undefined> = {
  [base.id]: readAddress(process.env.NEXT_PUBLIC_CONTRACT_ADDRESS_BASE),
  [soneium.id]: readAddress(process.env.NEXT_PUBLIC_CONTRACT_ADDRESS_SONEIUM),
  [somnia.id]: readAddress(process.env.NEXT_PUBLIC_CONTRACT_ADDRESS_SOMNIA),
  [megaeth.id]: readAddress(process.env.NEXT_PUBLIC_CONTRACT_ADDRESS_MEGAETH),
  [linea.id]: readAddress(process.env.NEXT_PUBLIC_CONTRACT_ADDRESS_LINEA),
  [sepolia.id]: readAddress(process.env.NEXT_PUBLIC_CONTRACT_ADDRESS_SEPOLIA),
};

export const getContractAddress = (chainId?: number) => {
  if (!chainId) return undefined;
  return CONTRACT_ADDRESSES[chainId];
};
