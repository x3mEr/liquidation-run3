import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { supportedChains } from "./chains";

const projectId =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "replace-me";

export const wagmiConfig = getDefaultConfig({
  appName: "LIQUIDATION RUN",
  projectId,
  chains: supportedChains,
  ssr: true,
});
