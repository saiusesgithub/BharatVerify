import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { readFileSync, mkdirSync, writeFileSync } from 'fs';
import { existsSync } from 'fs';
import path from 'path';
import crypto from 'crypto';

const prisma = new PrismaClient();

function generateEd25519(): { publicKeyPem: string; privateKeyPem: string } {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  return { publicKeyPem, privateKeyPem };
}

function sha256(buf: Buffer): string {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function signEd25519(privateKeyPem: string, data: Buffer): Buffer {
  const key = crypto.createPrivateKey(privateKeyPem);
  return crypto.sign(null, data, key);
}

async function main() {
  const storageDir = process.env.STORAGE_DIR || path.join(process.cwd(), 'data', 'files');
  if (!existsSync(storageDir)) {
    mkdirSync(storageDir, { recursive: true });
  }

  const { publicKeyPem, privateKeyPem } = generateEd25519();

  // Upsert Issuer and VerifierOrg
  let issuer = await prisma.issuer.findFirst();
  if (!issuer) {
    issuer = await prisma.issuer.create({
      data: {
        name: 'Demo College',
        publicKeyPem,
        privateKeyPem
      }
    });
  }

  const verifierOrg = await prisma.verifierOrg.create({
    data: { name: 'Demo Verifier Inc.' }
  });

  // Users
  const hash = bcrypt.hashSync('Pass@123', 10);

  await prisma.user.upsert({
    where: { email: 'admin@example.com' },
    update: { passwordHash: hash, role: 'ADMIN', issuerId: issuer.id },
    create: { email: 'admin@example.com', passwordHash: hash, role: 'ADMIN', issuerId: issuer.id }
  });

  await prisma.user.upsert({
    where: { email: 'verifier@example.com' },
    update: { passwordHash: hash, role: 'VERIFIER', verifierOrgId: verifierOrg.id },
    create: { email: 'verifier@example.com', passwordHash: hash, role: 'VERIFIER', verifierOrgId: verifierOrg.id }
  });

  const studentPassword = bcrypt.hashSync('Student@123', 10);
  const student = await prisma.student.upsert({
    where: { email: 'student@example.com' },
    update: { passwordHash: studentPassword, name: 'Demo Student' },
    create: { email: 'student@example.com', passwordHash: studentPassword, name: 'Demo Student' }
  });


  // Seed a demo certificate from demo/transcript.pdf
  const demoPath = path.join(process.cwd(), 'demo', 'transcript.pdf');
  const demoBytes = readFileSync(demoPath);
  const fileHashHex = sha256(demoBytes);
  const signature = signEd25519(privateKeyPem, Buffer.from(fileHashHex, 'hex'));

  const fileName = `seed_${Date.now()}_transcript.pdf`;
  const dest = path.join(storageDir, fileName);
  writeFileSync(dest, demoBytes);
  const fileUrl = `local://files/${fileName}`;

  const docId = crypto.randomUUID();
  await prisma.certificate.create({
    data: {
      id: docId,
      issuerId: issuer.id,
      fileUrl,
      hash: fileHashHex,
      signature: signature.toString('base64'),
      meta: JSON.stringify({ kind: 'transcript', studentRef: 'sample', studentId: student.id }),
      title: 'Transcript',
      issuedAtUnix: Math.floor(Date.now()/1000),
      sha256Hex: fileHashHex,
      issuerAddress: null,
      signatureHex: null,
      ownerId: student.id,
      studentId: student.id,
      status: 'active',
      reason: 'initial-issue',
      r2Key: fileUrl,
      txHash: null,
      blockNumber: null,
      chain: null,
      explorerUrl: null
    }
  });

  await prisma.chainRecord.create({
    data: {
      docId,
      data: JSON.stringify({ docId, issuerId: issuer.id, hash: fileHashHex, signature: signature.toString('base64') })
    }
  });

  console.log('Seed completed. Demo docId:', docId);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

