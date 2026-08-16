import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const checks = {
    timestamp: new Date().toISOString(),
    environment: {
      nodeEnv: process.env.NODE_ENV,
      databaseUrlSet: !!process.env.DATABASE_URL,
      databaseHostname: process.env.DATABASE_URL?.split("@")?.[1]?.split(":")?.[0] || "unknown",
      vercelUrlSet: !!process.env.VERCEL_URL,
    },
  };

  try {
    // Try to import and test database connection
    const db = await import("@/lib/db").then((m) => m.default);

    // Try a simple query
    try {
      const result = await db.query("SELECT NOW() as current_time");
      return NextResponse.json(
        {
          status: "healthy",
          ...checks,
          database: {
            connected: true,
            currentTime: result.rows[0]?.current_time,
          },
        },
        { status: 200 }
      );
    } catch (dbError: any) {
      return NextResponse.json(
        {
          status: "unhealthy",
          ...checks,
          database: {
            connected: false,
            error: {
              code: dbError?.code,
              message: dbError?.message,
              hostname: dbError?.hostname,
              errno: dbError?.errno,
            },
          },
        },
        { status: 503 }
      );
    }
  } catch (error: any) {
    return NextResponse.json(
      {
        status: "error",
        ...checks,
        error: {
          message: error?.message,
          code: error?.code,
        },
      },
      { status: 500 }
    );
  }
}
