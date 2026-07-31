"use client";

import { useRef } from "react";

/** Frosted-glass card with a subtle hover-lift effect.
 *  Must be a Client Component because it attaches pointer event handlers. */
export function GlassCard({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const handleEnter = () => {
    if (!ref.current) return;
    ref.current.style.transform = "translateY(-3px)";
    ref.current.style.boxShadow =
      "0 2px 8px rgba(0,0,0,0.07), 0 20px 60px rgba(0,0,0,0.10)";
  };

  const handleLeave = () => {
    if (!ref.current) return;
    ref.current.style.transform = "translateY(0)";
    ref.current.style.boxShadow = "";
  };

  return (
    <div
      ref={ref}
      className={`card-glass ${className}`}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      style={{ transition: "box-shadow 0.3s ease, transform 0.3s ease" }}
    >
      {children}
    </div>
  );
}
