"use client";

import type { ReactNode } from "react";
import { useInView } from "@/hooks/useInView";
import { Reveal } from "@/components/common/Reveal";
import { cn } from "@/lib/utils";

const GROW = "transition-transform duration-700 ease-[cubic-bezier(0.2,0.7,0.2,1)]";

/** Three "why waiting costs you" cards, each with a mini chart that draws on scroll. */
export function WhyItMatters() {
  return (
    <section id="why" className="px-default pb-[72px] sm:px-7 lg:pb-[110px]">
      <div className="mx-auto max-w-wide">
        <Reveal as="span" className="mb-3.5 block font-mono text-[13px] tracking-[0.1em] text-sage">
          Why it matters
        </Reveal>
        <Reveal as="h2" delay={1} className="display-heading max-w-[640px] text-display">
          Three ways the tax code
          <br />
          <em>punishes waiting.</em>
        </Reveal>
        <div className="mt-12 grid grid-cols-1 gap-[22px] md:grid-cols-3">
          <ConceptCard
            delay={0}
            title="The RMD tax torpedo"
            body="At 73 or 75, depending on birth year, the IRS requires withdrawals whether you need the money or not. They stack on top of Social Security and push you into brackets you never chose."
            chart={(on) => <RmdMini on={on} />}
          />
          <ConceptCard
            delay={1}
            title="The IRMAA cliff"
            body={
              <>
                One dollar over a Medicare income threshold raises your premiums for the whole year.
                Conversions need to land <em>under</em> the cliffs, not near them.
              </>
            }
            chart={(on) => <IrmaaMini on={on} />}
          />
          <ConceptCard
            delay={2}
            title="The widow's penalty"
            body="When one spouse dies, the survivor files single: similar income, roughly half the bracket space. Converting while joint brackets still apply can protect the survivor."
            chart={(on) => <WidowMini on={on} />}
          />
        </div>
      </div>
    </section>
  );
}

function ConceptCard({
  title,
  body,
  chart,
  delay,
}: {
  title: string;
  body: ReactNode;
  chart: (on: boolean) => ReactNode;
  delay: number;
}) {
  const [ref, inView] = useInView<HTMLDivElement>(0.4);
  return (
    <Reveal delay={delay}>
      <div
        ref={ref}
        className="group h-full rounded-[20px] border border-border bg-white px-7 py-[30px] transition-[transform,box-shadow] duration-300 hover:-translate-y-[5px] hover:shadow-card-hover"
      >
        <div className="rounded-xl border border-border bg-paper p-3.5">{chart(inView)}</div>
        <h4 className="mb-2.5 mt-4 font-serif text-[1.35rem] font-semibold">{title}</h4>
        <p className="text-[15px] text-text-secondary">{body}</p>
      </div>
    </Reveal>
  );
}

function RmdMini({ on }: { on: boolean }) {
  const bars = [
    { x: 30, h: 25, ember: false },
    { x: 74, h: 25, ember: false },
    { x: 118, h: 25, ember: false },
    { x: 162, h: 25, ember: false },
    { x: 206, h: 77, ember: true },
    { x: 250, h: 85, ember: true },
  ];
  return (
    <svg viewBox="0 0 300 112" width="100%" aria-hidden="true">
      <line x1="20" y1="95" x2="290" y2="95" stroke="#cfc9ba" strokeWidth="1.5" />
      {bars.map((b, i) => (
        <rect
          key={b.x}
          x={b.x}
          y={95 - b.h}
          width="34"
          height={b.h}
          rx="4"
          fill={b.ember ? "#f26522" : "#66a183"}
          opacity={i === 5 ? 0.65 : 1}
          className={cn(GROW, "group-hover:scale-y-[1.04]")}
          style={{
            transformBox: "fill-box",
            transformOrigin: "bottom",
            transform: on ? "scaleY(1)" : "scaleY(0)",
            transitionDelay: `${i * 90}ms`,
          }}
        />
      ))}
      <text
        x="245"
        y="109"
        textAnchor="middle"
        fontFamily="Inter, sans-serif"
        fontSize="10"
        fontWeight="700"
        fill="#c2410c"
      >
        RMDs hit
      </text>
    </svg>
  );
}

function IrmaaMini({ on }: { on: boolean }) {
  return (
    <svg viewBox="0 0 300 112" width="100%" aria-hidden="true">
      <line x1="20" y1="95" x2="290" y2="95" stroke="#cfc9ba" strokeWidth="1.5" />
      <path
        d="M30,80 L140,80 L140,45 L270,45"
        fill="none"
        stroke="#1b4332"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={1}
        strokeDasharray="1"
        style={{
          strokeDashoffset: on ? 0 : 1,
          transition: "stroke-dashoffset 1.2s cubic-bezier(0.2,0.7,0.2,1)",
        }}
      />
      {on && <circle cx="140" cy="80" r="6" fill="#f26522" opacity="0.5" className="pulse-ring" />}
      <circle
        cx="140"
        cy="80"
        r="5"
        fill="#f26522"
        style={{ opacity: on ? 1 : 0, transition: "opacity 400ms 600ms" }}
      />
      <text
        x="140"
        y="109"
        textAnchor="middle"
        fontFamily="Inter, sans-serif"
        fontSize="10"
        fontWeight="700"
        fill="#c2410c"
      >
        $1 over the threshold
      </text>
      <text x="205" y="34" fontFamily="Inter, sans-serif" fontSize="10" fill="#737373">
        premiums jump
      </text>
    </svg>
  );
}

function WidowMini({ on }: { on: boolean }) {
  const draw = (delay: number) => ({
    strokeDashoffset: on ? 0 : 1,
    transition: `stroke-dashoffset 1.2s cubic-bezier(0.2,0.7,0.2,1) ${delay}ms`,
  });
  return (
    <svg viewBox="0 0 300 112" width="100%" aria-hidden="true">
      <line x1="20" y1="95" x2="290" y2="95" stroke="#cfc9ba" strokeWidth="1.5" />
      <path
        d="M30,86 L270,86"
        stroke="#66a183"
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
        pathLength={1}
        strokeDasharray="1"
        style={draw(0)}
      />
      <path
        d="M30,86 L150,86 L270,50"
        stroke="#f26522"
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
        pathLength={1}
        strokeDasharray="1"
        style={draw(400)}
      />
      <text
        x="272"
        y="42"
        textAnchor="end"
        fontFamily="Inter, sans-serif"
        fontSize="10"
        fontWeight="700"
        fill="#c2410c"
      >
        tax rate filing single
      </text>
      <text
        x="272"
        y="80"
        textAnchor="end"
        fontFamily="Inter, sans-serif"
        fontSize="10"
        fill="#2d6a4f"
      >
        filing jointly
      </text>
    </svg>
  );
}
