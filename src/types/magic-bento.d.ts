// MagicBento (JavaScript + CSS variant from React Bits) — ambient types
declare module "@/components/maris/MagicBento" {
  import type { ComponentType } from "react";

  export interface MagicBentoProps {
    textAutoHide?: boolean;
    enableStars?: boolean;
    enableSpotlight?: boolean;
    enableBorderGlow?: boolean;
    disableAnimations?: boolean;
    spotlightRadius?: number;
    particleCount?: number;
    enableTilt?: boolean;
    glowColor?: string;
    clickEffect?: boolean;
    enableMagnetism?: boolean;
  }

  const MagicBento: ComponentType<MagicBentoProps>;
  export default MagicBento;
}
