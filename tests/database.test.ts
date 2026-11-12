import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { seedState } from "../lib/claimpilot/seed";
import { investigate } from "../lib/claimpilot/engine";
test("isolated PostgreSQL schema, seed, RLS, CAS concurrency and exact integer money", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      "create role anon;create role authenticated;create role service_role bypassrls;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);",
    );
    await db.exec(
      await readFile(
        "supabase/migrations/20261112093656_claimpilot_development_schema.sql",
        "utf8",
      ),
    );
    await db.exec(await readFile("seed/ps5_expense_claims.sql", "utf8"));
    const result = await db.query<{
      value: { state: ReturnType<typeof seedState>; revision: number };
    }>("select public.claimpilot_read() as value");
    const value = result.rows[0].value;
    assert.equal(value.state.profiles.length, 8);
    assert.equal(value.state.expenses.length, 14);
    assert.equal(value.revision, 1);
    const findings = await db.query(
      "select * from claimpilot.duplicate_matches",
    );
    assert(findings.rows.length >= 2);
    assert(
      (await db.query("select * from claimpilot.policy_violations")).rows
        .length >= 2,
    );
    assert.equal(
      (
        await db.query<{ amount_minor: number }>(
          "select amount_minor from claimpilot.expenses order by amount_minor desc limit 1",
        )
      ).rows[0].amount_minor,
      850000,
    );
    const state = value.state;
    const payload = {
      ...state,
      evaluations: state.claims.map((c) => ({
        claimId: c.id,
        ...investigate(
          state.expenses.filter((e) => c.expenseIds.includes(e.id)),
          state,
        ),
      })),
    };
    await db.query("select public.claimpilot_write($1::jsonb,$2)", [
      JSON.stringify(payload),
      1,
    ]);
    await assert.rejects(
      db.query("select public.claimpilot_write($1::jsonb,$2)", [
        JSON.stringify(payload),
        1,
      ]),
      /Concurrent/,
    );
    await db.exec("set role anon");
    await assert.rejects(
      db.query("select public.claimpilot_read()"),
      /permission denied/,
    );
    await assert.rejects(
      db.query("select * from claimpilot.expenses"),
      /permission denied/,
    );
    await db.exec("reset role");
    await db.exec("set role service_role");
    assert.equal(
      (await db.query("select public.claimpilot_read()")).rows.length,
      1,
    );
    await db.exec("reset role");
    const rls = await db.query<{ relrowsecurity: boolean }>(
      "select relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='claimpilot' and c.relkind='r'",
    );
    assert(rls.rows.every((r) => r.relrowsecurity));
  } finally {
    await db.close();
  }
});
