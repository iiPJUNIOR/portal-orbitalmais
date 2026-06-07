"use client";

import React from "react";
import { cn } from "@/lib/utils";

type LogoProps = React.HTMLAttributes<HTMLDivElement> & {
  forceWhite?: boolean;
};

export default function Logo({ className, forceWhite = false, ...rest }: LogoProps) {
  // Brand colors: Blue (#0c3e7f) and Orange (#f47321)
  const blueColor = forceWhite ? "text-white" : "text-[#0c3e7f] dark:text-[#f47321]";
  const orangeColor = forceWhite ? "text-white/95" : "text-[#f47321] dark:text-white";
  const subtitleColor = forceWhite ? "text-white/60" : "text-neutral-900 dark:text-neutral-300";

  return (
    <div className={cn("flex items-center gap-1.5 font-sans select-none", className)} {...rest}>
      {/* Official Symbol SVG */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 100 100"
        fill="none"
        className="h-9 w-9 shrink-0"
      >
        {/* Blue Open Circle */}
        <path
          d="M 50 15 A 35 35 0 1 1 19.7 32.5"
          stroke={forceWhite ? "#ffffff" : "#0c3e7f"}
          strokeWidth="11"
          strokeLinecap="round"
          fill="none"
          className={forceWhite ? "" : "stroke-[#0c3e7f] dark:stroke-[#f47321]"}
        />
        {/* Orange Tilted Center Bar */}
        <line
          x1="46"
          y1="43"
          x2="29"
          y2="14"
          stroke={forceWhite ? "#ffffff" : "#f47321"}
          strokeWidth="11"
          strokeLinecap="round"
          className={forceWhite ? "" : "stroke-[#f47321] dark:stroke-white"}
        />
      </svg>

      {/* Brand Name and Subtitle */}
      <div className="flex flex-col text-left justify-center">
        <div className="flex items-baseline leading-none font-sans">
          <span className={cn("text-xl font-extrabold tracking-tight", blueColor)}>
            rbital
          </span>
          <span className={cn("text-xl font-medium tracking-tight", orangeColor)}>
            mais
          </span>
        </div>
        <span className={cn("text-[8.5px] font-bold tracking-[0.02em] mt-1 uppercase", subtitleColor)}>
          Tecnologia em Soldagem
        </span>
      </div>
    </div>
  );
}