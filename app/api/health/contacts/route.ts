import { NextResponse } from "next/server";

import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result = await getDb().query<{
      contacts: string;
      companies: string;
    }>(
      `
        SELECT
          (
            SELECT COUNT(*)::TEXT
            FROM sales.contacts
          ) AS contacts,

          (
            SELECT COUNT(*)::TEXT
            FROM sales.companies
          ) AS companies
      `,
    );

    return NextResponse.json({
      status: "ok",
      module: "contacts",
      database: result.rows[0],
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error(
      "Contacts health-check failed:",
      error,
    );

    return NextResponse.json(
      {
        status: "error",
        module: "contacts",
      },
      {
        status: 500,
      },
    );
  }
}
