import { BigintIsh, Price, Token, CurrencyAmount } from "@uniswap/sdk-core";
import JSBI from "jsbi";
import invariant from "tiny-invariant";
import { Tick, TickConstructorArgs } from "./Tick";
import { TickDataProvider } from "./TickDataProvider";
import { TickListDataProvider } from "./TickListDataProvider";
import {
  computePoolAddress,
  FACTORY_ADDRESS,
  FeeAmount,
  FullMath,
  LiquidityMath,
  TickMath,
  TICK_SPACINGS,
} from "@uniswap/v3-sdk";
import { NEGATIVE_ONE, ONE, Q128, Q192, ZERO } from "./constants";
import { SwapMath } from "./swapMath";

interface StepComputations {
  sqrtPriceStartX96: JSBI;
  tickNext: number;
  initialized: boolean;
  sqrtPriceNextX96: JSBI;
  amountIn: JSBI;
  amountOut: JSBI;
  feeAmount: JSBI;
}

interface TickWithFees {
  index: number;
  feeGrowth0XInside: JSBI;
  feeGrowth1XInside: JSBI;
}

const mulDiv = (a: JSBI | undefined, b: JSBI, denominator: JSBI): JSBI => {
  if (a == undefined) {
    return ZERO;
  }
  const product = JSBI.multiply(a, b);
  let result = JSBI.divide(product, denominator);
  return result;
};

export class PoolSimulator {
  public readonly token0: Token;
  public readonly token1: Token;
  public readonly fee: FeeAmount;
  public sqrtRatioX96: JSBI;
  public liquidity: JSBI;
  public tickCurrent: number;
  public tickDataProvider: TickDataProvider;
  public tickWithFees: TickWithFees[];
  public fee0XInside: JSBI;
  public fee1XInside: JSBI;
  public static getAddress(
    tokenA: Token,
    tokenB: Token,
    fee: FeeAmount,
    initCodeHashManualOverride?: string
  ): string {
    return computePoolAddress({
      factoryAddress: FACTORY_ADDRESS,
      fee,
      tokenA,
      tokenB,
      initCodeHashManualOverride,
    });
  }

  public constructor(
    tokenA: Token,
    tokenB: Token,
    fee: FeeAmount,
    sqrtRatioX96: BigintIsh,
    liquidity: BigintIsh,
    tickCurrent: number,
    ticks: Tick[]
  ) {
    invariant(Number.isInteger(fee) && fee < 1_000_000, "FEE");

    const tickCurrentSqrtRatioX96 = TickMath.getSqrtRatioAtTick(tickCurrent);
    const nextTickSqrtRatioX96 = TickMath.getSqrtRatioAtTick(tickCurrent + 1);
    invariant(
      JSBI.greaterThanOrEqual(
        JSBI.BigInt(sqrtRatioX96),
        tickCurrentSqrtRatioX96
      ) &&
        JSBI.lessThanOrEqual(JSBI.BigInt(sqrtRatioX96), nextTickSqrtRatioX96),
      "PRICE_BOUNDS"
    );
    // always create a copy of the list since we want the pool's tick list to be immutable
    [this.token0, this.token1] = tokenA.sortsBefore(tokenB)
      ? [tokenA, tokenB]
      : [tokenB, tokenA];
    this.fee = fee;
    this.sqrtRatioX96 = JSBI.BigInt(sqrtRatioX96);
    this.liquidity = JSBI.BigInt(liquidity);
    this.tickCurrent = tickCurrent;
    this.tickDataProvider = Array.isArray(ticks)
      ? new TickListDataProvider(ticks, TICK_SPACINGS[fee])
      : ticks;
    this.tickWithFees = ticks.map((tick) => {
      return {
        index: tick.index,
        feeGrowth0XInside: ZERO,
        feeGrowth1XInside: ZERO,
      };
    });
    this.tickWithFees = this.tickWithFees.sort(
      (a: TickWithFees, b: TickWithFees) => (a.index > b.index ? 1 : -1)
    );
    this.fee0XInside = ZERO;
    this.fee1XInside = ZERO;
  }

