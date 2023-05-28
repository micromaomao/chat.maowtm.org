import { NextRequest, NextResponse } from "next/server";

import { OpenAIError, getEmbedding, getSimilarity } from "@/lib/chat/ai"
import { checkAdminAuthentication, makeUnauthenticatedResponse } from "@/lib/auth";
import { dot, norm } from "@/lib/vectools";

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!checkAdminAuthentication(request)) {
    return makeUnauthenticatedResponse(request);
  }
  let model = request.nextUrl.searchParams.get("model");
  let inputs = request.nextUrl.searchParams.getAll("input");
  if (typeof inputs === "string") {
    inputs = [inputs];
  } else if (!inputs) {
    inputs = [];
  }
  if (!model || inputs.length == 0 || !inputs.every(x => x)) {
    return new NextResponse("Invalid request", { status: 400, headers: { "Content-Type": "text/plain" } });
  }
  if (inputs.length > 10 || inputs.some(x => x.length > 10000)) {
    return new NextResponse("Too many inputs or input too long", { status: 400, headers: { "Content-Type": "text/plain" } });
  }
  let total_tokens = 0;
  let abortController = new AbortController();
  try {
    let embeddings = await Promise.all(inputs.map(async input => {
      let res = await getEmbedding({ model }, input, abortController.signal);
      total_tokens += res.token_count;
      return res.result;
    }));
    let norms = embeddings.map(e => norm(e));
    let similarities = [1];
    for (let i = 1; i < embeddings.length; i += 1) {
      similarities.push(dot(embeddings[0], embeddings[i]) / (norms[0] * norms[i]));
    }
    return NextResponse.json({
      embeddings, similarities, total_tokens,
    })
  } catch (e) {
    abortController.abort();
    if (e instanceof OpenAIError) {
      return new NextResponse(e.toString(), { status: 500, headers: { "Content-Type": "text/plain" }});
    } else {
      throw e;
    }
  }
}
