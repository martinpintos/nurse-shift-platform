"use client";

import { useEffect, useState } from "react";

/** A section counts as current once its top is within this distance of the viewport top. */
const OFFSET = 120;

/**
 * The id of the section the reader is looking at: the last one whose top has scrolled past
 * the top of the viewport, or the last section once the page is scrolled to the bottom.
 */
export function useScrollSpy(ids: readonly string[]): string | undefined {
  const [current, setCurrent] = useState<string | undefined>(ids[0]);
  const key = ids.join(" ");

  useEffect(() => {
    const sectionIds = key.split(" ");
    let frame = 0;
    const measure = () => {
      frame = 0;
      const atBottom =
        window.innerHeight + window.scrollY >=
        document.documentElement.scrollHeight - 2;
      let next = sectionIds[0];
      for (const id of sectionIds) {
        const element = document.getElementById(id);
        if (element && element.getBoundingClientRect().top <= OFFSET) next = id;
      }
      if (atBottom && window.scrollY > 0) next = sectionIds.at(-1);
      setCurrent(next);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [key]);

  return current;
}
