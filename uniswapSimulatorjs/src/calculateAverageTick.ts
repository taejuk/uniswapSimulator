import fs from "fs";

const calculate = async () => {
  const datas = fs.readFileSync("1dayResults.txt");
  let total = 0;
  const results = JSON.parse(datas.toString());
  for (let i = 0; i < results.length; i++) {
    total += results[i]["maxTick"];
  }
  console.log("1day: ", total / results.length);
  const datas2 = fs.readFileSync("2dayResults.txt");
  let total2 = 0;
  const results2 = JSON.parse(datas2.toString());
  for (let i = 0; i < results2.length; i++) {
    total2 += results2[i]["maxTick"];
  }
  console.log("2day: ", total2 / results2.length);

  const datas3 = fs.readFileSync("3dayResults.txt");
  let total3 = 0;
  const results3 = JSON.parse(datas3.toString());
  for (let i = 0; i < results3.length; i++) {
    total3 += results3[i]["maxTick"];
  }
  console.log("3day: ", total3 / results3.length);
};

calculate();
