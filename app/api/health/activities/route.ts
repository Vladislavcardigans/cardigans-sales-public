import { NextResponse } from "next/server";

import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result = await getDb().query<{
      activities: string;
      planned: string;
      completed: string;
      overdue: string;
    }>(
      `
        SELECT
          COUNT(*)::TEXT AS activities,

          COUNT(*) FILTER (
            WHERE status = 'Planned'
          )::TEXT AS planned,

          COUNT(*) FILTER (
            WHERE status = 'Completed'
          )::TEXT AS completed,

          COUNT(*) FILTER (
            WHERE status = 'Planned'
              AND scheduled_at < NOW()
          )::TEXT AS overdue

        FROM sales.activities
      `,
    );

    return NextResponse.json({
      status: "ok",
      module: "activities",
      database: result.rows[0],
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error(
      "Activities health-check failed:",
      error,
    );

    return NextResponse.json(
      {
        status: "error",
        module: "activities",
      },
      {
        status: 500,
      },
    );
  }
}
