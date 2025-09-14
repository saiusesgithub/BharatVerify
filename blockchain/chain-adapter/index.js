require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { ethers } = require("ethers");

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

// ----- Setup ethers -----
const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const wallet   = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

const anchorAbi = [
  "function anchor(bytes32 docKey, bytes32 sha256Hash, string reason) external",
  "function latest(bytes32 docKey) view returns (tuple(bytes32 hash,address author,uint64 ts,string reason,bool revoked),uint256)",
  "function count(bytes32 docKey) view returns (uint256)",
  "function get(bytes32 docKey, uint256 i) view returns (tuple(bytes32 hash,address author,uint64 ts,string reason,bool revoked))"
];

const registryAbi = [
  "function isIssuer(address) view returns (bool)",
  "function nameOf(address) view returns (string)",
  // admin methods (must be called by registry owner/admin)
  "function addIssuer(address who, string name) external",
  "function removeIssuer(address who) external"
];

const anchor = new ethers.Contract(process.env.ANCHOR_CONTRACT, anchorAbi, wallet);
const registry = new ethers.Contract(process.env.REGISTRY_CONTRACT, registryAbi, wallet);

// ----- Helpers -----
const docKeyOf = (docId) => ethers.keccak256(ethers.toUtf8Bytes(docId));
const toB32    = (hex64) => {
  if (!/^[0-9a-fA-F]{64}$/.test(hex64)) throw new Error("sha256Hex must be 64 hex chars");
  return "0x" + hex64.toLowerCase();
};
const explorerTx = (txHash) =>
  process.env.CHAIN === "sepolia"
    ? `https://sepolia.etherscan.io/tx/${txHash}`
    : `https://etherscan.io/tx/${txHash}`;

// If you want simple payload signing verification for issuer signatures:
const payloadDigest = (docId, sha256Hex, issuedAtUnix) =>
  ethers.solidityPackedKeccak256(
    ["bytes32","bytes32","uint64"],
    [docKeyOf(docId), toB32(sha256Hex), BigInt(issuedAtUnix)]
  );

// ----- Endpoints -----
// Anchor a hash (append a new version)
app.post("/anchor", async (req, res) => {
  try {
    const { docId, sha256Hex, reason = "" } = req.body;
    if (!docId || !sha256Hex) return res.status(400).json({ error: "docId & sha256Hex required" });
    const tx = await anchor.anchor(docKeyOf(docId), toB32(sha256Hex), reason);
    const receipt = await tx.wait();
    return res.json({
      status: "anchored",
      txHash: receipt.hash,
      blockNumber: receipt.blockNumber,
      chain: process.env.CHAIN,
      explorerUrl: explorerTx(receipt.hash),
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message });
  }
});

app.get("/verify", async (req, res) => {
  try {
    const { docId } = req.query;
    if (!docId) return res.status(400).json({ error: "docId required" });

    const key = docKeyOf(docId);
    const n = await anchor.count(key);
    if (n === 0n) return res.json({ found: false });

    const v = await anchor.get(key, n - 1n); // latest = last index
    return res.json({
      found: true,
      onChainHash: v.hash.slice(2),
      index: Number(n - 1n),
      author: v.author,
      blockTimestamp: Number(v.ts),
      reason: v.reason,
      revoked: v.revoked
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message });
  }
});


// List history (all versions)
app.get("/history", async (req, res) => {
  try {
    const { docId } = req.query;
    if (!docId) return res.status(400).json({ error: "docId required" });
    const n = await anchor.count(docKeyOf(docId));
    const out = [];
    for (let i = 0n; i < n; i++) {
      const v = await anchor.get(docKeyOf(docId), i);
      out.push({
        index: Number(i),
        hash: v.hash.slice(2),
        author: v.author,
        blockTimestamp: Number(v.ts),
        reason: v.reason,
        revoked: v.revoked,
      });
    }
    return res.json({ count: Number(n), versions: out });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// Issuer registry admin (add/remove) — call these from Remix or a secure admin tool in production
app.post("/issuer/add", async (req, res) => {
  try {
    const { address, name } = req.body;
    if (!address || !name) return res.status(400).json({ error: "address & name required" });
    const tx = await registry.addIssuer(address, name);
    const r = await tx.wait();
    return res.json({ txHash: r.hash, explorerUrl: explorerTx(r.hash) });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

app.post("/issuer/remove", async (req, res) => {
  try {
    const { address } = req.body;
    if (!address) return res.status(400).json({ error: "address required" });
    const tx = await registry.removeIssuer(address);
    const r = await tx.wait();
    return res.json({ txHash: r.hash, explorerUrl: explorerTx(r.hash) });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// basic health
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.get("/issuer/is-active", async (req, res) => {
  try {
    const { address } = req.query;
    if (!address) return res.status(400).json({ error: "address required" });
    const active = await registry.isIssuer(address);
    const name = active ? await registry.nameOf(address) : "";
    return res.json({ active, name });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// Optional: verify digital signature over (docKey || sha256 || issuedAt)
app.post("/verify-signature", async (req, res) => {
  try {
    const { docId, sha256Hex, issuedAtUnix, signatureHex, expectedIssuer } = req.body;
    if (!docId || !sha256Hex || !issuedAtUnix || !signatureHex) {
      return res.status(400).json({ error: "docId, sha256Hex, issuedAtUnix, signatureHex required" });
    }
    const digest = payloadDigest(docId, sha256Hex, issuedAtUnix);
    // ethers.recoverAddress expects a 32-byte digest and a 65-byte signature
    const recovered = ethers.recoverAddress(digest, signatureHex);
    let issuerOk = true;
    let issuerName = "";
    if (expectedIssuer) issuerOk = recovered.toLowerCase() === expectedIssuer.toLowerCase();
    const active = await registry.isIssuer(recovered);
    if (active) issuerName = await registry.nameOf(recovered);
    return res.json({
      recovered,
      issuerActive: active,
      issuerName,
      matchesExpected: issuerOk
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

const PORT = Number(process.env.PORT || 8088);
app.listen(PORT, () => console.log(`chain-adapter listening on :${PORT}`));
