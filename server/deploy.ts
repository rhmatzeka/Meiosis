/**
 * Deploy lengkap: kontrak, modul skill, empat founder, lalu segel generasi nol.
 *
 * Dipakai oleh tombol Deploy di UI (Anvil) dan oleh `bun run deploy:sepolia`.
 *
 * Setiap langkah memeriksa keadaan chain lebih dulu dan melewati yang sudah
 * selesai. Di Sepolia itu bukan kemewahan: RPC publik bisa putus di transaksi
 * ke-20 dari 35, dan menjalankan ulang skrip tidak boleh berarti men-deploy
 * ulang semuanya atau mencetak founder kelima.
 */
import type { Abi, Address } from "viem";
import { pub, artifact, saveDeployment, CHAIN, type Deployment, type deployerWallet } from "./chain";
import { FOUNDERS } from "../packages/shared/src/founders";
import { expand, manifestHash } from "../runtime/genome/expand";
import { catalog } from "../runtime/genome/catalog";

type Wallet = ReturnType<typeof deployerWallet>;

export interface DeployOptions {
  deployer: Wallet;
  /** Pemilik akhir tiap founder. Dibagi ke beberapa alamat supaya royalti bermakna — PLAN.md §12.1b. */
  founderOwners: Address[];
  /** Stud fee awal tiap founder, dalam wei. */
  studFeeWei?: bigint;
  /** Deployment sebelumnya yang belum selesai, untuk dilanjutkan. */
  resume?: Partial<Deployment> | null;
  log?: (s: string) => void;
}

/**
 * Bit izin tool di SkillRegistry. Urutannya bagian dari kontrak data on-chain —
 * menambah tool berarti menambah bit baru di ujung, tidak pernah menyisipkan.
 */
export const TOOL_BITS: Record<string, number> = { filesystem: 1, bash: 2, browser: 4, web: 8 };

const abis = () => ({
  registry: artifact("AgentRegistry").abi,
  genesis: artifact("Genesis").abi,
  hatchery: artifact("Hatchery").abi,
  royalty: artifact("LineageRoyalty").abi,
  skills: artifact("SkillRegistry").abi,
});

