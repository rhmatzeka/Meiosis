/**
 * Mode uji: server boleh menandatangani dengan akun Anvil dan menjalankan LLM
 * tiruan. Hanya untuk `bun run e2e`; pengguna tidak pernah melihatnya.
 */
export const testMode = (env: Record<string, string | undefined>, isLocal: boolean) => isLocal && env.TEST_ACCOUNTS === "1";