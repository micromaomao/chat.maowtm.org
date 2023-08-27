import { ApiError } from "app/openapi";

export function transformApiResponse<T>(p: Promise<T>): Promise<T> {
  return p.then(res => res, err => {
    if (err instanceof ApiError) {
      return Promise.reject(new Error(err.body));
    } else {
      return Promise.reject(err);
    }
  });
}
