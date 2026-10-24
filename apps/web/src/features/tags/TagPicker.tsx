import { useState } from 'react'
import type { Tag } from '../../api/api'
import { useCreateTag } from '../../api/mutations/tags'
import { tagColor } from './tagColors'

type TagPickerProps = {
  tags: Tag[]
  selectedIds: number[]
  onChange: (tagIds: number[]) => void
}

export function TagPicker({ tags, selectedIds, onChange }: TagPickerProps) {
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const createTag = useCreateTag()

  function toggle(tagId: number) {
    onChange(
      selectedIds.includes(tagId)
        ? selectedIds.filter((id) => id !== tagId)
        : [...selectedIds, tagId],
    )
  }

  function closeInput() {
    setAdding(false)
    setNewName('')
    createTag.reset()
  }

  function submitNewTag() {
    const name = newName.trim()

    if (!name) {
      closeInput()
      return
    }

    createTag.mutate(name, {
      onSuccess: (tag) => {
        onChange([...selectedIds, tag.id])
        closeInput()
      },
    })
  }

  return (
    <div>
      <div className="tag-picker">
        {tags.map((tag) => (
          <button
            key={tag.id}
            type="button"
            className="tag-option"
            aria-pressed={selectedIds.includes(tag.id)}
            onClick={() => toggle(tag.id)}
          >
            <span className="tag-dot" style={{ background: tagColor(tag.name) }} />
            {tag.name}
          </button>
        ))}

        {adding ? (
          <input
            className="tag-option tag-new-input"
            autoFocus
            value={newName}
            placeholder="Tag name"
            aria-label="New tag name"
            maxLength={50}
            disabled={createTag.isPending}
            onChange={(event) => {
              setNewName(event.target.value)
              createTag.reset()
            }}
            onBlur={() => {
              if (!newName.trim()) closeInput()
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.metaKey && !event.ctrlKey) {
                // Enter creates the tag instead of submitting the form.
                event.preventDefault()
                submitNewTag()
              }
              if (event.key === 'Escape') {
                // Close just this input, not the whole modal.
                event.preventDefault()
                event.stopPropagation()
                closeInput()
              }
            }}
          />
        ) : (
          <button type="button" className="tag-option tag-new" onClick={() => setAdding(true)}>
            + New tag
          </button>
        )}
      </div>

      {createTag.isError && <p className="field-error">{createTag.error.message}</p>}
    </div>
  )
}
