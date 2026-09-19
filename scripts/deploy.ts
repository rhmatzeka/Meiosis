/**
 * Deploy Meiosis ke chain yang dipilih CHAIN (bawaan: sepolia untuk skrip ini).
 *
 *   bun run deploy:sepolia
 *
 * Aman dijalankan berulang: langkah yang sudah selesai dilewati, dan alamat
 * yang sudah ter-deploy dipakai ulang dari deployments/<chain>.json. Kalau RPC
 * putus di tengah jalan, cukup jalankan lagi.
 *
 * Variabel .env yang dipakai:
 *   DEPLOYER_PRIVATE_KEY   wajib — kunci khusus proyek ini, jangan kunci utama
 *   SEPOLIA_RPC_URL        opsional — tanpa ini dipakai RPC publik
 *   FOUNDER_OWNERS         opsional — alamat dipisah koma, founder dibagi bergiliran.
 *                          Kosong = semua tetap milik deployer.
 *   STUD_FEE_ETH           opsional — stud fee awal tiap founder, bawaan 0
 */
process.env.CHAIN ??= "sepolia";

const { pub, deployerWallet, loadDeployment, CHAIN, EXPLORER, IS_LOCAL } = await import("../server/chain");
const { deployAll } = await import("../server/deploy");
const { formatEther, parseEther, isAddress, getAddress } = await import("viem");
const { existsSync } = await import("node:fs");

const ok = (s: string) => console.log(`  \x1b[32m✓\x1b[0m ${s}`);
const bad = (s: string) => console.log(`  \x1b[31m✗\x1b[0m ${s}`);

console.log(`\n\x1b[1mMEIOSIS\x1b[0m  deploy ke ${CHAIN}\n`);

if (!existsSync("contracts/out/LineageRoyalty.sol/LineageRoyalty.json")) {
  bad("kontrak belum dikompilasi — jalankan `bun run setup` lalu `forge build --root contracts`");
  process.exit(1);
}

let deployer;
try { deployer = deployerWallet(); } catch (e) { bad((e as Error).message); process.exit(1); }
const me = deployer.account.address;

const owners = (process.env.FOUNDER_OWNERS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
for (const a of owners) if (!isAddress(a)) { bad(`FOUNDER_OWNERS berisi alamat tidak sah: ${a}`); process.exit(1); }

/**
 * Diukur dari deploy penuh di Anvil: 7,9 juta gas untuk 36 transaksi.
 * Harga gas Sepolia berubah-ubah, jadi yang diperiksa adalah saldo terhadap
 * harga saat ini ditambah ruang 50%.
 */
const GAS_ESTIMATE = 8_000_000n;
const balance = await pub.getBalance({ address: me });
const gasPrice = await pub.getGasPrice();
const need = (GAS_ESTIMATE * gasPrice * 3n) / 2n;

ok(`deployer ${me}`);
ok(`saldo ${formatEther(balance)} ETH · perkiraan butuh ${formatEther(need)} ETH`);

const resume = loadDeployment();
if (!IS_LOCAL && balance < need && !resume) {
  bad("saldo belum cukup untuk deploy penuh");
  console.log(`
  Isi alamat deployer di atas dari salah satu faucet Sepolia:
    https://cloud.google.com/application/web3/faucet/ethereum/sepolia
    https://www.alchemy.com/faucets/ethereum-sepolia
    https://sepolia-faucet.pk910.de   (menambang di browser, tanpa akun)
  lalu jalankan perintah ini lagi.
`);
  process.exit(1);
}

const dep = await deployAll({
  deployer,
  founderOwners: owners.length ? owners.map((a) => getAddress(a)) : [me],
  studFeeWei: parseEther(process.env.STUD_FEE_ETH ?? "0"),
  resume,
  log: ok,
});

const spent = balance - (await pub.getBalance({ address: me }));
console.log(`
\x1b[1m\x1b[32mSELESAI\x1b[0m  biaya ${formatEther(spent)} ETH · alamat di deployments/${CHAIN}.json
`);
if (EXPLORER) {
  for (const [k, v] of Object.entries(dep)) {
    if (typeof v === "string" && v.startsWith("0x")) console.log(`  ${k.padEnd(9)} ${EXPLORER}/address/${v}`);
  }
  console.log(`
  Berikutnya:
    bun run verify:sepolia          verifikasi kode di Etherscan (butuh ETHERSCAN_API_KEY)
    CHAIN=sepolia bun run ui        buka UI yang tersambung ke Sepolia
`);
}
