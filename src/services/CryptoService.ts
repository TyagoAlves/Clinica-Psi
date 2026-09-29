/**
 * Hash de senha.
 *
 * O sistema roda inteiro no navegador: nao existe servidor para fazer o
 * trabalho de derivar a senha. Guardar a senha em texto puro no armazenamento
 * local significaria que qualquer pessoa com acesso a maquina - ou um backup
 * vazado - le a senha na hora. O que este modulo faz e nunca storingar a senha:
 * guarda apenas um derivado, e compara o derivado quando o login acontece.
 *
 * PBKDF2-HMAC-SHA256, com sal aleatorio por usuario. O sal impede que dois
 * usuarios com a mesma senha tenham o mesmo valor guardado, e as repeticoes
 * (PBKDF2_ITERATIONS) encarecem cada tentativa de adivinhacao, que e o que
 * torna um ataque de forca bruta caro demais para valer a pena.
 *
 * Por que tem duas implementacoes: `crypto.subtle` so existe em contexto
 * seguro (https ou localhost). Se o sistema for aberto pelo IP da rede
 * (http://192.168.x.x:5173) a API some e nao sobraria hashing nenhum, ou o
 * login lancaria `crypto.subtle is not a function`. Por isso existe a versao
 * em JS puro, usada como reserva.
 * As duas produzem o mesmo resultado, entao um hash criado em um ambiente
 * continua valendo no outro.
 */

/** Iteracoes. Alto o bastante para custar caro, baixo o bastante nao travar o login. */
const PBKDF2_ITERATIONS = 60_000;
const SALT_BYTES = 16;
const KEY_BITS = 256;

/** Prefixo do valor guardado. Serve tambem para saber o formato ao ler. */
const PREFIX = 'pbkdf2-sha256';

export interface HashedPassword {
  algoritmo: string;
  iteracoes: number;
  sal: string;
  hash: string;
}

/* ------------------------------------------------------------------ *
 * SHA-256 / HMAC em JS puro (usado quando crypto.subtle nao existe)
 * ------------------------------------------------------------------ */

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function rotr(x: number, n: number): number {
  return (x >>> n) | (x << (32 - n));
}

function sha256(msg: Uint8Array): Uint8Array {
  const h = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);

  const bits = msg.length * 8;
  const comPadding = new Uint8Array((((msg.length + 9) >> 6) + 1) << 6);
  comPadding.set(msg);
  comPadding[msg.length] = 0x80;
  // o comprimento entra em 64 bits big-endian no fim do bloco
  const dv = new DataView(comPadding.buffer);
  dv.setUint32(comPadding.length - 8, Math.floor(bits / 0x100000000), false);
  dv.setUint32(comPadding.length - 4, bits >>> 0, false);

  const w = new Uint32Array(64);
  for (let offset = 0; offset < comPadding.length; offset += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(offset + i * 4, false);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let [a, b, c, d, e, f, g, hh] = [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7]];
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (hh + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;
      hh = g; g = f; f = e;
      e = (d + temp1) >>> 0;
      d = c; c = b; b = a;
      a = (temp1 + temp2) >>> 0;
    }
    h[0] = (h[0] + a) >>> 0; h[1] = (h[1] + b) >>> 0;
    h[2] = (h[2] + c) >>> 0; h[3] = (h[3] + d) >>> 0;
    h[4] = (h[4] + e) >>> 0; h[5] = (h[5] + f) >>> 0;
    h[6] = (h[6] + g) >>> 0; h[7] = (h[7] + hh) >>> 0;
  }

  const out = new Uint8Array(32);
  const dvOut = new DataView(out.buffer);
  for (let i = 0; i < 8; i++) dvOut.setUint32(i * 4, h[i], false);
  return out;
}

function hmacSha256(chave: Uint8Array, msg: Uint8Array): Uint8Array {
  const bloco = 64;
  let k = chave;
  if (k.length > bloco) k = sha256(k);

  const ipad = new Uint8Array(bloco);
  const opad = new Uint8Array(bloco);
  ipad.set(k);
  opad.set(k);
  for (let i = 0; i < bloco; i++) {
    ipad[i] ^= 0x36;
    opad[i] ^= 0x5c;
  }

  const interno = new Uint8Array(bloco + msg.length);
  interno.set(ipad);
  interno.set(msg, bloco);
  const meio = sha256(interno);

  const externo = new Uint8Array(bloco + 32);
  externo.set(opad);
  externo.set(meio, bloco);
  return sha256(externo);
}