  public async add(tickLower: number, tickUpper: number, amount: BigintIsh) {
    this.tickDataProvider.updateTick(tickLower, amount, amount, false);
    this.tickDataProvider.updateTick(tickUpper, amount, amount, true);
    if (this.tickCurrent >= tickLower && this.tickCurrent < tickUpper) {
      this.liquidity = LiquidityMath.addDelta(
        this.liquidity,
        JSBI.BigInt(amount)
      );
    }
  }
  /**
   * Executes a swap
   * @param zeroForOne Whether the amount in is token0 or token1
   * @param amountSpecified The amount of the swap, which implicitly configures the swap as exact input (positive), or exact output (negative)
   * @param sqrtPriceLimitX96 The Q64.96 sqrt price limit. If zero for one, the price cannot be less than this value after the swap. If one for zero, the price cannot be greater than this value after the swap
   * @returns amountCalculated
   * @returns sqrtRatioX96
   * @returns liquidity
   * @returns tickCurrent
   */
  public async swap(
    zeroForOne: boolean,
    amountSpecified: JSBI,
    sqrtPriceLimitX96?: JSBI
  ): Promise<{
    amountCalculated: JSBI;
    sqrtRatioX96: JSBI;
    liquidity: JSBI;
    tickCurrent: number;
  }> {
    if (!sqrtPriceLimitX96)
      sqrtPriceLimitX96 = zeroForOne
        ? JSBI.add(TickMath.MIN_SQRT_RATIO, ONE)
        : JSBI.subtract(TickMath.MAX_SQRT_RATIO, ONE);

    if (zeroForOne) {
      invariant(
        JSBI.greaterThan(sqrtPriceLimitX96, TickMath.MIN_SQRT_RATIO),
        "RATIO_MIN"
      );

      invariant(
        JSBI.lessThan(sqrtPriceLimitX96, this.sqrtRatioX96),
        "RATIO_CURRENT"
      );
    } else {
      invariant(
        JSBI.lessThan(sqrtPriceLimitX96, TickMath.MAX_SQRT_RATIO),
        "RATIO_MAX"
      );
      if (JSBI.lessThan(sqrtPriceLimitX96, this.sqrtRatioX96)) {
        console.log("haha2");
      }
      invariant(
        JSBI.greaterThan(sqrtPriceLimitX96, this.sqrtRatioX96),
        "RATIO_CURRENT"
      );
    }

    const exactInput = JSBI.greaterThanOrEqual(amountSpecified, ZERO);

    // keep track of swap state

    const state = {
      amountSpecifiedRemaining: amountSpecified,
      amountCalculated: ZERO,
      sqrtPriceX96: this.sqrtRatioX96,
      tick: this.tickCurrent,
      liquidity: this.liquidity,
    };

    // start swap while loop
    while (
      JSBI.notEqual(state.amountSpecifiedRemaining, ZERO) &&
      state.sqrtPriceX96 != sqrtPriceLimitX96
    ) {
      let step: Partial<StepComputations> = {};
      step.sqrtPriceStartX96 = state.sqrtPriceX96;

      // because each iteration of the while loop rounds, we can't optimize this code (relative to the smart contract)
      // by simply traversing to the next available tick, we instead need to exactly replicate
      // tickBitmap.nextInitializedTickWithinOneWord
      [step.tickNext, step.initialized] =
        await this.tickDataProvider.nextInitializedTickWithinOneWord(
          state.tick,
          zeroForOne,
          this.tickSpacing
        );
      if (step.tickNext < TickMath.MIN_TICK) {
        step.tickNext = TickMath.MIN_TICK;
      } else if (step.tickNext > TickMath.MAX_TICK) {
        step.tickNext = TickMath.MAX_TICK;
      }

      step.sqrtPriceNextX96 = TickMath.getSqrtRatioAtTick(step.tickNext);
      [state.sqrtPriceX96, step.amountIn, step.amountOut, step.feeAmount] =
        SwapMath.computeSwapStep(
          state.sqrtPriceX96,
          (
            zeroForOne
              ? JSBI.lessThan(step.sqrtPriceNextX96, sqrtPriceLimitX96)
              : JSBI.greaterThan(step.sqrtPriceNextX96, sqrtPriceLimitX96)
          )
            ? sqrtPriceLimitX96
            : step.sqrtPriceNextX96,
          state.liquidity,
          state.amountSpecifiedRemaining,
          this.fee
        );
      // liquidity 당 fee 추가하기
      if (JSBI.greaterThan(state.liquidity, ZERO)) {
        if (zeroForOne) {
          this.tickWithFees.forEach((tick, idx) => {
            if (tick.index == state.tick - (state.tick % 60)) {
              this.tickWithFees[idx].feeGrowth0XInside = JSBI.ADD(
                this.tickWithFees[idx].feeGrowth0XInside,
                mulDiv(step.feeAmount, Q128, state.liquidity)
              );
            }
          });
          this.fee0XInside = JSBI.ADD(
            this.fee0XInside,
            mulDiv(step.feeAmount, Q128, state.liquidity)
          );
        } else {
          this.tickWithFees.forEach((tick, idx) => {
            if (tick.index == state.tick - (state.tick % 60)) {
              this.tickWithFees[idx].feeGrowth1XInside = JSBI.ADD(
                this.tickWithFees[idx].feeGrowth1XInside,
                mulDiv(step.feeAmount, Q128, state.liquidity)
              );
            }
          });
          this.fee1XInside = JSBI.ADD(
            this.fee0XInside,
            mulDiv(step.feeAmount, Q128, state.liquidity)
          );
        }
      }
      if (exactInput) {
        state.amountSpecifiedRemaining = JSBI.subtract(
          state.amountSpecifiedRemaining,
          JSBI.add(step.amountIn, step.feeAmount)
        );
        state.amountCalculated = JSBI.subtract(
          state.amountCalculated,
          step.amountOut
        );
      } else {
        state.amountSpecifiedRemaining = JSBI.add(
          state.amountSpecifiedRemaining,
          step.amountOut
        );
        state.amountCalculated = JSBI.add(
          state.amountCalculated,
          JSBI.add(step.amountIn, step.feeAmount)
        );
      }

      // TODO
      if (JSBI.equal(state.sqrtPriceX96, step.sqrtPriceNextX96)) {
        // if the tick is initialized, run the tick transition
        if (step.initialized) {
          let liquidityNet = JSBI.BigInt(
            (await this.tickDataProvider.getTick(step.tickNext)).liquidityNet
          );
          // if we're moving leftward, we interpret liquidityNet as the opposite sign
          // safe because liquidityNet cannot be type(int128).min
          if (zeroForOne)
            liquidityNet = JSBI.multiply(liquidityNet, NEGATIVE_ONE);

          state.liquidity = LiquidityMath.addDelta(
            state.liquidity,
            liquidityNet
          );
        }
        state.tick = zeroForOne ? step.tickNext - 1 : step.tickNext;
      } else if (state.sqrtPriceX96 != step.sqrtPriceStartX96) {
        // recompute unless we're on a lower tick boundary (i.e. already transitioned ticks), and haven't moved
        state.tick = TickMath.getTickAtSqrtRatio(state.sqrtPriceX96);
      }
    }
    //console.log(`liquidity: ${state.liquidity.toString()}`);
    this.sqrtRatioX96 = state.sqrtPriceX96;
    this.tickCurrent = state.tick;
    this.liquidity = state.liquidity;
    return {
      amountCalculated: state.amountCalculated,
      sqrtRatioX96: state.sqrtPriceX96,
      liquidity: state.liquidity,
      tickCurrent: state.tick,
    };
  }

  public get tickSpacing(): number {
    return TICK_SPACINGS[this.fee];
  }
}
