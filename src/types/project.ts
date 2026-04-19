import type { Citation } from "./citation";

export interface ProjectState {
  title: string;
  contentJson: string;
  citations: Citation[];
}

export const EMPTY_PROJECT: ProjectState = {
  title: "Untitled",
  contentJson: JSON.stringify({ type: "doc", content: [] }),
  citations: [],
};
