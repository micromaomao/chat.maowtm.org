import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest): Promise<NextResponse> {
  return new NextResponse("OK", {
    status: 200, headers: {
      "Content-Type": "text/plain",
      "Set-Cookie": "logged_in=true; HttpOnly; Path=/; SameSite=Strict"
    }
  });
}
