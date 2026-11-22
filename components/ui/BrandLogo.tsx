import Image from 'next/image';

// Logo Capiste (symbole et nom). Rapport largeur/hauteur du fichier : 790 × 312.
export default function BrandLogo({ height = 32, priority = false }: { height?: number; priority?: boolean }) {
  return (
    <Image src="/brand/logo-capiste.svg" alt="Capiste" width={Math.round((height * 790) / 312)} height={height}
      priority={priority} unoptimized />
  );
}
