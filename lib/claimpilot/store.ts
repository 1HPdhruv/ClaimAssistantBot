import "server-only";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { getSupabase } from "../supabase";
import { seedState } from "./seed";
import type { State } from "./types";
import { DomainError, investigate } from "./engine";
export const dataDirectory = () =>
  process.env.CLAIMPILOT_DATA_DIR || path.join(process.cwd(), ".claimpilot");
export const remote = () => process.env.CLAIMPILOT_STORAGE === "supabase";
const filename = () => path.join(dataDirectory(), "state.json");
let queue: Promise<unknown> = Promise.resolve();
async function load(): Promise<{ state: State; revision: number }> {
  if (remote()) {
    const { data, error } = await getSupabase().rpc("claimpilot_read");
    if (error)
      throw new DomainError(
        "ClaimPilot database unavailable. Apply the development schema and seed.",
        503,
      );
    return data as { state: State; revision: number };
  }
  try {
    return {
      state: JSON.parse(await readFile(filename(), "utf8")) as State,
      revision: 0,
    };
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    return { state: seedState(), revision: 0 };
  }
}
export async function readState() {
  await queue;
  return (await load()).state;
}
export function mutate<T>(fn: (state: State) => T | Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const { state, revision } = await load();
    const result = await fn(state);
    if (remote()) {
      const { error } = await getSupabase().rpc("claimpilot_write", {
        p_state: {
          ...state,
          evaluations: state.claims.map((c) => ({
            claimId: c.id,
            ...investigate(
              state.expenses.filter((e) => c.expenseIds.includes(e.id)),
              state,
            ),
          })),
        },
        p_revision: revision,
      });
      if (error)
        throw new DomainError(
          "Concurrent update or database failure; refresh and retry.",
          409,
        );
    } else {
      await mkdir(dataDirectory(), { recursive: true });
      const temp = filename() + `.${crypto.randomUUID()}.tmp`;
      await writeFile(temp, JSON.stringify(state), { mode: 0o600 });
      await rename(temp, filename());
    }
    return result;
  });
  queue = run.catch(() => undefined);
  return run;
}
