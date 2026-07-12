import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadPersona } from "./lisa-chat.js";

const directory = await mkdtemp(join(tmpdir(), "lisa-persona-"));
const personaPath = join(directory, "lisa.md");
await writeFile(personaPath, "Canonical Lisa\n", "utf8");

const quiet = () => {};

assert.equal(await loadPersona({ override: "", path: personaPath, log: quiet }), "Canonical Lisa");

assert.equal(await loadPersona({ override: "Explicit persona", path: personaPath, log: quiet }), "Explicit persona");

await assert.rejects(
  loadPersona({ override: "", path: join(directory, "missing.md"), log: quiet }),
  /Could not load canonical repo persona/
);

console.log("persona precedence: PASS");
