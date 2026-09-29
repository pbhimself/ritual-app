export type StringStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

const PREFIX = 'rituals-secure-chunks-v1:';
const MAX_CHUNKS = 256;

function manifest(raw: string | null) {
  if (!raw?.startsWith(PREFIX)) return null;
  const parsed = JSON.parse(raw.slice(PREFIX.length)) as { generation: string; count: number };
  if (!/^[a-z0-9-]+$/.test(parsed.generation) || !Number.isInteger(parsed.count) || parsed.count < 1 || parsed.count > MAX_CHUNKS) {
    throw new Error('Invalid secure session. Please sign in again.');
  }
  return parsed;
}

function chunksFor(value: string) {
  const chunks: string[] = [];
  let chunk = '';
  let bytes = 0;
  for (const character of value) {
    const point = character.codePointAt(0)!;
    const size = point < 0x80 ? 1 : point < 0x800 ? 2 : point < 0x10000 ? 3 : 4;
    if (bytes + size > 1500) {
      chunks.push(chunk);
      chunk = '';
      bytes = 0;
    }
    chunk += character;
    bytes += size;
  }
  chunks.push(chunk);
  if (chunks.length > MAX_CHUNKS) throw new Error('Session exceeds secure storage capacity.');
  return chunks;
}

export function createChunkedStorage(secure: StringStorage, legacy: StringStorage): StringStorage {
  const queues = new Map<string, Promise<unknown>>();
  const serial = <T>(key: string, operation: () => Promise<T>) => {
    const next = (queues.get(key) ?? Promise.resolve()).catch(() => undefined).then(operation);
    queues.set(key, next);
    void next.finally(() => { if (queues.get(key) === next) queues.delete(key); }).catch(() => undefined);
    return next;
  };
  const chunkKey = (key: string, generation: string, index: number) => `${key}.${generation}.${index}`;
  const removeChunks = async (key: string, previous: ReturnType<typeof manifest>) => {
    if (!previous) return;
    for (let index = 0; index < previous.count; index += 1) {
      await secure.removeItem(chunkKey(key, previous.generation, index));
    }
  };
  const write = async (key: string, value: string) => {
    const previous = manifest(await secure.getItem(key));
    const chunks = chunksFor(value);
    const generation = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    try {
      for (let index = 0; index < chunks.length; index += 1) {
        await secure.setItem(chunkKey(key, generation, index), chunks[index]);
      }
      // Commit the pointer last so a failed write cannot replace a valid session.
      await secure.setItem(key, PREFIX + JSON.stringify({ generation, count: chunks.length }));
    } catch (error) {
      await removeChunks(key, { generation, count: chunks.length }).catch(() => undefined);
      throw error;
    }
    await legacy.removeItem(key);
    await removeChunks(key, previous).catch(() => undefined);
  };
  return {
    getItem: (key) => serial(key, async () => {
      const raw = await secure.getItem(key);
      const stored = manifest(raw);
      if (stored) {
        let value = '';
        for (let index = 0; index < stored.count; index += 1) {
          const chunk = await secure.getItem(chunkKey(key, stored.generation, index));
          if (chunk === null) throw new Error('Secure session is incomplete. Please sign in again.');
          value += chunk;
        }
        return value;
      }
      if (raw !== null) return raw;
      const old = await legacy.getItem(key);
      if (old !== null) await write(key, old);
      return old;
    }),
    setItem: (key, value) => serial(key, () => write(key, value)),
    removeItem: (key) => serial(key, async () => {
      const previous = manifest(await secure.getItem(key));
      await secure.removeItem(key);
      await legacy.removeItem(key);
      await removeChunks(key, previous);
    }),
  };
}
