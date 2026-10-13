export interface LabelBox {
  id: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Labels appear only once the globe is close enough, and overlapping ones drop out. */
export const LABEL_MIN_ZOOM = 3.6;

/**
 * Greedy screen-space collision. Earlier boxes win, so a stable sort
 * (selected pin first, then title) keeps the result predictable.
 */
export function visibleLabelIds(boxes: LabelBox[], gap = 6): Set<string> {
  const placed: LabelBox[] = [];
  const visible = new Set<string>();
  boxes.forEach((box) => {
    const blocked = placed.some((other) => overlaps(box, other, gap));
    if (blocked) return;
    placed.push(box);
    visible.add(box.id);
  });
  return visible;
}

function overlaps(a: LabelBox, b: LabelBox, gap: number): boolean {
  return !(
    a.right + gap < b.left ||
    b.right + gap < a.left ||
    a.bottom + gap < b.top ||
    b.bottom + gap < a.top
  );
}
