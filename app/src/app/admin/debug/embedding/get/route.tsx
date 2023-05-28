import { NextRequest, NextResponse } from "next/server";

import { OpenAIError, getEmbedding } from "@/lib/chat/ai"
import { checkAdminAuthentication, makeUnauthenticatedResponse } from "@/lib/auth";

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!checkAdminAuthentication(request)) {
    return makeUnauthenticatedResponse(request);
  }
  let model = request.nextUrl.searchParams.get("model");
  let input1 = request.nextUrl.searchParams.get("input1");
  let input2 = request.nextUrl.searchParams.get("input2");
  if (!model || !input1) {
    return new NextResponse("Invalid request", { status: 400, headers: { "Content-Type": "text/plain" } });
  }
  let total_tokens = 0;
  try {
    let res1 = await getEmbedding({ model }, input1);
    let embedding1 = res1.result;
    total_tokens += res1.token_count;
    let embedding2 = null;
    if (input2) {
      let res2 = await getEmbedding({ model }, input2);
      embedding2 = res2.result;
      total_tokens += res2.token_count;
    }
    return NextResponse.json({
      embedding1, embedding2, total_tokens
    })
  } catch (e) {
    if (e instanceof OpenAIError) {
      return new NextResponse(e.toString(), { status: 500, headers: { "Content-Type": "text/plain" }});
    } else {
      throw e;
    }
  }
}
