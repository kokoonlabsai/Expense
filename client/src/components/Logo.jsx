// Jellyfish mark, drawn in a 24-unit box: glossy scalloped bell + four flowing tentacles.
export const BELL = 'M4.6 11.6C4.6 7.3 7.9 4.2 12 4.2s7.4 3.1 7.4 7.4q-1.23 1.5 -2.47 0q-1.23 1.5 -2.47 0q-1.23 1.5 -2.47 0q-1.23 1.5 -2.47 0q-1.23 1.5 -2.47 0q-1.23 1.5 -2.47 0Z';
export const SHINE = 'M8.2 9.4c.5-1.7 1.9-2.8 3.6-3';
export const TENTACLES = 'M7.4 13.5c0 1.3-.8 1.8-.8 3s.8 1.6.8 2.6M10.5 13.7c0 1.5-.8 2-.8 3.3s.8 1.9.8 3.1 -.8 1.4 -.8 1.4M13.5 13.7c0 1.5-.8 2-.8 3.3s.8 1.9.8 3.1 -.8 1.4 -.8 1.4M16.6 13.5c0 1.3-.8 1.8-.8 3s.8 1.6.8 2.6';

export function JellyfishGlyph({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d={BELL} fill="#fff" fillOpacity=".95" />
      <path d={SHINE} stroke="#E5489B" strokeOpacity=".35" strokeWidth="1.2" strokeLinecap="round" fill="none" />
      <path d={TENTACLES} stroke="#fff" strokeWidth="1.5" strokeLinecap="round" fill="none" opacity=".92" />
    </svg>
  );
}

export function BrandMark({ size = 34 }) {
  return (
    <span className="brand-mark" style={{ width: size, height: size }}>
      <JellyfishGlyph size={size * 0.8} />
    </span>
  );
}
