function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim();
  const len = Math.floor(clean.length / 2);
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

async function derivePbkdf2(secret: string, saltBytes: Uint8Array): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );
  const saltBuffer = new ArrayBuffer(saltBytes.byteLength);
  new Uint8Array(saltBuffer).set(saltBytes);
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBuffer,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );
  return new Uint8Array(derivedBits);
}

export async function hashSecret(secret: string): Promise<string> {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  const derived = await derivePbkdf2(secret, salt);
  return `${bytesToHex(salt)}:${bytesToHex(derived)}`;
}

export async function verifySecret(secret: string, storedHash: string): Promise<boolean> {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [saltHex, expectedHex] = parts;
  if (!saltHex || !expectedHex) return false;
  const salt = hexToBytes(saltHex);
  const expected = hexToBytes(expectedHex);
  const derived = await derivePbkdf2(secret, salt);
  return timingSafeEqual(derived, expected);
}

export async function generateRecoveryCodeSet(): Promise<{ plaintext: string[]; hashes: string[] }> {
  const plaintext: string[] = [];
  const hashes: string[] = [];
  for (let i = 0; i < 6; i++) {
    const bytes = new Uint8Array(4);
    crypto.getRandomValues(bytes);
    const hex = bytesToHex(bytes).toUpperCase();
    const code = `NR-${hex.slice(0, 4)}-${hex.slice(4, 8)}`;
    plaintext.push(code);
    hashes.push(await hashSecret(code));
  }
  return { plaintext, hashes };
}
