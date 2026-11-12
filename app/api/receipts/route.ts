import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { getActor, sameOrigin } from "@/lib/claimpilot/session";
import { dataDirectory, mutate, remote } from "@/lib/claimpilot/store";
import { privateReceiptBucket } from "@/lib/claimpilot/storage";
import { apiError } from "@/lib/claimpilot/http";
import { DomainError } from "@/lib/claimpilot/engine";
import { detectMime, extractDocument } from "@/lib/claimpilot/receipts";
import { audit } from "@/lib/claimpilot/service";
import type { Receipt } from "@/lib/claimpilot/types";
export const maxDuration = 60;
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const a = await getActor();
    if (Number(req.headers.get("content-length")) > 11 * 1024 * 1024)
      throw new DomainError("Maximum upload size is 10 MB", 413);
    const file = (await req.formData()).get("file");
    if (!(file instanceof File) || !file.size || file.size > 10 * 1024 * 1024)
      throw new DomainError("Choose a receipt of up to 10 MB");
    const bytes = Buffer.from(await file.arrayBuffer());
    const mime = detectMime(bytes);
    if (!mime || mime !== file.type)
      throw new DomainError("Receipt must be a valid JPG, PNG, WebP or PDF");
    const id = crypto.randomUUID();
    const storagePath = `${a.id}/${id}`;
    if (remote()) {
      const { error } = await (
        await privateReceiptBucket()
      ).upload(storagePath, bytes, { contentType: mime, upsert: false });
      if (error) throw new DomainError("Private receipt upload failed", 503);
    } else {
      await mkdir(path.join(dataDirectory(), a.id), { recursive: true });
      await writeFile(path.join(dataDirectory(), storagePath), bytes, {
        mode: 0o600,
      });
    }
    const receipt: Receipt = {
      id,
      employeeId: a.id,
      name: file.name.slice(0, 180),
      mime,
      hash: createHash("sha256").update(bytes).digest("hex"),
      path: storagePath,
      extractionStatus: "unavailable",
      extraction: null,
      error: "Extraction pending; manual entry available.",
      extractedAt: null,
      createdAt: new Date().toISOString(),
    };
    await mutate((s) => {
      s.receipts.push(receipt);
      audit(s, a, id, "RECEIPT_UPLOADED");
    });
    try {
      const extraction = await extractDocument(bytes, mime);
      receipt.extraction = extraction;
      receipt.extractionStatus = "extracted";
      receipt.extractedAt = new Date().toISOString();
      receipt.error = "";
    } catch {
      receipt.extractionStatus = process.env.GEMINI_API_KEY
        ? "failed"
        : "unavailable";
      receipt.error =
        "AI extraction unavailable or invalid. Document preserved. Review and enter fields manually.";
    }
    await mutate((s) => {
      Object.assign(
        s.receipts.find((r) => r.id === id)!,
        receipt,
      );
    });
    const { path: _, hash: __, ...result } = receipt;
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    return apiError(e);
  }
}
