import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// Expose `vi` as `jest` so @testing-library/react's waitFor can detect fake
// timers (it gates on `typeof jest !== 'undefined'`) and call
// `jest.advanceTimersByTime` internally while polling.
(globalThis as unknown as { jest: typeof vi }).jest = vi;
