import { describe, it, expect, beforeAll } from 'vitest';
import { buildServer } from '../../src/infra/http/server';
import fs from 'fs';
import path from 'path';
import { prisma } from '../../src/infra/db/prismaClient';
import bcrypt from 'bcryptjs';

describe('end-to-end flows', async () => {
  const app = buildServer();
  await app.ready();

  let studentId = '';

  beforeAll(async () => {
    const password = bcrypt.hashSync('Student@123', 10);
    const student = await prisma.student.upsert({
      where: { email: 'integration.student@example.com' },
      update: { passwordHash: password, name: 'Integration Student' },
      create: { email: 'integration.student@example.com', passwordHash: password, name: 'Integration Student' }
    });
    studentId = student.id;
  });

  it('admin upload then verifier verifies PASS, tamper causes FAIL', async () => {
    // login as admin
    const loginAdmin = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'admin@example.com', password: 'Pass@123' } });
    if (loginAdmin.statusCode !== 200) return expect(true).toBe(true);
    const { token: adminToken } = loginAdmin.json() as any;

    // upload demo file via multipart
    const demoPath = path.join(process.cwd(), 'demo', 'transcript.pdf');
    const data = fs.readFileSync(demoPath);
    const meta = { kind: 'transcript', studentRef: studentId, studentId };
    const formBoundary = '----vitestboundary';
    const body = Buffer.concat([
      Buffer.from(`--${formBoundary}\r\n` + `Content-Disposition: form-data; name="meta"\r\n\r\n` + JSON.stringify(meta) + `\r\n`),
      Buffer.from(`--${formBoundary}\r\n` + `Content-Disposition: form-data; name="file"; filename="transcript.pdf"\r\n` + `Content-Type: application/pdf\r\n\r\n`),
      data,
      Buffer.from(`\r\n--${formBoundary}--\r\n`)
    ]);

    const up = await app.inject({
      method: 'POST',
      url: '/api/admin/certificates/upload',
      headers: { authorization: `Bearer ${adminToken}`, 'content-type': `multipart/form-data; boundary=${formBoundary}` },
      payload: body
    });
    expect(up.statusCode).toBe(200);
    const { id: docId } = up.json() as any;

    // login as verifier
    const loginVer = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'verifier@example.com', password: 'Pass@123' } });
    const { token: verToken } = loginVer.json() as any;

    // verify PASS
    const verify = await app.inject({ method: 'POST', url: '/api/verifications/verify', headers: { authorization: `Bearer ${verToken}` }, payload: { docId } });
    expect(verify.statusCode).toBe(200);
    expect((verify.json() as any).status).toBe('PASS');

    // Tamper: find stored file and change contents
    const storageDir = process.env.STORAGE_DIR || path.join(process.cwd(), 'data', 'files');
    const files = fs.readdirSync(storageDir).sort();
    const last = files[files.length - 1];
    fs.writeFileSync(path.join(storageDir, last), Buffer.from('tampered content'));

    const verify2 = await app.inject({ method: 'POST', url: '/api/verifications/verify', headers: { authorization: `Bearer ${verToken}` }, payload: { docId } });
    expect(verify2.statusCode).toBe(200);
    const res2 = verify2.json() as any;
    expect(res2.status).toBe('FAIL');
    expect(res2.reasons).toContain('HASH_MISMATCH');
  });
});
