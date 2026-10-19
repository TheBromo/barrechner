export type Result<T extends object = object> = ({ ok: true } & T) | { ok: false; error: string };
