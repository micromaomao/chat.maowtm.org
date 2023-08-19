import { AdminService, ApiError, ReplyAnalysis } from "app/openapi";
import { useEffect, useState } from "react";

const replyAnalysisCache = new Map<string, ReplyAnalysis>();

export function fetchReplyAnalysis(message_id: string, abortSignal: AbortSignal): Promise<ReplyAnalysis> {
  if (replyAnalysisCache.has(message_id)) {
    return Promise.resolve(replyAnalysisCache.get(message_id)!);
  }
  return new Promise((resolve, reject) => {
    let p = AdminService.getMessagesReplyAnalysis(message_id);
    abortSignal.addEventListener("abort", () => p.cancel());
    p.then(res => {
      if (!abortSignal.aborted) {
        resolve(res);
        replyAnalysisCache.set(message_id, res);
      }
    }).catch(err => {
      if (abortSignal.aborted) return;
      if (err instanceof ApiError) {
        reject(new Error(err.body));
      } else {
        reject(err);
      }
    });
  });
}

export function useReplyAnalysis(message_id: string): { loading, error, data, retry } {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [data, setData] = useState<ReplyAnalysis | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  useEffect(() => {
    let abortController = new AbortController();
    setLoading(true);
    fetchReplyAnalysis(message_id, abortController.signal).then(res => {
      if (abortController.signal.aborted) return;
      setLoading(false);
      setError(null);
      setData(res);
    }, err => {
      if (abortController.signal.aborted) return;
      setLoading(false);
      setError(err);
    });
    return () => abortController.abort();
  }, [message_id, retryCount]);
  return {
    loading, error, data, retry: () => {
      setRetryCount(retryCount + 1);
      setError(null);
    }
  };
}

export function clearReplyAnalysisCache() {
  replyAnalysisCache.clear();
}
