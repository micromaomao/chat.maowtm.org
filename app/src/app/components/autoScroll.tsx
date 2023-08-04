import { RefObject, useEffect, useState } from "react";

interface P {
  onUserScroll?: ((is_at_bottom: boolean) => void) | null;
  containerRef: RefObject<HTMLDivElement>;
  children: React.ReactNode;
}

export default function AutoScrollComponent({ onUserScroll, containerRef, children }: P): JSX.Element {
  const [keepAtBottom, setKeepAtBottom] = useState<boolean>(true);

  useEffect(() => {
    let container = containerRef.current;
    if (!container) return;

    function onScrollHandler() {
      let is_at_bottom = container.scrollHeight - container.clientHeight < container.scrollTop + 1;
      setKeepAtBottom(is_at_bottom);
      if (onUserScroll) onUserScroll(is_at_bottom);
    }

    container.addEventListener("scroll", onScrollHandler);

    return () => {
      container.removeEventListener("scroll", onScrollHandler);
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
  });
  return <>{children}</>;
}
