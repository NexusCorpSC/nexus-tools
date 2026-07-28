export const NOTE_CONTENT_MAX_LENGTH = 20000;

// Each user owns a single note ("scratch pad"), exposed to client components
export interface Note {
  content: string;
  updatedAt: string | null; // ISO string, null when never saved
}

export const EMPTY_NOTE: Note = {
  content: "",
  updatedAt: null,
};
