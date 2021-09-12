import { BigintIsh } from "@uniswap/sdk-core";
import { Tick } from "./classes/Tick";
import axios from "axios";
import JSBI from "jsbi";
import { endPoint, poolId, web3 } from "./constant";

interface poolResult {
  liquidity: BigintIsh;
  sqrtRatioX96: BigintIsh;
  tickCurrent: number;
}
//0x8ad599c3a0ff1de082011efddc58f1908eb6e6d8
export const getPoolData = async (blockNumber: number): Promise<poolResult> => {
  const poolResult = await axios.post(endPoint, {
    query: `{
        pools(
          where: {
            id: "${poolId}" 
          }
          block: {
            number: ${blockNumber}
          }
        ) {
          liquidity
          tick
          sqrtPrice
        }   
    }`,
  });

  const result = poolResult.data.data.pools[0];
  const pool: poolResult = {
    liquidity: result.liquidity,
    sqrtRatioX96: result.sqrtPrice,
    tickCurrent: Number(result.tick),
  };
  return pool;
};

export const getTicksData = async (blockNumber: number): Promise<Tick[]> => {
  const tickResult = await axios.post(endPoint, {
    query: `{
                ticks(where: {
                  pool_contains: "${poolId}"
                },
                block: {
                  number: ${blockNumber}
                }
                first: 1000,
                orderBy: tickIdx,
                orderDirection: asc
                ) {
                  tickIdx
                  liquidityNet
                  liquidityGross
                }
              }`,
  });
  const ticks: Tick[] = tickResult.data.data.ticks.map((tick: any) => {
    return {
      index: Number(tick.tickIdx),
      liquidityGross: JSBI.BigInt(tick.liquidityGross),
      liquidityNet: JSBI.BigInt(tick.liquidityNet),
    };
  });
  return ticks;
};
interface Swap {
  type: string;
  amount0: BigintIsh;
  amount1: BigintIsh;
  timestamp: number;
  tick: number;
}
export const getSwaps = async (start: number, end: number) => {
  let finished = false;
  let startTime = start;
  let swaps: Swap[] = [];
  while (!finished) {
    const swapResult = await axios.post(endPoint, {
      query: `
      {
        swaps(first:1000, 
          where: {
            timestamp_gt: ${startTime},
            timestamp_lt: ${end},
            pool_contains: "0x8ad599c3a0ff1de082011efddc58f1908eb6e6d8"
          }
          orderBy: timestamp
          orderDirection: asc
        ) {
          amount0
          amount1
          timestamp
          tick
        }
      }
    `,
    });
    if (swapResult.data.data.swaps.length < 1000) {
      finished = true;
    }
    const results: Swap[] = swapResult.data.data.swaps.map((swap: any) => {
      return {
        type: "swap",
        amount0: web3.utils.toWei(swap.amount0, "picoether"),
        amount1: web3.utils.toWei(swap.amount1),
        timestamp: Number(swap.timestamp),
        tick: Number(swap.tick),
      };
    });
    swaps = swaps.concat(results);
    startTime = swaps[swaps.length - 1].timestamp;
  }
  return swaps;
};

interface Mint {
  type: string;
  tickLower: number;
  tickUpper: number;
  amount: BigintIsh;
  timestamp: number;
}

export const getMints = async (start: number, end: number) => {
  let finished = false;
  let startTime = start;
  let mints: Mint[] = [];
  while (!finished) {
    const mintResult = await axios.post(endPoint, {
      query: `
      {
        mints(first:1000, 
          where: {
            timestamp_gt: ${startTime},
            timestamp_lt: ${end},
            pool_contains: "0x8ad599c3a0ff1de082011efddc58f1908eb6e6d8"
          }
          orderBy: timestamp
          orderDirection: asc
        ) {
          tickLower,
          tickUpper,
          amount,
          timestamp
        }
      }
    `,
    });
    if (mintResult.data.data.mints.length < 1000) {
      finished = true;
    }
    const results: Mint[] = mintResult.data.data.mints.map((mint: any) => {
      return {
        type: "mint",
        tickLower: Number(mint.tickLower),
        tickUpper: Number(mint.tickUpper),
        amount: mint.amount,
        timestamp: Number(mint.timestamp),
      };
    });
    mints = mints.concat(results);
    startTime = mints[mints.length - 1].timestamp;
  }
  return mints;
};

interface Burn {
  type: string;
  tickLower: number;
  tickUpper: number;
  amount: BigintIsh;
  timestamp: number;
}

export const getBurns = async (start: number, end: number) => {
  let finished = false;
  let startTime = start;
  let burns: Burn[] = [];
  while (!finished) {
    const burnResult = await axios.post(endPoint, {
      query: `
      {
        burns(first:1000, 
          where: {
            timestamp_gt: ${startTime},
            timestamp_lt: ${end},
            pool_contains: "0x8ad599c3a0ff1de082011efddc58f1908eb6e6d8"
          }
          orderBy: timestamp
          orderDirection: asc
        ) {
          tickLower,
          tickUpper,
          amount,
          timestamp
        }
      }
    `,
    });
    if (burnResult.data.data.burns.length < 1000) {
      finished = true;
    }
    const results: Burn[] = burnResult.data.data.burns.map((burn: any) => {
      return {
        type: "burn",
        tickLower: Number(burn.tickLower),
        tickUpper: Number(burn.tickUpper),
        amount: "-" + burn.amount,
        timestamp: Number(burn.timestamp),
      };
    });
    burns = burns.concat(results);
    startTime = burns[burns.length - 1].timestamp;
  }
  return burns;
};
