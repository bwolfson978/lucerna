import { ReactNode } from "react";

interface CardProps {
  children: ReactNode;
  recommended?: boolean;
  className?: string;
}

export function Card({ children, recommended, className = "" }: CardProps) {
  return (
    <div
      className={`
        ${recommended ? "card-recommended" : "card"}
        ${className}
      `}
    >
      {recommended && (
        <span className="absolute -top-3 left-4 bg-accent-light text-accent-hover text-[11px] font-medium px-2 py-0.5 rounded">
          Recommended
        </span>
      )}
      {children}
    </div>
  );
}
