// 1. 실제로 넣었을 때 수수료를 얼마나 먹는지
// 2. 다 실행하고 나서 토큰을 뺄 때, 가격이랑 볼 것
import { BigintIsh } from "@uniswap/sdk-core";
import { Token, WETH9 } from "@uniswap/sdk-core";
import {
  FeeAmount,
  Pool,
  Position,
  SqrtPriceMath,
  TickMath,
} from "@uniswap/v3-sdk";
import JSBI from "jsbi";
import { Q128, Q96, ZERO } from "./classes/constants";
import { PoolSimulator } from "./classes/Pool";
import { usdc, web3, weth } from "./constant";
import { getPoolData, getTicksData } from "./getData";
import { getEventsFromWeb3, Event } from "./getEventsFromWeb3";
import { getEvents, getSimulatior, simulate, simulate2 } from "./simulator";
import fs from "fs";
// 1. position 생성 (ether 기준), blockNumber 기준으로 생성한다
// 2. 생성한 position을 바탕으로 event 생성
interface TokenResult {
  token0Amounts: BigintIsh;
  token1Amounts: BigintIsh;
}
// coin 종류 바뀌면 소수점 변경
const x12 = JSBI.BigInt("1000000000000");
const mintPosition = async (
  blockNumber: number,
  ether: string,
  tickLower: number,
  tickUpper: number
) => {
  const poolResult = await getPoolData(blockNumber);
  const pool: Pool = new Pool(
    usdc,
    weth,
    FeeAmount.MEDIUM,
    poolResult.sqrtRatioX96,
    poolResult.liquidity,
    poolResult.tickCurrent
  );
  const position = Position.fromAmount1({
    pool: pool,
    tickLower: tickLower,
    tickUpper: tickUpper,
    amount1: web3.utils.toWei(ether),
  });
  const event: Event = {
    type: "mint",
    tickLower: tickLower,
    tickUpper: tickUpper,
    amount: position.liquidity.toString(),
    amount0: "0",
    amount1: "0",
    tick: 0,
    sqrtPrice: "0",
  };
  return event;
};

const calculateFees = (simulator: PoolSimulator, mint: Event) => {
  const result = {
    totalFee0X: ZERO,
    totalFee1X: ZERO,
  };
  const liqudity = JSBI.BigInt(mint.amount);
  const tickLower = mint.tickLower;
  const tickUpper = mint.tickUpper;
  simulator.tickWithFees.forEach((tick) => {
    if (tick.index >= tickLower && tick.index < tickUpper) {
      result.totalFee0X = JSBI.add(
        result.totalFee0X,
        JSBI.divide(JSBI.multiply(tick.feeGrowth0XInside, liqudity), Q128)
      );
      result.totalFee1X = JSBI.add(
        result.totalFee1X,
        JSBI.divide(JSBI.multiply(tick.feeGrowth1XInside, liqudity), Q128)
      );
    }
  });
  return result;
};

const burnPosition = async (endBlockNumber: number, mint: Event) => {
  const result = {
    token0Amounts: ZERO,
    token1Amounts: ZERO,
  };
  const poolResult = await getPoolData(endBlockNumber);
  const tickLower = mint.tickLower;
  const tickUpper = mint.tickUpper;
  const sqrtRatioAX96 = TickMath.getSqrtRatioAtTick(tickLower);
  const sqrtRatioBX96 = TickMath.getSqrtRatioAtTick(tickUpper);
  const sqrtRatioCurrent = JSBI.BigInt(poolResult.sqrtRatioX96);
  const liquidity = JSBI.BigInt(mint.amount.toString());
  if (poolResult.tickCurrent < tickLower) {
    result.token0Amounts = SqrtPriceMath.getAmount0Delta(
      sqrtRatioAX96,
      sqrtRatioBX96,
      liquidity,
      true
    );
  } else if (poolResult.tickCurrent < tickUpper) {
    result.token0Amounts = SqrtPriceMath.getAmount0Delta(
      sqrtRatioBX96,
      sqrtRatioCurrent,
      liquidity,
      true
    );
    result.token1Amounts = SqrtPriceMath.getAmount1Delta(
      sqrtRatioAX96,
      sqrtRatioCurrent,
      liquidity,
      true
    );
  } else {
    result.token1Amounts = SqrtPriceMath.getAmount1Delta(
      sqrtRatioAX96,
      sqrtRatioBX96,
      liquidity,
      true
    );
  }
  return result;
};

