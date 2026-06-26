const hre = require("hardhat");

async function main() {
  const provider = hre.ethers.provider;
  const blockNum = await provider.getBlockNumber();
  console.log("Checking blocks up to:", blockNum);

  for (let i = 1; i <= blockNum; i++) {
    const block = await provider.getBlock(i, true);
    console.log(`\nBlock #${i}:`);
    if (block && block.prefetchedTransactions) {
      for (const tx of block.prefetchedTransactions) {
        const receipt = await provider.getTransactionReceipt(tx.hash);
        console.log(`  Tx Hash: ${tx.hash}`);
        console.log(`  From: ${tx.from}`);
        if (receipt && receipt.contractAddress) {
          console.log(`  🔥 Contract Created At: ${receipt.contractAddress}`);
        } else if (tx) {
          console.log(`  To: ${tx.to} (Value: ${hre.ethers.formatEther(tx.value || 0n)} ETH)`);
        }
      }
    }
  }
}

main().catch(console.error);
