import { useState, useEffect } from "react";

export function useViewportHeight(): number | undefined {
  const [height, setHeight] = useState<number>();

  useEffect(() => {
    function update() {
      setHeight(window.innerHeight);
    }
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return height;
}
