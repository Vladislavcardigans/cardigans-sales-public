import {
  NextResponse,
} from "next/server";

import {
  getDashboardMetrics,
} from "@/lib/repositories/dashboard.repository";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const metrics =
      await getDashboardMetrics();

    return NextResponse.json({
      status: "ok",
      module: "dashboard",
      metrics,
      timestamp:
        new Date().toISOString(),
    });
  } catch (error) {
    console.error(
      "Dashboard health-check failed:",
      error,
    );

    return NextResponse.json(
      {
        status: "error",
        module: "dashboard",
      },
      {
        status: 500,
      },
    );
  }
}
