import { create } from "zustand";

export interface ChoiceOption<T extends string = string> {
  value: T;
  label: string;
  description?: string;
  destructive?: boolean;
}

export interface ChoiceRequest<T extends string = string> {
  title: string;
  description?: string;
  options: ChoiceOption<T>[];
}

interface ChoiceState {
  request: ChoiceRequest | null;
  resolve: ((v: string | null) => void) | null;
}

export const useChoiceStore = create<ChoiceState>()(() => ({ request: null, resolve: null }));

/** 選択肢ダイアログ（ChoiceHost が描画）。キャンセルで null */
export function choose<T extends string>(request: ChoiceRequest<T>): Promise<T | null> {
  return new Promise((resolve) => {
    useChoiceStore.getState().resolve?.(null);
    useChoiceStore.setState({
      request: request as ChoiceRequest,
      resolve: resolve as (v: string | null) => void,
    });
  });
}

export function answerChoice(value: string | null) {
  const { resolve } = useChoiceStore.getState();
  useChoiceStore.setState({ request: null, resolve: null });
  resolve?.(value);
}
