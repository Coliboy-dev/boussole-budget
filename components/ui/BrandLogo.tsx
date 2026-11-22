import Image from 'next/image';

// Logo Capiste (symbole et nom). Rapport largeur/hauteur du fichier : 302,5 × 76.
export default function BrandLogo({ height = 32, priority = false }: { height?: number; priority?: boolean }) {
  return (
    <Image src="/brand/logo-capiste.svg" alt="Capiste" width={Math.round((height * 302.5) / 76)} height={height}
      priority={priority} unoptimized />
  );
}
