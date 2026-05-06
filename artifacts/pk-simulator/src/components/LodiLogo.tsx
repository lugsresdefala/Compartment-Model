interface LodiLogoProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

const HEIGHTS = {
  sm: "h-8 sm:h-10",
  md: "h-12 sm:h-14",
  lg: "h-32 sm:h-40 md:h-48",
};

export function LodiLogo({ size = "md", className = "" }: LodiLogoProps) {
  const src = `${import.meta.env.BASE_URL}lodi-logo${size === "lg" ? "-large" : ""}.png`;
  return (
    <img
      src={src}
      alt="L.O.D.I. — Lógica da Dose Individualizada para Hormonização"
      className={`${HEIGHTS[size]} w-auto select-none lodi-logo-img ${className}`}
      draggable={false}
    />
  );
}
