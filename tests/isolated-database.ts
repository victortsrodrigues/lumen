export function isolatedDatabaseUrl(connection: string | undefined): string {
  const target = connection ? new URL(connection) : null;
  if (
    !target ||
    !["postgres:", "postgresql:"].includes(target.protocol) ||
    !["localhost", "127.0.0.1"].includes(target.hostname) ||
    target.pathname !== "/lumen_accounts_test" ||
    target.search ||
    target.hash
  ) {
    throw new Error(
      "Use only the isolated local lumen_accounts_test database (no URL options).",
    );
  }
  return connection!;
}
