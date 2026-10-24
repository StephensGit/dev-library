import { tagColor } from './tagColors';

type TagBadgeProps = {
  name: string;
};

export function TagBadge({ name }: TagBadgeProps) {
  return (
    <span className="tag-badge">
      <span className="tag-dot" style={{ background: tagColor(name) }} />
      {name}
    </span>
  );
}
