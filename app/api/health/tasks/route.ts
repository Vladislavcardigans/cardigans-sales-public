import { NextResponse } from "next/server";

import {
  getTaskMetrics,
} from "@/lib/repositories/task.repository";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const metrics =
      await getTaskMetrics();

    return NextResponse.json({
      status: "ok",
      module: "tasks",
      metrics,
      timestamp:
        new Date().toISOString(),
    });
  } catch (error) {
    console.error(
      "Tasks health-check failed:",
      error,
    );

    return NextResponse.json(
      {
        status: "error",
        module: "tasks",
      },
      {
        status: 500,
      },
    );
  }
}
