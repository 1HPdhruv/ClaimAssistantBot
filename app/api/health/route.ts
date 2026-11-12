import { NextResponse } from "next/server";
export async function GET() {
  return NextResponse.json({
    product: "ClaimPilot",
    mode:
      process.env.CLAIMPILOT_STORAGE === "supabase"
        ? "Supabase demo"
        : "Local demo",
    aiConfigured: !!process.env.GEMINI_API_KEY,
  });
}
