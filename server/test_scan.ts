
import { getTwStocks, screenStock } from "./stockEngine.js";

async function testScan() {
  console.log("Fetching stocks...");
  const allStocks = await getTwStocks();
  console.log(`Found ${allStocks.length} stocks.`);
  
  const stocks = allStocks.slice(0, 50); // Test first 50
  console.log(`Scanning first ${stocks.length} stocks...`);
  
  const results = [];
  for (const [code, name] of stocks) {
    process.stdout.write(`Scanning ${code} ${name}... `);
    try {
      const res = await screenStock(code, name, { minConditions: 1 });
      if (res) {
        console.log(`PASS (${res.conditionsMetCount} conds)`);
        results.push(res);
      } else {
        console.log("FAIL (no data or too few bars)");
      }
    } catch (e) {
      console.log(`ERROR: ${e.message}`);
    }
  }
  
  console.log(`\nScan complete. Found ${results.length} matches out of ${stocks.length} scanned.`);
}

testScan();
