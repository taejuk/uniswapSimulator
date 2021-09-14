import { Token } from "@uniswap/sdk-core";
import { WETH9 } from "@uniswap/sdk-core";
import { FeeAmount, TickMath } from "@uniswap/v3-sdk";
import JSBI from "jsbi";
import { NEGATIVE_ONE, ONE, Q128, ZERO } from "./classes/constants";
import { PoolSimulator } from "./classes/Pool";
import { getPoolData, getTicksData } from "./getData";
import { getEventsFromWeb3, Event } from "./getEventsFromWeb3";
const weth = WETH9[1];
// 하드코딩
// uniswap interfaces constants token 정보 담겨있음

const usdc = new Token(
  1,
  "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  6,
  "USDC",
  "USD Coin"
);

// swap이 정상적으로 작동하는지 확인.
// blockNumber = 13038080

export async function getSimulatior(startBlockNumber: number) {
  const pool = await getPoolData(startBlockNumber);
  const ticks = await getTicksData(startBlockNumber);
  const simulator = new PoolSimulator(
    usdc,
    weth,
    FeeAmount.MEDIUM,
    pool.sqrtRatioX96,
    pool.liquidity,
    pool.tickCurrent,
    ticks
  );
  return simulator;
}

export async function getEvents(
  startBlockNumber: number,
  endBlockNumber: number
) {
  const events = await getEventsFromWeb3(startBlockNumber, endBlockNumber);
  return events;
}

export async function simulate(
  startBlockNumber: number,
  endBlockNumber: number,
  events: Event[]
) {
  const simulator = await getSimulatior(startBlockNumber);
  for (let event of events) {
    if (event.type == "mint" || event.type == "burn") {
      await simulator.add(event.tickLower, event.tickUpper, event.amount);
    } else if (event.type == "swap") {
      const zeroForOne = JSBI.greaterThan(JSBI.BigInt(event.amount0), ZERO);
      const result = await simulator.swap(
        zeroForOne,
        JSBI.BigInt(event.amount0),
        zeroForOne
          ? JSBI.add(TickMath.MIN_SQRT_RATIO, ONE)
          : JSBI.add(TickMath.MAX_SQRT_RATIO, NEGATIVE_ONE)
      );
    }
  }
  return simulator;
}

export async function simulate2(simulator2: PoolSimulator, events: Event[]) {
  const simulator = simulator2;
  for (let event of events) {
    if (event.type == "mint" || event.type == "burn") {
      await simulator.add(event.tickLower, event.tickUpper, event.amount);
    } else if (event.type == "swap") {
      const zeroForOne = JSBI.greaterThan(JSBI.BigInt(event.amount0), ZERO);
      const result = await simulator.swap(
        zeroForOne,
        JSBI.BigInt(event.amount0),
        zeroForOne
          ? JSBI.add(TickMath.MIN_SQRT_RATIO, ONE)
          : JSBI.add(TickMath.MAX_SQRT_RATIO, NEGATIVE_ONE)
      );
    }
  }
  return simulator;
}