export function pbkdf2Sha256(senha: Uint8Array, sal: Uint8Array, iteracoes: number, bytes: number): Uint8Array {
  const saida = new Uint8Array(bytes);
  const bloco = new Uint8Array(sal.length + 4);
  bloco.set(sal);
  let escritos = 0;

  for (let blocoIndice = 1; escritos < bytes; blocoIndice++) {
    new DataView(bloco.buffer).setUint32(sal.length, blocoIndice, false);
    let u = hmacSha256(senha, bloco);
    const acc = u.slice();
    for (let i = 1; i < iteracoes; i++) {
      u = hmacSha256(senha, u);
      for (let j = 0; j < acc.length; j++) acc[j] ^= u[j];
    }
    for (let j = 0; j < acc.length && escritos < bytes; j++) saida[escritos++] = acc[j];
  }
  return saida;
}

/* ------------------------------------------------------------------ *
 * Utilidades
 * ------------------------------------------------------------------ */

function paraHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function deHex(hex: string): Uint8Array {
  const limpo = hex.trim();
  const bytes = new Uint8Array(limpo.length >> 1);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(limpo.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export function paraBase64(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export function deBase64(texto: string): Uint8Array {
  const bin = atob(texto);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function temCryptoSubtle(): boolean {
  return typeof crypto !== 'undefined' && typeof crypto.subtle !== 'undefined' && typeof crypto.subtle.deriveBits === 'function';
}

async function derivarNative(senha: Uint8Array, sal: Uint8Array, iteracoes: number): Promise<Uint8Array> {
  // O TypeScript 5.7 passou a parametrizar Uint8Array pelo tipo do buffer
  // (Uint8Array<ArrayBufferLike>), enquanto BufferSource so aceita
  // ArrayBuffer. O cast fica Concentrado aqui em vez de espalhar `as any`.
  const chave = await crypto.subtle.importKey(
    'raw',
    senha as unknown as BufferSource,
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: sal as unknown as BufferSource,
      iterations: iteracoes,
      hash: 'SHA-256',
    },
    chave,
    KEY_BITS
  );
  return new Uint8Array(bits);
}

/* ------------------------------------------------------------------ *
 * API
 * ------------------------------------------------------------------ */

export interface VerificacaoSenha {
  confere: boolean;
  /** Formato de armazenamento legado (texto puro) ainda presente. */
  legado?: boolean;
}

/** Gera o valor que vai guardado no lugar da senha. */
export async function gerarHashSenha(senha: string): Promise<HashedPassword> {
  const sal = new Uint8Array(SALT_BYTES);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(sal);
  } else {
    // sem fonte de aleatoriedade forte o sal vira previsivel; ainda assim e
    // melhor do que um sal fixo, que cairia em um unico hash por senha.
    for (let i = 0; i < sal.length; i++) sal[i] = Math.floor(Math.random() * 256);
  }

  const bytes = await derivar(senha, sal, PBKDF2_ITERATIONS);
  return { algoritmo: PREFIX, iteracoes: PBKDF2_ITERATIONS, sal: paraHex(sal), hash: paraHex(bytes) };
}

async function derivar(senha: string, sal: Uint8Array, iteracoes: number): Promise<Uint8Array> {
  const bytesSenha = new TextEncoder().encode(senha);
  return temCryptoSubtle()
    ? derivarNative(bytesSenha, sal, iteracoes)
    : pbkdf2Sha256(bytesSenha, sal, iteracoes, KEY_BITS / 8);
}

/** Serializa o hash no unico formato guardado. */
export function serializarHash(h: HashedPassword): string {
  return `${PREFIX}$${h.iteracoes}$${h.sal}$${h.hash}`;
}

export function lerHash(armazenado: string): HashedPassword | null {
  if (!armazenado || !armazenado.startsWith(`${PREFIX}$`)) return null;
  const partes = armazenado.split('$');
  if (partes.length !== 4) return null;
  const iteracoes = Number(partes[1]);
  if (!Number.isFinite(iteracoes) || iteracoes <= 0) return null;
  return { algoritmo: PREFIX, iteracoes, sal: partes[2], hash: partes[3] };
}

export function ehSenhaHasheada(armazenado: string | undefined | null): boolean {
  return !!armazenado && !!lerHash(armazenado);
}

/**
 * Compara a senha digitada com o valor guardado.
 *
 * A comparacao percorre os bytes inteiros e acumula as diferencas, em vez de
 * sair no primeiro byte diferente: o tempo gasto deixa de depender de quantos
 * bytes iguais existem no comeco, o que fecha a brecha de temporizacao.
 */
export async function verificarSenha(senha: string, armazenado: string): Promise<VerificacaoSenha> {
  const h = lerHash(armazenado);
  if (!h) return { confere: false, legado: true };

  try {
    const calculado = await derivar(senha, deHex(h.sal), h.iteracoes);
    const esperado = deHex(h.hash);
    if (esperado.length !== calculado.length) return { confere: false };
    let diff = 0;
    for (let i = 0; i < esperado.length; i++) diff |= esperado[i] ^ calculado[i];
    return { confere: diff === 0 };
  } catch {
    return { confere: false };
  }
}
