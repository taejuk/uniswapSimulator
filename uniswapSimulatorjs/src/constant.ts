import { Token } from "@uniswap/sdk-core";
import { WETH9 } from "@uniswap/sdk-core";
import {
  computePoolAddress,
  FACTORY_ADDRESS,
  FeeAmount,
} from "@uniswap/v3-sdk";
import Web3 from "web3";

export const endPoint =
  "https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v3";
// pool address 생성 방법
//computePoolAddress({factoryAddress, tokenA, tokenB, FeeAmount})
export const poolId = "0x8ad599c3a0ff1de082011efddc58f1908eb6e6d8";

export const web3 = new Web3(
  "https://mainnet.infura.io/v3/aaa10d98f1d144ca8d1c9d3b64e506fd"
);
export const weth = WETH9[1];
export const usdc = new Token(
  1,
  "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  6,
  "USDC",
  "USD Coin"
);
