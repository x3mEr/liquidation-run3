import { formatTimeLabel } from "./utils";
import type { CanvasSize, GameState } from "./types";

export const renderGame = (
  ctx: CanvasRenderingContext2D,
  state: GameState,
  size: CanvasSize
) => {
  const { width, height, ratio } = size;
  ctx.save();
  ctx.scale(ratio, ratio);

  ctx.fillStyle = "#05060a";
  ctx.fillRect(0, 0, width, height);

  drawGrid(ctx, state, size);
  drawPriceLine(ctx, state, size);

  ctx.restore();
};

const drawGrid = (
  ctx: CanvasRenderingContext2D,
  state: GameState,
  size: CanvasSize
) => {
  const { width, height } = size;
  const spacing = width * 0.38;
  const baseX = state.labelOffset % spacing;

  ctx.save();
  ctx.strokeStyle = "rgba(45, 247, 255, 0.08)";
  ctx.lineWidth = 1;

  for (let i = -1; i < 5; i += 1) {
    const x = baseX + i * spacing;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }

  ctx.strokeStyle = "rgba(255, 59, 219, 0.08)";
  for (let i = 1; i <= 3; i += 1) {
    const y = (height / 4) * i;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  ctx.fillStyle = "rgba(230, 232, 255, 0.5)";
  ctx.font = "12px var(--font-geist-mono), monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";

  for (let i = -1; i < 5; i += 1) {
    const index = (state.timeLabelIndex + i) % 48;
    const label = formatTimeLabel((index + 48) % 48);
    const x = baseX + i * spacing;
    ctx.fillText(label, x, height - 8);
  }

  ctx.restore();
};

const drawPriceLine = (
  ctx: CanvasRenderingContext2D,
  state: GameState,
  size: CanvasSize
) => {
  const { width, height } = size;
  const clipWidth = width * 0.8;

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, clipWidth, height);
  ctx.clip();

  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(45, 247, 255, 0.9)";
  ctx.shadowColor = "rgba(45, 247, 255, 0.6)";
  ctx.shadowBlur = 12;
  ctx.beginPath();

  state.points.forEach((point, index) => {
    if (index === 0) {
      ctx.moveTo(point.x, point.y);
    } else {
      ctx.lineTo(point.x, point.y);
    }
  });
  ctx.stroke();

  ctx.restore();
};