// eth / usdc 비율 계산하기
// 일정양의 usdc를 넣으면 계산해준다
const calculateRatio = async (
  blockNumber: number,
  USDC: string,
  tickLower: number,
  tickUpper: number
) => {
  const tokens = {
    eth: 0,
    usdc: 0,
  };
  const totalUSDC = parseInt(USDC);
  // calculate ratio eth / usdc
  const poolResult = await getPoolData(blockNumber);
  const pool: Pool = new Pool(
    usdc,
    weth,
    FeeAmount.MEDIUM,
    poolResult.sqrtRatioX96,
    poolResult.liquidity,
    poolResult.tickCurrent
  );
  const position = Position.fromAmount1({
    pool: pool,
    tickLower: tickLower,
    tickUpper: tickUpper,
    amount1: web3.utils.toWei("10"),
  });
  const amount0 = JSBI.multiply(x12, position.amount0.quotient);
  const ratio = parseInt(
    JSBI.divide(amount0, position.amount1.quotient).toString()
  );

  const priceToken1 = parseFloat(pool.token1Price.toFixed(2));
  // eth 개수
  tokens.eth = totalUSDC / (ratio + priceToken1);
  // usdc 개수
  tokens.usdc = tokens.eth * ratio;

  const result = {
    eth: tokens.eth.toFixed(18),
    usdc: tokens.usdc.toFixed(6),
  };
  return result;
};
// final: position 생성했을 경우
// initial: position에 넣지 않았을 경우
const calculateLoss = async (
  endBlockNumber: number,
  final: TokenResult,
  initial: TokenResult
) => {
  let finalTotal = "0";
  let initialTotal = "0";
  const poolResult = await getPoolData(endBlockNumber);
  const pool: Pool = new Pool(
    usdc,
    weth,
    FeeAmount.MEDIUM,
    poolResult.sqrtRatioX96,
    poolResult.liquidity,
    poolResult.tickCurrent
  );
  const price = Math.floor(parseFloat(pool.token1Price.toFixed(2)) * 100);
  finalTotal = JSBI.ADD(
    JSBI.multiply(JSBI.BigInt(final.token0Amounts), x12),
    JSBI.divide(
      JSBI.multiply(JSBI.BigInt(final.token1Amounts), JSBI.BigInt(price)),
      JSBI.BigInt("100")
    )
  );
  initialTotal = JSBI.ADD(
    JSBI.multiply(JSBI.BigInt(initial.token0Amounts), x12),
    JSBI.divide(
      JSBI.multiply(JSBI.BigInt(initial.token1Amounts), JSBI.BigInt(price)),
      JSBI.BigInt("100")
    )
  );
  const finalTotalFloat = parseFloat(web3.utils.fromWei(finalTotal.toString()));
  const initialTotalFloat = parseFloat(
    web3.utils.fromWei(initialTotal.toString())
  );
  const lossRatio =
    ((finalTotalFloat - initialTotalFloat) / initialTotalFloat) * 100;
  return lossRatio;
};

const parse = (str: string) => {
  return str.split(".")[0];
};

const test = async (start: number, end: number) => {
  let max = -100;
  let maxTick = 0;
  let events = await getEvents(start, end);
  const startPool = await getPoolData(start);
  const tickCur = startPool.tickCurrent;
  const tickStandard = tickCur - (tickCur % 60);
  let ticks = [];
  // 34% 범위 설정
  for (let i = 1; i < 51; i++) {
    ticks.push(60 * i);
  }
  for (let tick of ticks) {
    const tickLower = tickStandard - tick;
    const tickUpper = tickStandard + tick;
    const initialTokens = await calculateRatio(
      start,
      "100000",
      tickLower,
      tickUpper
    );
    const mint = await mintPosition(
      start,
      initialTokens.eth,
      tickLower,
      tickUpper
    );

    events = [mint, ...events];
    const result = await simulate(start, end, events);
    const feeResult = calculateFees(result, mint);
    const results = await burnPosition(end, mint);
    const initial: TokenResult = {
      token0Amounts: JSBI.BigInt(
        parse(web3.utils.toWei(initialTokens.usdc, "picoether"))
      ).toString(),
      token1Amounts: JSBI.BigInt(
        parse(web3.utils.toWei(initialTokens.eth))
      ).toString(),
    };
    const final: TokenResult = {
      token0Amounts: JSBI.add(
        results.token0Amounts,
        feeResult.totalFee0X
      ).toString(),
      token1Amounts: JSBI.add(
        results.token1Amounts,
        feeResult.totalFee1X
      ).toString(),
    };
    const loss = await calculateLoss(end, final, initial);
    if (max < loss) {
      max = loss;
      maxTick = tick;
    }
  }
  return { max, maxTick };
};

