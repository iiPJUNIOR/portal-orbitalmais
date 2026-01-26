"use client";

import React, { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type LogoProps = React.ImgHTMLAttributes<HTMLImageElement> & {
  lightSrc?: string;
  darkSrc?: string;
  alt?: string;
  forceWhite?: boolean; // when true, prefer darkSrc or apply filter to make the image appear white
};

const THEME_KEY = "theme";

export default function Logo({
  lightSrc = "/logo.png",
  darkSrc = "/logo-branco-e-vermelho-1.svg",
  alt = "Control iD",
  className,
  forceWhite = false,
  ...rest
}: LogoProps) {
  const getInitialIsDark = () => {
    try {
      const stored = localStorage.getItem(THEME_KEY);
      if (stored === "dark") return true;
      if (stored === "light") return false;
    } catch {
      // ignore
    }
    try {
      return document.documentElement.classList.contains("dark");
    } catch {
      return false;
    }
  };

  const [isDark, setIsDark] = useState<boolean>(getInitialIsDark);

  useEffect(() => {
    const root = document.documentElement;

    const mo = new MutationObserver(() => {
      setIsDark(root.classList.contains("dark"));
    });

    mo.observe(root, { attributes: true, attributeFilter: ["class"] });

    const onStorage = (e: StorageEvent) => {
      if (e.key === THEME_KEY) {
        setIsDark(e.newValue === "dark");
      }
    };
    window.addEventListener("storage", onStorage);

    return () => {
      mo.disconnect();
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  // If forceWhite is requested, prefer darkSrc (often a white SVG).
  // If no darkSrc is available, use lightSrc but apply a CSS filter to visually turn it white.
  const chosenSrc = forceWhite ? (darkSrc || lightSrc) : (isDark ? darkSrc : lightSrc);
  const needsFilter = forceWhite && !darkSrc;

  // Tailwind filter utilities: use 'filter invert brightness-0' to make a raster image appear white.
  const filterClass = needsFilter ? "filter invert brightness-0" : "";

  return (
    <img
      src={chosenSrc}
      alt={alt}
      className={cn("inline-block", className ?? "", filterClass)}
      {...rest}
    />
  );
}