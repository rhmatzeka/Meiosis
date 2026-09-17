/**
 * materialize() — manifest menjadi agent yang benar-benar bisa bekerja.
 *
 * Di sinilah tier diterjemahkan ke model konkret. Pembagian ini disengaja:
 * expand() menghasilkan manifest yang di-hash dan tercatat on-chain, sedangkan
 * pemilihan penyedia dan model hidup di luar hash — sehingga berpindah dari
 * model gratis ke berbayar tidak pernah membatalkan hash yang sudah tercatat.
 * Lihat PLAN.md §8.1.
 */
import { expand, manifestHash, systemPrompt, type Manifest } from "./genome/expand";
import { getProvider, type Provider } from "./providers";

export interface RunReceipt {
  agentId: number;
  /**
   * Tool yang benar-benar tersedia saat run ini — belum tentu sama dengan yang
   * dideklarasikan genome. Selisih itu wajib terlihat di kuitansi, bukan
   * disembunyikan.
   */
  toolsDeclared: string[];
  toolsAvailable: string[];
  manifestHash: string;
  provider: string;
  /** Model yang sungguh dipakai. Ini masuk kuitansi run, bukan genome. */
  model: string;
  task: string;
  output: string;
  promptTokens: number;
  completionTokens: number;
  durationMs: number;
  mocked: boolean;
}

export interface Agent {
  id: number;
  genome: bigint;
  manifest: Manifest;
  manifestHash: bigint;
  systemPrompt: string;
  run(task: string): Promise<RunReceipt>;
}

export interface MaterializeOptions {
  id?: number;
  provider?: Provider;
  env?: Record<string, string | undefined>;
  /** Tool yang sungguh disediakan runner. Kosong sampai loop tool ada. */
  tools?: string[];
}

export function materialize(genome: bigint, birthSeed: bigint, opts: MaterializeOptions = {}): Agent {
  const env = opts.env ?? process.env;
  const manifest = expand(genome, birthSeed);
  const hash = manifestHash(manifest);
  const id = opts.id ?? 0;
  const mocked = env.MOCK_LLM === "1";

  /**
   * Genome boleh memberi hak akses tool, tapi sampai loop tool benar-benar
   * diimplementasikan, run ini tidak menyediakan satu pun.
   *
   * Menyatakannya terang-terangan bukan formalitas: tanpa baris ini, model yang
   * dilatih untuk bekerja agentik akan mengarang pemanggilan tool dan sama
   * sekali tidak menghasilkan jawaban. Itu persis yang terjadi pada uji
   * diskriminasi pertama — ketiga agent gagal bukan karena kemampuannya.
   */
  const toolsDeclared = manifest.mcpTools;
  const toolsAvailable: string[] = opts.tools ?? [];
  const missing = toolsDeclared.filter((t) => !toolsAvailable.includes(t));

  const sys = missing.length
    ? systemPrompt(manifest) +
      `\n\n---\n\nPADA RUN INI KAMU TIDAK PUNYA AKSES TOOL APA PUN.` +
      ` Tidak ada filesystem, tidak ada terminal, tidak ada pencarian.` +
      ` Jangan memanggil tool dan jangan berpura-pura menjalankannya.` +
      ` Hasilkan seluruh jawabanmu langsung sebagai teks balasan.`
    : systemPrompt(manifest);

  return {
    id, genome, manifest, manifestHash: hash, systemPrompt: sys,

    async run(task: string): Promise<RunReceipt> {
      const started = Date.now();

      if (mocked) {
        // Cukup untuk menguji seluruh pipa tanpa menyentuh jaringan maupun kuota.
        return {
          agentId: id, toolsDeclared, toolsAvailable,
          manifestHash: "0x" + hash.toString(16).padStart(16, "0"),
          provider: "mock", model: "mock",
          task,
          output: `[MOCK] agent ${id}, ${manifest.traits.filter((t) => t.module).length} modul aktif`,
          promptTokens: 0, completionTokens: 0,
          durationMs: Date.now() - started, mocked: true,
        };
      }

      const provider = opts.provider ?? getProvider(env);
      const res = await provider.chat(manifest.modelTier, {
        system: sys,
        messages: [{ role: "user", content: task }],
        temperature: manifest.params.temperature,
        maxTokens: manifest.params.maxTokens,
      });

      return {
        agentId: id, toolsDeclared, toolsAvailable,
        manifestHash: "0x" + hash.toString(16).padStart(16, "0"),
        provider: provider.name,
        model: res.model,
        task,
        output: res.text,
        promptTokens: res.promptTokens,
        completionTokens: res.completionTokens,
        durationMs: Date.now() - started,
        mocked: false,
      };
    },
  };
}
