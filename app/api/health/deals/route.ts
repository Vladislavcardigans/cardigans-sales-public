import { NextResponse } from "next/server";

import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result =
      await getDb().query<{
        deals: string;
        active: string;
        won: string;
      }>(
        `
          SELECT
            COUNT(*)::TEXT AS deals,

            COUNT(*) FILTER (
              WHERE stage NOT IN ('Won', 'Lost')
            )::TEXT AS active,

            COUNT(*) FILTER (
              WHERE stage = 'Won'
            )::TEXT AS won

          FROM sales.deals
        `,
      );

    return NextResponse.json({
      status: "ok",
      module: "deals",
      database: result.rows[0],
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error(
      "Deals health-check failed:",
      error,
    );

    return NextResponse.json(
      {
        status: "error",
        module: "deals",
      },
      {
        status: 500,
      },
    );
  }
}
