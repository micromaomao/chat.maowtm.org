import logging
from hashlib import sha256
from os import environ
from typing import Mapping

import tiktoken
from dotenv import load_dotenv
from httpx import AsyncClient
from starlette.applications import Starlette
from starlette.exceptions import HTTPException
from starlette.middleware import Middleware
from starlette.middleware.base import (BaseHTTPMiddleware,
                                       RequestResponseEndpoint)
from starlette.requests import Request
from starlette.responses import Response, JSONResponse, StreamingResponse
from starlette.routing import Route
import json

load_dotenv()

OPENAI_API_KEY = environ.get("OPENAI_API_KEY")
OPENAI_API_BASE = environ.get("OPENAI_API_BASE")
AUTHORIZATION_KEY = environ.get("AUTHORIZATION_KEY")
UID_HASH_SALT = environ.get("UID_HASH_SALT")
OPENAI_REQ_LOG_FILE = environ.get("OPENAI_REQ_LOG_FILE", "/dev/null")
MAX_TOKENS = 4096

log_file = open(OPENAI_REQ_LOG_FILE, "ta")

openai_client = AsyncClient(base_url=OPENAI_API_BASE, headers={
  "Authorization": f"Bearer {OPENAI_API_KEY}",
}, timeout=20)

def hash_user_id(uid: str) -> str:
  h = sha256((UID_HASH_SALT + uid).encode("utf8"))
  b = h.digest()
  return bytes.hex(b)

class CheckAuthMiddleware(BaseHTTPMiddleware):
  async def dispatch(self, request: Request, call_next: RequestResponseEndpoint):
    header_val = request.headers.get("Authorization", "")
    if header_val != f"Bearer {AUTHORIZATION_KEY}":
      return Response("Unauthorized", 401, {"Content-Type": "text/plain"})
    return await call_next(request)

async def count_tokens_endpoint(request: Request):
  if "model" not in request.query_params or len(request.query_params.getlist("model")) > 1:
    raise HTTPException(400, "Missing string 'model' in query")
  if request.headers.get("Content-Type") != "text/plain":
    raise HTTPException(400, "Invalid Content-Type")
  model = request.query_params.get("model")
  text_bytess = await request.body()
  try:
    text = text_bytess.decode("utf8")
  except UnicodeDecodeError:
    raise HTTPException(400, "Invalid UTF-8")
  try:
    encoding = tiktoken.encoding_for_model(model)
  except KeyError:
    raise HTTPException(400, "Invalid model")
  result = len(encoding.encode(text, disallowed_special=()))
  # print([encoding.decode([tok]) for tok in encoding.encode(text, disallowed_special=())])
  return JSONResponse({"count": result}, 200)

def filter_headers(headers: Mapping[str, str]) -> dict:
  filtered_headers = dict()
  for k, v in headers.items():
    if k.lower() in ["content-type"] or k.lower().startswith("x-"):
      filtered_headers[k] = v
  return filtered_headers

async def openai_proxy(request: Request):
  body = None
  json_body = None
  if "Content-Type" in request.headers:
    body = await request.body()
    if request.headers["Content-Type"] == "application/json":
      body = body.decode("utf8")
      json_body = json.loads(body)
      body = None
      if "user" in json_body:
        if not isinstance(json_body["user"], str):
          raise HTTPException(400, "Invalid .user")
        json_body["user"] = hash_user_id(json_body["user"])
  res_ctx = openai_client.stream(request.method, request.url.path, params=request.query_params, content=body, json=json_body, headers=filter_headers(request.headers))
  res = await res_ctx.__aenter__()
  log_entry = {
    "url": request.url.path,
    "method": request.method,
    "query_params": dict(request.query_params),
    "body": json_body if json_body is not None else body,
    "res": {
      "status": res.status_code,
    }
  }
  json.dump(log_entry, log_file)
  log_file.write("\n")
  log_file.flush()
  exited = False
  try:
    aiter_bytes = res.aiter_bytes()
    async def res_aiter():
      nonlocal exited
      try:
        async for chunk in aiter_bytes:
          yield chunk
        if not exited:
          await res_ctx.__aexit__(None, None, None)
          exited = True
      except Exception as e:
        if not exited:
          await res_ctx.__aexit__(e.__class__, e, e.__traceback__)
          exited = True
        raise e
    return StreamingResponse(res_aiter(), status_code=res.status_code, headers=filter_headers(res.headers))
  except Exception as e:
    if not exited:
      await res_ctx.__aexit__(e.__class__, e, e.__traceback__)
      exited = True
    raise e

app = Starlette(
  routes=[
    Route("/_/count-tokens", count_tokens_endpoint, methods=["POST"]),
    Route("/{path:path}", openai_proxy, methods=["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"])
  ],
  middleware=[
    Middleware(CheckAuthMiddleware)
  ]
)

log = logging.getLogger("uvicorn")
log.setLevel(logging.DEBUG)
