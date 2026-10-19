/** Minimal in-memory R2Bucket for tests. */
export function createTestR2() {
  const objects = new Map<string, { body: Uint8Array; contentType?: string }>();
  const bucket = {
    objects,
    async put(key: string, value: ArrayBuffer | Uint8Array, options?: { httpMetadata?: { contentType?: string } }) {
      objects.set(key, { body: new Uint8Array(value as ArrayBuffer), contentType: options?.httpMetadata?.contentType });
      return { key };
    },
    async get(key: string) {
      const object = objects.get(key);
      if (!object) return null;
      return {
        body: new Blob([object.body as BlobPart]).stream(),
        httpMetadata: { contentType: object.contentType },
        httpEtag: `"${key}"`,
        writeHttpMetadata(headers: Headers) {
          if (object.contentType) headers.set("content-type", object.contentType);
        },
      };
    },
    async delete(keys: string | string[]) {
      for (const key of Array.isArray(keys) ? keys : [keys]) objects.delete(key);
    },
  };
  return bucket as typeof bucket & R2Bucket;
}
