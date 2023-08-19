import { Router } from "express";

export default function PromiseRouter() {
  let router = Router();
  return new Proxy(router, {
    get(target, p, receiver) {
      if (["get", "put", "post", "del", "delete", "use"].includes(p as string)) {
        let handlers_start = 1;
        if (p === "use") {
          handlers_start = 0;
        }
        return function (...args: any[]) {
          for (let i = handlers_start; i < args.length; i++) {
            let old_handler = args[i];
            if (typeof old_handler == "function") {
              args[i] = function (req: any, res: any, next: any) {
                let maybe_promise = old_handler(req, res, next);
                if (maybe_promise && maybe_promise.catch) {
                  maybe_promise.catch(err => next(err));
                }
              }
            }
          }
          target[p](...args);
        }
      }
    },
  })
}
