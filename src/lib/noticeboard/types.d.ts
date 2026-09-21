import type { EditorState } from "prosemirror-state";
export type Mark = { type: string; attrs?: { size?: number; color?: string } };
export type Inline = { type: string; text?: string; marks?: Mark[] };
export type Document = {
  type: string;
  attrs: { fontId: string };
  content: { type: string; content?: Inline[] }[];
};
export type Entry = {
  id: string;
  dateKey: string;
  revision: number;
  saved: Document | null;
  draft: Document | null;
  deletedAt: number | null;
  updatedAt?: number;
  savedText?: string;
  draftText?: string;
  hasSaved?: boolean;
  hasDraft?: boolean;
};
export type Command = { type: string; [key: string]: any };
export type Repository = {
  execute(command: Command): Promise<any>;
  readDate(key: string): Promise<Entry | null>;
  list(): Promise<Entry[]>;
  trashList(): Promise<Entry[]>;
};
export type DateSession = {
  key: string;
  id: string;
  revision: number;
  saved: Document | null;
  doc: Document;
  version: number;
  persisted: number;
  exists: boolean;
  everContent: boolean;
  editor: EditorState | null;
  uncertain: { command: Command; version?: number } | null;
};
