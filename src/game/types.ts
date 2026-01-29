export type Position = "LONG" | "SHORT";
export type EventType = "FOMO" | "NEWS" | "INFLUENCER";

export type PricePoint = {
  x: number;
  y: number;
};

export type GameMessage = {
  text: string;
  type: EventType;
  untilMs: number;
};

export type GameState = {
  running: boolean;
  dead: boolean;
  startedAtMs: number;
  elapsedMs: number;
  score: number;
  position: Position;
  leverageIndex: number;
  price: number;
  priceVelocity: number;
  direction: 1 | -1;
  nextTurnIn: number;
  speed: number;
  labelOffset: number;
  timeLabelIndex: number;
  nextEventIn: number;
  boostUntilMs: number;
  noiseBoostUntilMs: number;
  message: GameMessage | null;
  points: PricePoint[];
  lastPrice: number;
  bonusPoints: number;
};

export type CanvasSize = {
  width: number;
  height: number;
  ratio: number;
};
