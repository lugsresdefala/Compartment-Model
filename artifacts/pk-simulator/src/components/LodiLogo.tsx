interface LodiLogoProps {
  size?: "sm" | "md" | "lg";
  showTagline?: boolean;
  className?: string;
}

const SIZES = {
  sm: { letter: "text-lg", tagline: "text-[7px]", pad: "px-3 py-1.5", gap: "gap-0.5" },
  md: { letter: "text-2xl", tagline: "text-[9px]", pad: "px-4 py-2", gap: "gap-1" },
  lg: { letter: "text-5xl sm:text-6xl", tagline: "text-[11px] sm:text-xs", pad: "px-8 py-5", gap: "gap-2" },
};

export function LodiLogo({ size = "md", showTagline = true, className = "" }: LodiLogoProps) {
  const s = SIZES[size];
  return (
    <div className={`relative inline-flex flex-col items-center ${s.gap} ${s.pad} lodi-frame ${className}`}>
      {/* HUD frame corner ticks */}
      <span className="lodi-corner lodi-corner-tl" />
      <span className="lodi-corner lodi-corner-tr" />
      <span className="lodi-corner lodi-corner-bl" />
      <span className="lodi-corner lodi-corner-br" />

      <span
        className={`lodi-text font-display font-extrabold tracking-[0.18em] ${s.letter} leading-none select-none`}
      >
        L.O.D.I.
      </span>
      {showTagline && (
        <span
          className={`lodi-tagline font-display font-medium tracking-[0.22em] uppercase ${s.tagline} text-center`}
        >
          Lógica da Dose Individualizada para Hormonização
        </span>
      )}
    </div>
  );
}
