const Web3 = require("web3");
const {
  abi,
} = require("@uniswap/v3-core/artifacts/contracts/UniswapV3Pool.sol/UniswapV3Pool.json");
import { BigintIsh } from "@uniswap/sdk-core";

export interface Event {
  type: string;
  tickLower: number;
  tickUpper: number;
  amount: BigintIsh;
  amount0: BigintIsh;
  amount1: BigintIsh;
  tick: number;
  sqrtPrice: BigintIsh;
}

export const getEventsFromWeb3 = async (
  startBlockNumber: number,
  endBlockNumber: number
): Promise<Event[]> => {
  let results = [];
  let start = startBlockNumber;
  const end = endBlockNumber;
  const web3 = new Web3(
    "https://mainnet.infura.io/v3/aaa10d98f1d144ca8d1c9d3b64e506fd"
  );
  const contract = new web3.eth.Contract(
    abi,
    "0x8ad599c3a0ff1de082011efddc58f1908eb6e6d8"
  );
  while (start < end) {
    const events = await contract.getPastEvents("allEvents", {
      fromBlock: start,
      toBlock: start + 1000 < end ? start + 1000 : end,
    });
    start = start + 1001;
    for (let event of events) {
      if (event.event == "Mint") {
        const mint: Event = {
          type: "mint",
          tickLower: Number(event.returnValues.tickLower),
          tickUpper: Number(event.returnValues.tickUpper),
          amount: event.returnValues.amount,
          amount0: "0",
          amount1: "0",
          tick: 0,
          sqrtPrice: "0",
        };
        results.push(mint);
      } else if (event.event == "Burn") {
        const burn: Event = {
          type: "burn",
          tickLower: Number(event.returnValues.tickLower),
          tickUpper: Number(event.returnValues.tickUpper),
          amount: "-" + event.returnValues.amount,
          amount0: "0",
          amount1: "0",
          tick: 0,
          sqrtPrice: "0",
        };
        results.push(burn);
      } else if (event.event == "Swap") {
        const swap: Event = {
          type: "swap",
          amount0: event.returnValues.amount0,
          amount1: event.returnValues.amount1,
          tick: Number(event.returnValues.tick),
          tickLower: 0,
          tickUpper: 0,
          amount: "0",
          sqrtPrice: event.returnValues.sqrtPriceX96,
        };
        results.push(swap);
      }
    }
  }
  return results;
};
