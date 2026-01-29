import type { Chain } from "viem";
import { supportedChains } from "@/web3/chains";

export const getChainById = (chainId?: number): Chain | undefined => {
  if (!chainId) return undefined;
  return (supportedChains as Chain[]).find((chain) => chain.id === chainId);
};
