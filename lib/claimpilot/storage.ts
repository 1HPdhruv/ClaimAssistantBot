import "server-only";
import { getSupabase } from "../supabase";
import { DomainError } from "./engine";
export async function privateReceiptBucket() {
  const client = getSupabase();
  const { data, error } = await client.storage.getBucket("receipts");
  if (error || !data || data.public)
    throw new DomainError(
      "A private receipts bucket is required. Check development Supabase Storage setup.",
      503,
    );
  return client.storage.from("receipts");
}
