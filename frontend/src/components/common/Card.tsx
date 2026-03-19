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
        hover:shadow-card-hover transition-shadow duration-150
        ${className}
      `}
    >
      {recommended && (
        <span className="absolute -top-3 left-4 bg-accent-light text-accent-hover text-[11px] font-medium px-2.5 py-0.5 rounded-md">
          Recommended
        </span>
      )}
      {children}
    </div>
  );
}
