import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result = await getDb().query<{
      database: string;
      username: string;
      companies: string;
    }>(`
      SELECT
        current_database() AS database,
        current_user AS username,
        COUNT(*)::TEXT AS companies
      FROM sales.companies
    `);

    return NextResponse.json({
      status: "ok",
      database: result.rows[0],
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Health check failed:", error);

    return NextResponse.json(
      {
        status: "error",
        message: "Database connection failed",
      },
      { status: 500 },
    );
  }
}