export async function deployAll(o: DeployOptions): Promise<Deployment> {
  const log = o.log ?? (() => {});
  const d = o.deployer;
  const me = d.account.address;
  const A = abis();

  const read = (addr: Address, abi: Abi, fn: string, args: unknown[] = []) =>
    pub.readContract({ address: addr, abi, functionName: fn, args } as never);
  const send = async (addr: Address, abi: Abi, fn: string, args: unknown[] = []) => {
    const hash = await d.writeContract({ address: addr, abi, functionName: fn, args } as never);
    const r = await pub.waitForTransactionReceipt({ hash });
    if (r.status !== "success") throw new Error(`${fn} gagal di tx ${hash}`);
    return r;
  };
  const hasCode = async (a?: Address) => {
    if (!a) return false;
    const c = await pub.getCode({ address: a });
    return !!c && c !== "0x";
  };

  const chainId = await pub.getChainId();
  const prev = o.resume && o.resume.chainId === chainId ? o.resume : {};
  const out: Partial<Deployment> = { chainId };

  const put = async (key: keyof Deployment, name: string, args: unknown[] = []) => {
    const old = prev[key] as Address | undefined;
    if (await hasCode(old)) { log(`${name} sudah ada di ${old}`); return old!; }
    const a = artifact(name);
    const hash = await d.deployContract({ abi: a.abi, bytecode: a.bytecode.object, args } as never);
    const addr = (await pub.waitForTransactionReceipt({ hash })).contractAddress!;
    log(`${name} → ${addr}`);
    return addr;
  };

  // ------------------------------------------------------------ kontrak
  out.registry = await put("registry", "AgentRegistry");
  out.genesis = await put("genesis", "Genesis", [out.registry]);
  out.royalty = await put("royalty", "LineageRoyalty", [out.registry]);
  out.hatchery = await put("hatchery", "Hatchery", [out.registry, out.royalty]);
  out.skills = await put("skills", "SkillRegistry");
  out.block = prev.block ?? Number(await pub.getBlockNumber());

  // Simpan sekarang juga: kalau langkah berikut putus, alamat ini dipakai ulang.
  saveDeployment(out as Deployment);
  const dep = out as Deployment;

  for (const m of [dep.genesis, dep.hatchery]) {
    if (!(await read(dep.registry, A.registry, "isMinter", [m]))) {
      await send(dep.registry, A.registry, "setMinter", [m, true]);
      log(`minter diizinkan: ${m}`);
    }
  }

  // ------------------------------------------------------------ modul skill
  // Mendaftarkan setiap modul yang dikenal runtime, supaya arti sebuah trait
  // bisa dibaca siapa pun langsung dari chain — PLAN.md §19.1 registry:seed.
  for (const mod of [...catalog().values()].sort((a, b) => a.locus - b.locus || a.traitId - b.traitId)) {
    if (await read(dep.skills, A.skills, "isRegistered", [mod.locus, mod.traitId])) continue;
    let mask = 0;
    for (const t of mod.mcpTools) {
      if (!(t in TOOL_BITS)) throw new Error(`tool ${t} di modul ${mod.name} belum punya bit`);
      mask |= TOOL_BITS[t];
    }
    const [maj, min, pat] = mod.version.split(".").map(Number);
    const cid = ("0x" + mod.contentHash).padEnd(66, "0") as `0x${string}`;
    await send(dep.skills, A.skills, "register",
      [mod.locus, mod.traitId, mod.name, cid, mask, maj * 100 + min * 10 + pat]);
    log(`modul ${mod.name} terdaftar`);
  }

  // ------------------------------------------------------------ generasi nol
  // Semua founder dicetak ke deployer dulu. Dengan begitu satu kunci cukup untuk
  // memasangnya sebagai pejantan dan mencatat manifest-nya; baru sesudah itu
  // dipindahkan ke pemilik akhirnya.
  const minted = Number(await read(dep.genesis, A.genesis, "founderCount"));
  const sealed = (await read(dep.genesis, A.genesis, "sealed_")) as boolean;
  if (!sealed) {
    for (let i = minted; i < FOUNDERS.length; i++) {
      await send(dep.genesis, A.genesis, "mintFounder", [me, FOUNDERS[i].genome, FOUNDERS[i].name]);
      log(`founder #${i + 1} ${FOUNDERS[i].name} dicetak`);
    }
  }

  for (let id = 1; id <= FOUNDERS.length; id++) {
    const owner = ((await read(dep.registry, A.registry, "ownerOf", [id])) as string).toLowerCase();
    if (owner !== me.toLowerCase()) continue; // sudah dipindahkan pada percobaan sebelumnya

    if (!(await read(dep.hatchery, A.hatchery, "studListed", [id]))) {
      // Tanpa listing, mengawinkan agent milik orang lain revert dengan
      // NotListedForStud. Pemilik baru bisa mengubah harganya kapan saja.
      await send(dep.hatchery, A.hatchery, "listForStud", [id, o.studFeeWei ?? 0n]);
      log(`founder #${id} dipasang sebagai pejantan`);
    }

    /**
     * manifestHash dicatat saat itu juga. Hash ini turunan murni dari genome
     * yang sudah ada di chain; membiarkannya kosong berarti klaim terpenting
     * proyek ini tidak terlihat di menit pertama.
     */
    const a = (await read(dep.registry, A.registry, "agentOf", [id])) as { genome: bigint; manifestHash: bigint };
    if (a.manifestHash === 0n) {
      await send(dep.registry, A.registry, "setManifestHash", [id, manifestHash(expand(a.genome, 0n))]);
      log(`manifest founder #${id} dicatat`);
    }
  }

  if (!sealed) {
    await send(dep.genesis, A.genesis, "seal");
    log("generasi nol disegel");
  }

  for (let id = 1; id <= FOUNDERS.length; id++) {
    const target = o.founderOwners[(id - 1) % o.founderOwners.length];
    const owner = ((await read(dep.registry, A.registry, "ownerOf", [id])) as string).toLowerCase();
    if (!target || owner !== me.toLowerCase() || target.toLowerCase() === owner) continue;
    await send(dep.registry, A.registry, "transferFrom", [me, target, id]);
    log(`founder #${id} dipindahkan ke ${target}`);
  }

  saveDeployment(dep);
  log(`selesai di ${CHAIN} (chainId ${chainId})`);
  return dep;
}
