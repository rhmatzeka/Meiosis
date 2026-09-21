# Meiosis

> *Inherited intelligence, verifiable on-chain.*

A protocol for **breeding AI agents on Ethereum**. Two agents "mate", their child inherits abilities from both parents through meiosis done on-chain, and the child is then measured to see whether it actually beats its parents.

**Start here: [QUICKSTART.md](./QUICKSTART.md)**, which goes from cloning the repo to a working agent.

Full plan: [PLAN.md](./PLAN.md) · How to test: [TESTING.md](./TESTING.md) · Adding agents: [ADDING-AGENTS.md](./ADDING-AGENTS.md) · Using it from Claude Code: [MCP.md](./MCP.md) · Sepolia and hosting: [DEPLOY.md](./DEPLOY.md)

## What does a "child" look like?

An agent is an **NFT that holds a 256-bit genome**. That genome is turned, deterministically and byte for byte, into a **manifest** (model tier, tools, parameters) and a **system prompt** built from the skill modules it inherited.

You can use an agent in three ways:

1. **On the Meiosis site**: in the Run tab, the agent writes code, builds it in a sandbox, fixes its own mistakes, and gets a score.
2. **From Claude Code over MCP**: see [MCP.md](./MCP.md).
3. **As a `.md` file you take home**: the Export button downloads a ready-to-use Claude Code subagent. Put it in any project's `.claude/agents/` folder. The file carries the genome and `manifestHash`, so `bun run verify-agent <file>` proves it hasn't been changed from what is recorded on-chain.

## Status

| Phase | Status |
|---|---|
| P0: GeneLib, fuzz tests, genetics simulator | ✅ done |
| P1: core contracts, births working on Anvil | ✅ done |
| P1b: deploy to Sepolia | script ready (`bun run deploy:sepolia`), waiting for faucet ETH |
| P2: runtime `expand()` + 12 skill modules | ✅ done |
| P3: sandbox, scorer, judge, arena | partly: the pipeline runs, but "hybrid vigor" (children beating parents) isn't proven yet |
| P4: web UI | ✅ roster, breeding, family tree, arena, **wallet connect**, owner actions, royalties, export |
| Ancestor royalties | ✅ `LineageRoyalty.sol`: rental and breeding fees flow up to 4 generations |
| P4: orchestrator and indexer | not started |

## Run it

```bash
bun run start            # one command: set everything up, then open localhost:5173
bun run stop             # stop it

bun run setup            # (manual) bun install + forge-std + OpenZeppelin + compile
bun run gene-sim         # simulate 10,000 G0 x G1 breedings
bun run test:contracts   # 38 tests, including TS <-> Solidity cross-checks and royalties

bun test                 # 39 runtime tests, including 20 golden files for expand()

bun run anvil            # in a separate terminal
bun run ui               # http://localhost:5173: deploy, breed, run, family tree, arena
bun run demo:local       # deploy -> mint -> breed -> hatch -> build the agent
bun run demo:runtime     # three agents, same task, real models

bun run deploy:sepolia   # deploy to Sepolia (see DEPLOY.md)
bun run ui:sepolia       # UI connected to Sepolia; visitors use their own wallet
bun run verify-agent f.md  # prove an exported file matches the chain
```

**Who signs transactions?** On a local chain with no wallet connected, the server signs with an Anvil demo account. With a wallet connected, and always on Sepolia, users sign for themselves: the server only builds the calldata at `/api/tx` and never holds keys.

`demo:local` runs the whole birth flow, reads the child's genome from the chain, and recomputes it from scratch in TypeScript. If both match, the child is proven to be a real offspring of its two parents, without having to trust anyone.

## Contracts

| Contract | What it does |
|---|---|
| `GeneLib.sol` | `meiosis`, `express`, `relatedness`, all `pure` |
| `AgentRegistry.sol` | ERC-721; genome and family tree in 2 storage slots; owner-chosen names |
| `Genesis.sol` | Mints generation zero; `seal()` locks it forever |
| `Hatchery.sol` | Commit–reveal breeding, cooldowns, stud fees via royalties, `reroll()` |
| `LineageRoyalty.sol` | Pay an agent: 5% goes to its parents, 2.5% to its grandparents, and so on for 4 generations (pull payments) |
| `SkillRegistry.sol` | Trait → skill module, append-only; filled automatically on deploy |

## Runtime

| File | What it does |
|---|---|
| `runtime/genome/expand.ts` | Genome → manifest. **Must be deterministic.** |
| `runtime/genome/catalog.ts` | Loads the 12 skill modules in a fixed order, independent of the filesystem |
| `runtime/materialize.ts` | Manifest → a runnable agent |
| `runtime/agent-loop.ts` | Tool loop: write → check → fix → repeat |
| `runtime/tools/` | Agent tools; which ones an agent may use is decided by its genome |
| `mcp/server.ts` | MCP server, so Meiosis agents can be used from Claude Code |
| `runtime/export.ts` | Agent → Claude Code subagent `.md`, plus the reader used to verify it |
| `runtime/providers/` | Groq and OpenRouter, with requests-per-minute and tokens-per-minute limits and 429 retries |

The manifest stores a model **tier**, not a model name. Turning a tier into a concrete model happens in `materialize()`, outside the hashed part, so switching providers never invalidates a `manifestHash` that's already on-chain.

Changing any prompt text turns the golden tests red. That's on purpose: an `expand()` that quietly drifts is the most expensive bug this project could have.

`gene-sim` also regenerates `contracts/test/Vectors.sol`. Run it first whenever the genetic model changes, then run the contract tests; if the two disagree, the tests fail.

## Genome layout

```
genome : uint256 = 16 loci x 16 bits
locus  : [ allele X 8 bits | allele Y 8 bits ]
allele : [ dominance 2 bits | traitId 6 bits ]
```

There are two sources of truth, and they must always match: `packages/shared/src/genome.ts` and `contracts/src/GeneLib.sol`.

## License

Released under the [MIT License](LICENSE).
