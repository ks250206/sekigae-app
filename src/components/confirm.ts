import type { ReactNode } from "react";
import { create } from "zustand";

export interface ConfirmOptions {
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

interface ConfirmState {
  open: boolean;
  options: ConfirmOptions | null;
  resolve: ((v: boolean) => void) | null;
}

export const useConfirmStore = create<ConfirmState>()(() => ({
  open: false,
  options: null,
  resolve: null,
}));

/** Promise ベースの確認ダイアログ。`if (await confirm({...})) {...}` */
export function confirm(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    useConfirmStore.getState().resolve?.(false);
    useConfirmStore.setState({ open: true, options, resolve });
  });
}
