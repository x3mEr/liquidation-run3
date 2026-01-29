import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import type { Chain } from "viem";
import { supportedChains } from "./chains";

const projectId =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "replace-me";

const chains = supportedChains as [Chain, ...Chain[]];

export const wagmiConfig = getDefaultConfig({
  appName: "LIQUIDATION RUN",
  projectId,
  chains,
  ssr: true,
});
