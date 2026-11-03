export function hexToRgba(hex: string, alpha: number): string {
  const match = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex);
  if (!match) return `rgba(230, 232, 238, ${Math.min(1, Math.max(0, alpha))})`;

  const [, red = 'e6', green = 'e8', blue = 'ee'] = match;
  const opacity = Math.min(1, Math.max(0, alpha));
  return `rgba(${Number.parseInt(red, 16)}, ${Number.parseInt(green, 16)}, ${Number.parseInt(blue, 16)}, ${opacity})`;
}
