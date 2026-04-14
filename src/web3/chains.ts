import type { Chain } from "viem";
import {
  base,
  megaeth as viemMegaeth,
  somnia as viemSomnia,
  soneium as viemSoneium,
  linea,
} from "viem/chains";

type ChainWithIcon = Chain & {
  iconUrl?: string;
  iconBackground?: string;
};

export const soneium: ChainWithIcon = {
  ...viemSoneium,
  name: "Soneium",
  iconUrl: "/chains_logos/soneium_icon.svg",
  iconBackground: "#05060a",
};

export const somnia: ChainWithIcon = {
  ...viemSomnia,
  iconUrl: "/chains_logos/somnia_icon.svg",
  iconBackground: "#05060a",
};

export const megaeth: ChainWithIcon = {
  ...viemMegaeth,
  iconUrl: "/chains_logos/megaeth_icon.svg",
  iconBackground: "#ffffff",
};

export const supportedChains: [Chain, ...Chain[]] = [
  base,
  megaeth,
  somnia,
  soneium,
  linea,
];
