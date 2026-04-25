import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const DATABASE_URL = process.env.TASKFLOW_DB;
  if (!DATABASE_URL) {
    return NextResponse.json({ success: false, error: "Database not configured" }, { status: 503 });
  }

  try {
    const sql = neon(DATABASE_URL);
    const { searchParams } = new URL(req.url);
    const referenceid = searchParams.get("referenceid");

    if (!referenceid) {
      return NextResponse.json({ success: false, error: "Missing referenceid" }, { status: 400 });
    }

    const accounts = await sql`
      SELECT company_name
      FROM accounts
      WHERE tsm = ${referenceid};
    `;

    return NextResponse.json(
      { success: true, data: accounts || [] },
      { status: 200, headers: { "Cache-Control": "private, max-age=60" } }
    );
  } catch {
    return NextResponse.json({ success: false, error: "Failed to fetch accounts" }, { status: 500 });
  }
}
