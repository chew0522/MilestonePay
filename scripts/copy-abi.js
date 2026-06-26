const fs = require('fs');
const path = require('path');

const artifactPath = path.join(__dirname, '../artifacts/contracts/MilestonePay.sol/MilestonePay.json');
const frontendAbiPath = path.join(__dirname, '../frontend/src/MilestonePayABI.json');

try {
  if (fs.existsSync(artifactPath)) {
    const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
    fs.writeFileSync(frontendAbiPath, JSON.stringify(artifact.abi, null, 2));
    console.log('✅ Compiled ABI successfully copied to frontend!');
  } else {
    console.log('⚠️ Hardhat artifact not found. Please compile first.');
  }
} catch (e) {
  console.error('Error copying ABI:', e);
}
