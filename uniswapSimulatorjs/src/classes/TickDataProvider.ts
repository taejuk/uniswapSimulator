import { BigintIsh } from "@uniswap/sdk-core";

export interface TickDataProvider {
  getTick(tick: number): Promise<{ liquidityNet: BigintIsh }>;

  nextInitializedTickWithinOneWord(
    tick: number,
    lte: boolean,
    tickSpacing: number
  ): Promise<[number, boolean]>;
  updateTick(tick: number, net: BigintIsh, gross: BigintIsh, upper: boolean);
}