const test2 = async (start: number, end: number) => {
  let max = -100;
  let maxTick = 0;
  const startPool = await getPoolData(start);
  const startTicks = await getTicksData(start);
  const tickCur = startPool.tickCurrent;
  const tickStandard = tickCur - (tickCur % 60);
  let ticks = [];
  const initEvents = await getEvents(start, end);
  // 34% 범위 설정
  for (let i = 1; i < 51; i++) {
    ticks.push(60 * i);
  }
  console.log("start");
  for (let tick of ticks) {
    const tickLower = tickStandard - tick;
    const tickUpper = tickStandard + tick;
    const initialTokens = await calculateRatio(
      start,
      "100000",
      tickLower,
      tickUpper
    );
    const mint = await mintPosition(
      start,
      initialTokens.eth,
      tickLower,
      tickUpper
    );

    let events = [mint, ...initEvents];
    const simulator = new PoolSimulator(
      usdc,
      weth,
      FeeAmount.MEDIUM,
      startPool.sqrtRatioX96,
      startPool.liquidity,
      startPool.tickCurrent,
      startTicks
    );
    const result = await simulate2(simulator, events);
    const feeResult = calculateFees(result, mint);
    const results = await burnPosition(end, mint);
    const initial: TokenResult = {
      token0Amounts: JSBI.BigInt(
        parse(web3.utils.toWei(initialTokens.usdc, "picoether"))
      ).toString(),
      token1Amounts: JSBI.BigInt(
        parse(web3.utils.toWei(initialTokens.eth))
      ).toString(),
    };
    const final: TokenResult = {
      token0Amounts: JSBI.add(
        results.token0Amounts,
        feeResult.totalFee0X
      ).toString(),
      token1Amounts: JSBI.add(
        results.token1Amounts,
        feeResult.totalFee1X
      ).toString(),
    };
    const loss = await calculateLoss(end, final, initial);
    if (max < loss) {
      max = loss;
      maxTick = tick;
    }
  }
  return { max, maxTick };
};
const block = [
  12639727, 12646176, 12652601, 12659071, 12665492, 12671849, 12678302,
  12684683, 12691049, 12697494, 12703914, 12710332, 12716749, 12723184,
  12729621, 12736049, 12742464, 12748880, 12755277, 12761709, 12768167,
  12774571, 12780976, 12787365, 12793820, 12800294, 12806684, 12813102,
  12819470, 12825797, 12832188, 12838580, 12844905, 12851273, 12857724,
  12864081, 12870459, 12876895, 12883285, 12889683, 12896106, 12902502,
  12908737, 12915084, 12921360, 12927646, 12933999, 12940303, 12946594,
  12985142, 12991621, 12998127, 13004570, 13011034, 13017510, 13023955,
  13030448, 13036934,
];

const main = async () => {
  let result: any[] = [];
  for (let i = 0; i < block.length - 7; i++) {
    let start = new Date().getTime();
    console.log(block[i], block[i + 7]);
    const { max, maxTick } = await test2(block[i], block[i + 7]);
    const data = {
      max: max,
      maxTick: maxTick,
      start: block[i],
      end: block[i + 7],
    };
    result.push(data);
    console.log(data);

    let elapsed = new Date().getTime() - start;
    console.log(elapsed);
  }
  fs.writeFileSync("7dayResults.txt", JSON.stringify(result, undefined, 2));
};
main();
