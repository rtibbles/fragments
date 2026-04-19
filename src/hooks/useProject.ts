import { useCallback, useEffect, useRef, useState } from "react";
import { EMPTY_PROJECT, type ProjectState } from "../types/project";
import type { Citation } from "../types/citation";

export const PROJECT_STORAGE_KEY = "fragments:project";
const DEBOUNCE_MS = 500;

function readFromStorage(): { state: ProjectState; error: Error | null } {
  try {
    const raw = window.localStorage.getItem(PROJECT_STORAGE_KEY);
    if (!raw) return { state: EMPTY_PROJECT, error: null };
    const parsed = JSON.parse(raw) as ProjectState;
    return { state: parsed, error: null };
  } catch (err) {
    return { state: EMPTY_PROJECT, error: err as Error };
  }
}

export function useProject() {
  const [project, setProject] = useState<ProjectState>(() => readFromStorage().state);
  const [storageError, setStorageError] = useState<Error | null>(() => readFromStorage().error);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const persist = useCallback((next: ProjectState) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      try {
        window.localStorage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(next));
        setStorageError(null);
      } catch (err) {
        setStorageError(err as Error);
      }
    }, DEBOUNCE_MS);
  }, []);

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  const setTitle = useCallback((title: string) => {
    setProject((prev) => {
      const next = { ...prev, title };
      persist(next);
      return next;
    });
  }, [persist]);

  const setContentJson = useCallback((contentJson: string) => {
    setProject((prev) => {
      const next = { ...prev, contentJson };
      persist(next);
      return next;
    });
  }, [persist]);

  const setCitations = useCallback((citations: Citation[]) => {
    setProject((prev) => {
      const next = { ...prev, citations };
      persist(next);
      return next;
    });
  }, [persist]);

  return { project, setTitle, setContentJson, setCitations, storageError };
}
