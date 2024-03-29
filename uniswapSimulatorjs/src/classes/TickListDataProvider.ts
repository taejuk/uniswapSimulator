import { TickList } from "@uniswap/v3-sdk";
import { Tick, TickConstructorArgs } from "./Tick";
import { TickDataProvider } from "./TickDataProvider";
import { BigintIsh } from "@uniswap/sdk-core";
import JSBI from "jsbi";
import { NEGATIVE_ONE, ZERO } from "./constants";

export class TickListDataProvider implements TickDataProvider {
  public ticks: Tick[];

  constructor(ticks: (Tick | TickConstructorArgs)[], tickSpacing: number) {
    const ticksMapped: Tick[] = ticks.map((t) =>
      t instanceof Tick ? t : new Tick(t)
    );
    TickList.validateList(ticksMapped, tickSpacing);
    this.ticks = ticksMapped;
  }

  async getTick(
    tick: number
  ): Promise<{ liquidityNet: BigintIsh; liquidityGross: BigintIsh }> {
    return TickList.getTick(this.ticks, tick);
  }

  async nextInitializedTickWithinOneWord(
    tick: number,
    lte: boolean,
    tickSpacing: number
  ): Promise<[number, boolean]> {
    return TickList.nextInitializedTickWithinOneWord(
      this.ticks,
      tick,
      lte,
      tickSpacing
    );
  }
  async updateTick(
    tick: number,
    net: BigintIsh,
    gross: BigintIsh,
    upper: boolean
  ) {
    let existed = false;
    this.ticks.forEach((tickInfo, idx) => {
      if (tickInfo.index == tick) {
        existed = true;
        this.ticks[idx].liquidityGross = JSBI.ADD(
          JSBI.BigInt(gross),
          this.ticks[idx].liquidityGross
        );
        if (upper) {
          this.ticks[idx].liquidityNet = JSBI.subtract(
            this.ticks[idx].liquidityNet,
            JSBI.BigInt(net)
          );
        } else {
          this.ticks[idx].liquidityNet = JSBI.ADD(
            this.ticks[idx].liquidityNet,
            JSBI.BigInt(net)
          );
        }
        if (JSBI.equal(this.ticks[idx].liquidityGross, ZERO)) {
          this.ticks.splice(idx, 1);
        }
      }
    });
    if (!existed) {
      const data: Tick = {
        index: tick,
        liquidityGross: JSBI.BigInt(gross),
        liquidityNet: upper
          ? JSBI.multiply(NEGATIVE_ONE, JSBI.BigInt(net))
          : JSBI.BigInt(net),
      };
      this.ticks.push(data);
      this.ticks.sort((a: Tick, b: Tick) => (a.index > b.index ? 1 : -1));
    }
  }
}
