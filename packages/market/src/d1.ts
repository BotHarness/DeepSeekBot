export type D1Value = string | number | null;

export interface D1PreparedStatement {
  bind(...values: D1Value[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T>(statements: D1PreparedStatement[]): Promise<{ results: T[] }[]>;
}

export class D1RequestBudgetExhausted extends Error {
  constructor() {
    super('D1 request budget exhausted');
  }
}

export function limitD1Requests(db: D1Database, limit: number) {
  let remaining = limit;
  const spend = () => {
    if (remaining === 0) throw new D1RequestBudgetExhausted();
    remaining -= 1;
  };
  const statements = new WeakMap<D1PreparedStatement, D1PreparedStatement>();
  const wrap = (statement: D1PreparedStatement): D1PreparedStatement => {
    const wrapped: D1PreparedStatement = {
      bind: (...values) => wrap(statement.bind(...values)),
      async first<T>() {
        spend();
        return statement.first<T>();
      },
      async all<T>() {
        spend();
        return statement.all<T>();
      },
      async run() {
        spend();
        return statement.run();
      },
    };
    statements.set(wrapped, statement);
    return wrapped;
  };
  const limited: D1Database = {
    prepare: (query) => wrap(db.prepare(query)),
    async batch<T>(batch: D1PreparedStatement[]) {
      spend();
      return db.batch<T>(batch.map((statement) => statements.get(statement) ?? statement));
    },
  };
  return { db: limited, remaining: () => remaining };
}
