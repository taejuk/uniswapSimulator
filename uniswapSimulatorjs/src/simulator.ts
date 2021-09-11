import { Token } from "@uniswap/sdk-core";
import { WETH9 } from "@uniswap/sdk-core";
import { FeeAmount, TickMath } from "@uniswap/v3-sdk";
import JSBI from "jsbi";
import { NEGATIVE_ONE, ONE, ZERO } from "./classes/constants";
import { PoolSimulator } from "./classes/Pool";
import { web3 } from "./constant";
import { getEvents, getPoolData, getTicksData } from "./getData";
import { getEventsFromWeb3 } from "./getEventsFromWeb3";
const weth = WETH9[1];
const usdc = new Token(
  1,
  "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  6,
  "USDC",
  "USD Coin"
);

// swap이 정상적으로 작동하는지 확인.
// blockNumber = 13038080

async function testSwap(startBlockNumber: number, endBlockNumber: number) {
  const startBlock = await web3.eth.getBlock(startBlockNumber);
  const startTimestamp = Number(startBlock.timestamp);
  const endBlock = await web3.eth.getBlock(endBlockNumber);
  const endTimestamp = Number(endBlock.timestamp);
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
  const events = await getEventsFromWeb3(startBlockNumber, endBlockNumber);
  let swaps = 0;
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
}
// testSwap(13038080, 13080000);
