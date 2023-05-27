"use client"

import { createContext, useContext, useDebugValue, useState } from "react";

const ctx = createContext<{ state: any, setState: any } | null>(null);

export function SharedStateProvider({ children, sessionStorageId }: {
  children: React.ReactNode,
  sessionStorageId?: string
}) {
  const [state, setState] = useState(() => {
    if (typeof sessionStorageId !== "undefined" && typeof window !== "undefined") {
      const storedState = sessionStorage.getItem(sessionStorageId);
      if (storedState) {
        return JSON.parse(storedState);
      }
    }
    return {};
  });
  let newSetState = setState;
  if (typeof sessionStorageId !== "undefined" && typeof window !== "undefined") {
    newSetState = (arg: any) => {
      setState((oldState: any) => {
        const newState = typeof arg === "function" ? arg(oldState) : arg;
        sessionStorage.setItem(sessionStorageId, JSON.stringify(newState));
        return newState;
      });
    };
  }
  return (
    <ctx.Provider value={{ state, setState: newSetState }}>
      {children}
    </ctx.Provider>
  )
}

export function useSharedState<T = any>(id: string | symbol, initialValue: T): [T, (newState: T) => void] {
  if (!useContext(ctx)) {
    throw new Error("useSharedState must be used inside a SharedStateProvider");
  }
  const { state, setState } = useContext(ctx)!;
  let retState: T;
  if (typeof state[id] === "undefined") {
    retState = initialValue;
  } else {
    retState = state[id] as T;
  }
  if (process.env.NODE_ENV === "development") {
    useDebugValue(`useSharedState(${String(id)}) = ${JSON.stringify(retState)}`);
  }
  return [retState, (newState: T) => {
    setState((state: any) => {
      if (state[id] === newState) {
        return state;
      }
      return Object.assign({}, state, { [id]: newState });
    });
  }];
}
