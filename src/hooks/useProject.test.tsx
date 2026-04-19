import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useProject, PROJECT_STORAGE_KEY } from "./useProject";

beforeEach(() => {
  window.localStorage.clear();
  vi.useRealTimers();
});

describe("useProject", () => {
  it("returns empty project when nothing in storage", () => {
    const { result } = renderHook(() => useProject());
    expect(result.current.project.title).toBe("Untitled");
    expect(result.current.project.citations).toEqual([]);
    expect(result.current.storageError).toBeNull();
  });

  it("loads an existing project from storage on mount", () => {
    window.localStorage.setItem(
      PROJECT_STORAGE_KEY,
      JSON.stringify({
        title: "Saved",
        contentJson: JSON.stringify({ type: "doc", content: [] }),
        citations: [],
      })
    );
    const { result } = renderHook(() => useProject());
    expect(result.current.project.title).toBe("Saved");
  });

  it("setTitle debounces a write to localStorage", async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useProject());
    act(() => { result.current.setTitle("New"); });
    expect(window.localStorage.getItem(PROJECT_STORAGE_KEY)).toBeNull();
    act(() => { vi.advanceTimersByTime(600); });
    const saved = JSON.parse(window.localStorage.getItem(PROJECT_STORAGE_KEY)!);
    expect(saved.title).toBe("New");
    vi.useRealTimers();
  });

  it("setContentJson persists updated content", async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useProject());
    act(() => { result.current.setContentJson('{"type":"doc","content":[1]}'); });
    act(() => { vi.advanceTimersByTime(600); });
    const saved = JSON.parse(window.localStorage.getItem(PROJECT_STORAGE_KEY)!);
    expect(saved.contentJson).toBe('{"type":"doc","content":[1]}');
    vi.useRealTimers();
  });

  it("surfaces quota errors via storageError without crashing", async () => {
    vi.useFakeTimers();
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      const err = new Error("quota"); err.name = "QuotaExceededError"; throw err;
    });
    const { result } = renderHook(() => useProject());
    act(() => { result.current.setTitle("x"); });
    act(() => { vi.advanceTimersByTime(600); });
    await waitFor(() => expect(result.current.storageError).not.toBeNull());
    spy.mockRestore();
    vi.useRealTimers();
  });
});
