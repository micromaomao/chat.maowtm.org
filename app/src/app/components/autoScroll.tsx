import React, { RefObject, useContext, useEffect, useState } from "react";

interface P {
  onUserScroll?: ((is_at_bottom: boolean) => void) | null;
  containerRef: RefObject<HTMLDivElement>;
  children: React.ReactNode;
}

const signalContext = React.createContext<(obj: any) => void | null>(null);

export default function AutoScrollComponent({ onUserScroll, containerRef, children }: P): JSX.Element {
  const [keepAtBottom, setKeepAtBottom] = useState<boolean>(true);
  const forceUpdate = useState({})[1];
  const [hook, setHook] = useState<(() => void) | null>(null);

  useEffect(() => {
    let container = containerRef.current;
    if (!container) return;

    function onScrollHandler() {
      let is_at_bottom = container.scrollHeight - container.clientHeight < container.scrollTop + 1;
      setKeepAtBottom(is_at_bottom);
      if (onUserScroll) onUserScroll(is_at_bottom);
    }

    container.addEventListener("scroll", onScrollHandler);
    onScrollHandler();
    setHook(onScrollHandler);
    let interval = setInterval(onScrollHandler, 1000);
    return () => {
      container.removeEventListener("scroll", onScrollHandler);
      clearInterval(interval);
      setHook(null);
    };
  }, [containerRef.current, onUserScroll]);

  useEffect(() => {
    if (!keepAtBottom) return;
    if (!containerRef.current) return;

    function resizeHandler() {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }

    window.addEventListener("resize", resizeHandler);

    return () => {
      window.removeEventListener("resize", resizeHandler);
    };
  }, [keepAtBottom, containerRef.current])

  useEffect(() => {
    if (keepAtBottom && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
    if (hook) {
      hook();
    }
  });
  return (
    <signalContext.Provider value={forceUpdate}>
      {children}
    </signalContext.Provider>
  );
}

export function useAutoScrollUpdateSignal() {
  let signal = useContext(signalContext);
  return () => {
    if (signal) {
      signal({});
    }
  };
}
