import { get, set } from "idb-keyval";
import type { BoardState } from "../types";

const KEY = "tiro-board-v1";

export async function loadBoard(): Promise<BoardState | undefined> {
  try {
    return await get<BoardState>(KEY);
  } catch {
    return undefined;
  }
}

let pending: ReturnType<typeof setTimeout> | null = null;

export function saveBoard(state: BoardState) {
  if (pending) clearTimeout(pending);
  return new Promise<void>((resolve) => {
    pending = setTimeout(async () => {
      await set(KEY, state);
      resolve();
    }, 250);
  });
}
