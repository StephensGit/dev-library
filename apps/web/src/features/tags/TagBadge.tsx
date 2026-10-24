import { tagColor } from './tagColors';

type TagBadgeProps = {
  name: string;
  onRemove?: () => void;
};

export function TagBadge({ name, onRemove }: TagBadgeProps) {
  return (
    <span className="tag-badge">
      <span className="tag-dot" style={{ background: tagColor(name) }} />
      {name}
      {onRemove && (
        <button type="button" className="tag-badge-remove" aria-label={`Remove ${name} filter`} onClick={onRemove}>
          ×
        </button>
      )}
    </span>
  );
}
