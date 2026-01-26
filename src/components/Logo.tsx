"use client";

import React, { useEffect, useState } from "react";

type LogoProps = React.ImgHTMLAttributes<HTMLImageElement> & {
  lightSrc?: string;
  darkSrc?: string;
  alt?: string;
};

const THEME_KEY = "theme";

export default function Logo({
  lightSrc = "/logo.png",
  darkSrc = "/logo-branco-e-vermelho-1.svg",
  alt = "Control iD",
  ...rest
}: LogoProps) {
  const getInitial = () => {
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

  const [isDark, setIsDark] = useState<boolean>(getInitial);

  useEffect(() => {
    const root = document.documentElement;

    // Observe changes on the <html> class (to react to theme toggles)
    const mo = new MutationObserver(() => {
      setIsDark(root.classList.contains("dark"));
    });
    mo.observe(root, { attributes: true, attributeFilter: ["class"] });

    // Also listen for storage changes (theme toggled in another tab)
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

  const src = isDark ? darkSrc : lightSrc;

  return <img src={src} alt={alt} {...rest} />;
}