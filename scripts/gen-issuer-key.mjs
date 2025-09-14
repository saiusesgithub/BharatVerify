import { Wallet } from 'ethers';
const w = Wallet.createRandom();
console.log('ISSUER_SIGNING_PRIVATE_KEY=' + w.privateKey);
console.log('ISSUER_ADDRESS=' + w.address);