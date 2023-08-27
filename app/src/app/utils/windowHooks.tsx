import { useState, useEffect } from "react";

export function useWindowSize(): { width: number, height: number } {
  // Can't use useSyncExternalStore because we can't return a fresh object on

  const [size, setSize] = useState({ width: window.innerWidth, height: window.innerHeight });

  useEffect(() => {
    const callback = () => setSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", callback);
    return () => window.removeEventListener("resize", callback);
  }, []);

  return size;
}
