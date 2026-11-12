import { seededEvidence } from "@/lib/claimpilot/evidence";
import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getActor } from "@/lib/claimpilot/session";
import { readState, dataDirectory, remote } from "@/lib/claimpilot/store";
import { DomainError, requireRead } from "@/lib/claimpilot/engine";
import { privateReceiptBucket } from "@/lib/claimpilot/storage";
import { apiError } from "@/lib/claimpilot/http";
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const a = await getActor();
    const { id } = await params;
    const s = await readState();
    const r = s.receipts.find((r) => r.id === id);
    if (!r) throw new DomainError("Receipt not found", 404);
    requireRead(a, r.employeeId, s.profiles);
    if (r.seeded) {
      const e = s.expenses.find((e) => e.receiptId === r.id);
      return new Response(r.seededContent ?? seededEvidence(e!), {
        headers: {
          "Content-Type": "text/plain",
          "Cache-Control": "private, no-store",
        },
      });
    }
    if (remote()) {
      const { data, error } = await (
        await privateReceiptBucket()
      ).createSignedUrl(r.path, 60);
      if (error) throw new DomainError("Document could not be retrieved", 503);
      return NextResponse.redirect(data.signedUrl);
    }
    return new Response(
      new Uint8Array(await readFile(path.join(dataDirectory(), r.path))),
      {
        headers: {
          "Content-Type": r.mime,
          "Content-Disposition": `inline; filename="receipt-${id}"`,
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      },
    );
  } catch (e) {
    return apiError(e);
  }
}
