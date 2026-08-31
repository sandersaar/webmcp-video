const REFERENCE_PATTERN = /^wmv_[A-Za-z0-9_-]{22}$/;

type ReferenceRecord = Readonly<{
  fixtureKey: string;
  pageMapping: string;
  rightsGeneration: number;
  expiresAtMilliseconds: number;
}>;

function randomReference(randomBytes: (target: Uint8Array) => Uint8Array): string {
  const bytes = randomBytes(new Uint8Array(16));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const encoded = btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  return `wmv_${encoded}`;
}

export class ReferenceDeniedError extends Error {
  readonly code = "reference_denied";
}

export class ReferenceVault {
  private readonly records = new Map<string, ReferenceRecord>();

  constructor(
    private readonly pageMapping: string,
    private readonly now: () => number = () => Date.now(),
    private readonly randomBytes: (target: Uint8Array) => Uint8Array = (target) => crypto.getRandomValues(target),
    private readonly ttlMilliseconds = 5 * 60 * 1000,
  ) {
    if (ttlMilliseconds <= 0) throw new Error("invalid_reference_ttl");
  }

  issue(fixtureKey: string, rightsGeneration: number): Readonly<{ momentRef: string; expiresAt: string }> {
    let momentRef = randomReference(this.randomBytes);
    while (this.records.has(momentRef)) momentRef = randomReference(this.randomBytes);
    const expiresAtMilliseconds = this.now() + this.ttlMilliseconds;
    this.records.set(momentRef, {
      fixtureKey,
      pageMapping: this.pageMapping,
      rightsGeneration,
      expiresAtMilliseconds,
    });
    return { momentRef, expiresAt: new Date(expiresAtMilliseconds).toISOString() };
  }

  resolve(momentRef: string, pageMapping: string): ReferenceRecord & Readonly<{ expiresAt: string }> {
    if (!REFERENCE_PATTERN.test(momentRef)) throw new ReferenceDeniedError("reference_denied");
    const record = this.records.get(momentRef);
    if (!record || record.pageMapping !== pageMapping || this.now() >= record.expiresAtMilliseconds) {
      this.records.delete(momentRef);
      throw new ReferenceDeniedError("reference_denied");
    }
    return { ...record, expiresAt: new Date(record.expiresAtMilliseconds).toISOString() };
  }
}

export function isOpaqueMomentReference(value: string): boolean {
  return REFERENCE_PATTERN.test(value);
}
