import { useQuery } from '@tanstack/react-query'
import { request, type Command, type Tag } from '../api'

export function useCommands() {
  return useQuery({
    queryKey: ['commands'],
    queryFn: () => request<Command[]>('/commands'),
  })
}

export function useTags() {
  return useQuery({
    queryKey: ['tags'],
    queryFn: () => request<Tag[]>('/tags'),
  })
}
